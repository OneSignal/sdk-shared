import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getValue, setValue } from '@wdio/shared-store-service';

import { byTestId, byText, getPlatform, getSdkType, getTestExternalId } from './selectors.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const tooltipContent = JSON.parse(
  readFileSync(resolve(__dirname, '../../../demo/tooltip_content.json'), 'utf-8'),
);

const sdkType = getSdkType();
export const isWebViewSDK = sdkType === 'capacitor' || sdkType === 'cordova';
export const isBrowserStack = Boolean(process.env.BROWSERSTACK_USERNAME);
export const isUnitySDK = sdkType === 'unity';
const isFlutterSDK = sdkType === 'flutter';
const isNativeAndroidSDK = sdkType === 'android';

export function isBrowserStackIos(): boolean {
  return isBrowserStack && getPlatform() === 'ios';
}

/** Swipe the main content, not the log panel. */
async function swipeMainContent(direction: 'up' | 'down', distance: 'small' | 'normal' = 'normal') {
  const distances = { small: 0.2, normal: 0.33 };

  const { width, height } = await driver.getWindowSize();
  const swipeArea = height * 0.8;
  const swipeDistance = swipeArea * distances[distance];
  // Round coords for WebViews. Unity swipes in the left gutter to avoid taps.
  const swipeX = isUnitySDK ? 10 : Math.round(width / 2);
  const startY = Math.round(direction === 'down' ? height * 0.85 : height * 0.15);
  const endY = Math.round(direction === 'down' ? startY - swipeDistance : startY + swipeDistance);

  // Slow Flutter drags to avoid fling momentum.
  const moveDurationMs = 300;

  // Bound pointer actions; stale WebView handles can otherwise hang.
  const SWIPE_TIMEOUT_MS = 5_000;
  const action = browser
    .action('pointer', { parameters: { pointerType: 'touch' } })
    .move({ x: swipeX, y: startY })
    .down()
    .pause(50)
    .move({ duration: moveDurationMs, x: swipeX, y: endY })
    .up()
    .perform();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(
            `swipeMainContent perform() exceeded ${SWIPE_TIMEOUT_MS}ms (likely a stale WebView window handle blocking pointer dispatch)`,
          ),
        ),
      SWIPE_TIMEOUT_MS,
    );
  });
  try {
    await Promise.race([action, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (isFlutterSDK) await driver.pause(1000);
}

/** Scroll to a test id using the fastest reliable SDK-specific path. */
export async function scrollToEl(
  identifier: string,
  opts: {
    direction?: 'up' | 'down';
    maxScrolls?: number;
  } = {},
) {
  // Swipe loop is the fallback and handles upward searches.
  const { direction = 'down', maxScrolls = 30 } = opts;

  if (isWebViewSDK) {
    const el = await byTestId(identifier);
    await el.waitForExist({ timeout: 10_000 });
    await browser.execute(
      (e: HTMLElement) => e.scrollIntoView({ block: 'center', behavior: 'instant' }),
      el,
    );
    return byTestId(identifier);
  }

  for (let i = 0; i < maxScrolls; i++) {
    const el = await byTestId(identifier);
    if (await isVisibleInViewport(el)) {
      return await scrollExtraIfNeeded(el, () => byTestId(identifier));
    }
    await swipeMainContent(direction);
  }
  throw new Error(`Element "${identifier}" not found after ${maxScrolls} scrolls`);
}

async function isVisibleInViewport(el: {
  isDisplayed(): Promise<boolean>;
  getLocation(): Promise<{ x: number; y: number }>;
  getSize(): Promise<{ width: number; height: number }>;
}): Promise<boolean> {
  if (await el.isDisplayed().catch(() => false)) return true;
  // Fallback for SDKs whose `isDisplayed` lies (e.g. Flutter on iOS).
  try {
    const [loc, size] = await Promise.all([el.getLocation(), el.getSize()]);
    if (size.width <= 0 || size.height <= 0) return false;
    const { width: winW, height: winH } = await driver.getWindowSize();
    const topMargin = Math.round(winH * 0.07);
    const bottomMargin = Math.round(winH * 0.1);
    return (
      loc.y >= topMargin &&
      loc.y + size.height <= winH - bottomMargin &&
      loc.x >= 0 &&
      loc.x + size.width <= winW
    );
  } catch {
    return false;
  }
}

async function scrollExtraIfNeeded<T extends { getLocation(): Promise<{ y: number }> }>(
  el: T,
  refetch: () => Promise<T>,
): Promise<T> {
  // Nudge edge-visible elements away from snackbars and system gestures.
  try {
    const { y } = await el.getLocation();
    const { height } = await driver.getWindowSize();
    const threshold = Math.round(height * 0.12);
    if (y < threshold) {
      await swipeMainContent('up', 'small');
      return await refetch();
    }
    if (y > height - threshold) {
      await swipeMainContent('down', 'small');
      return await refetch();
    }
  } catch {
    /* best-effort */
  }
  return el;
}

/** Android permission dialogs live in a separate foreground package. */
const ANDROID_PERMISSION_PACKAGES = new Set([
  'com.android.permissioncontroller',
  'com.google.android.permissioncontroller',
  'com.android.packageinstaller',
]);

async function clickAndroidPermissionButton(
  selectors: string[],
  timeoutMs = 10_000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const pkg = await driver.getCurrentPackage();
      if (ANDROID_PERMISSION_PACKAGES.has(pkg)) {
        for (const selector of selectors) {
          const el = await $(selector);
          if (await el.isDisplayed().catch(() => false)) {
            await el.click();
            return true;
          }
        }
      }
    } catch {
      /* retry until deadline */
    }
    await driver.pause(200);
  }
  return false;
}

/** Click an iOS SpringBoard permission button if present. */
async function clickIosPermissionButton(buttonLabel: string, timeoutMs = 10_000) {
  await driver.updateSettings({ defaultActiveApplication: 'com.apple.springboard' });
  try {
    const button = await $(
      `-ios class chain:**/XCUIElementTypeButton[\`label == "${buttonLabel}"\`]`,
    );
    try {
      await button.waitForDisplayed({ timeout: timeoutMs });
      await button.click();
      return true;
    } catch {
      return false;
    }
  } finally {
    await driver.updateSettings({ defaultActiveApplication: 'auto' });
  }
}

/** Tap the notification permission allow button if present. */
export async function allowNotifications() {
  if (driver.isIOS) return clickIosPermissionButton('Allow');

  return clickAndroidPermissionButton([
    'id=com.android.permissioncontroller:id/permission_allow_button',
    'id=com.android.packageinstaller:id/permission_allow_button',
    'android=new UiSelector().textMatches("(?i)allow|ok")',
  ]);
}

/** Tap the location permission allow button if present. */
export async function allowLocation() {
  if (driver.isIOS) return clickIosPermissionButton('Allow While Using App');

  return clickAndroidPermissionButton([
    'id=com.android.permissioncontroller:id/permission_allow_foreground_only_button',
    'id=com.android.permissioncontroller:id/permission_allow_one_time_button',
    'id=com.android.permissioncontroller:id/permission_allow_button',
    'id=com.android.packageinstaller:id/permission_allow_button',
    'android=new UiSelector().textMatches("(?i)while using the app|only this time|allow")',
  ]);
}

/** Switch hybrid SDKs back to their main WebView context. */
export async function ensureMainWebViewContext() {
  if (!isWebViewSDK) return;

  await driver.waitUntil(
    async () => {
      const contexts = (await driver.getContexts()).map(contextName).filter(isDefined);
      const webview = contexts.find((c) => c !== 'NATIVE_APP');
      if (!webview) return false;
      const current = contextName(await driver.getContext());
      if (current !== webview) {
        await driver.switchContext(webview);
      }
      return switchToMainWebViewWindow();
    },
    { timeout: 10_000, timeoutMsg: 'WebView context never became available' },
  );
}

function contextName(context: unknown): string | undefined {
  if (typeof context === 'string') return context;
  if (typeof context === 'object' && context !== null) {
    const id = Reflect.get(context, 'id');
    if (typeof id === 'string') return id;
  }
  return undefined;
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

async function switchToMainWebViewWindow(): Promise<boolean> {
  const handles = await driver.getWindowHandles().catch(() => []);
  if (handles.length === 0) return true;

  if (handles.length === 1) {
    await driver.switchToWindow(handles[0]).catch(() => {});
    return true;
  }

  for (const handle of handles) {
    try {
      await driver.switchToWindow(handle);
      const main = $('[data-testid="main_scroll_view"]');
      if (await main.isExisting().catch(() => false)) return true;
    } catch {
      /* ignore stale IAM windows */
    }
  }
  return false;
}

/** Switch hybrid SDKs to native context for system UI. */
export async function switchToNativeContext() {
  if (!isWebViewSDK) return;

  const current = contextName(await driver.getContext());
  if (current !== 'NATIVE_APP') {
    await driver.switchContext('NATIVE_APP');
  }
}

/** Wait for launch, permissions, and home-screen readiness. */
export async function waitForAppReady(opts: { skipLogin?: boolean } = {}) {
  const { skipLogin = false } = opts;

  const hasNotifPerm = await getValue('hasNotifPerm');
  if (!hasNotifPerm) {
    await allowNotifications();
    await setValue('hasNotifPerm', true);
  }
  await ensureMainWebViewContext();

  const mainScroll = await byTestId('main_scroll_view');
  // .NET Android can return a session before the app is ready.
  await mainScroll.waitForDisplayed({ timeout: 30_000 });

  if (skipLogin) return;

  // Keep cleanup addressable by logging into the test user once per worker.
  const loggedIn = await getValue('loggedIn');
  if (!loggedIn) {
    const testUserId = getTestExternalId();
    const userIdEl = await scrollToEl('user_external_id_value', { direction: 'up' });
    const sessionUserId = await userIdEl.getText();
    if (sessionUserId !== testUserId) {
      await loginUser(testUserId);
    }
    await setValue('loggedIn', true);
  }
}

/** Login through the app UI. */
export async function loginUser(externalUserId: string) {
  const userIdInput = await openModal('login_user_button', 'login_user_id_input');
  await userIdInput.setValue(externalUserId);
  await confirmModal('singleinput_confirm_button');
}

/** Logout through the app UI. */
export async function logoutUser() {
  const logoutButton = await byTestId('logout_user_button');
  await logoutButton.click();
}

/** Tap a modal confirm button. */
export async function confirmModal(buttonTestId: string) {
  const btn = await byTestId(buttonTestId);
  await btn.click();
}

export async function waitForDisappear(testId: string, timeoutMs = 5_000) {
  await browser.waitUntil(
    async () => {
      const el = await byTestId(testId);
      return !(await el.isDisplayed().catch(() => false));
    },
    {
      timeout: timeoutMs,
      timeoutMsg: `Element "${testId}" still displayed after ${timeoutMs}ms`,
    },
  );
}

/** Open a modal and wait for its sentinel element. */
export async function openModal(triggerTestId: string, expectedTestId: string, timeoutMs = 5_000) {
  const open = async () => {
    const trigger = await scrollToEl(triggerTestId);
    if (isUnitySDK) await waitForStablePosition(trigger);

    await trigger.click();

    const expected = await byTestId(expectedTestId);
    await expected.waitForDisplayed({ timeout: timeoutMs });
    return expected;
  };

  if (!isUnitySDK) return open();
  return retryOnce(open);
}

async function retryOnce<T>(fn: () => Promise<T>, delayMs = 250): Promise<T> {
  try {
    return await fn();
  } catch {
    await driver.pause(delayMs);
    return fn();
  }
}

async function waitForStablePosition(
  el: { getLocation(): Promise<{ x: number; y: number }> },
  timeoutMs = 1_000,
  pollMs = 100,
) {
  let prev: number | null = null;
  let stableHits = 0;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const loc = await el.getLocation().catch(() => null);
    if (loc && prev !== null && Math.abs(loc.y - prev) < 1) {
      if (++stableHits >= 2) return;
    } else {
      stableHits = 0;
    }
    prev = loc ? loc.y : null;
    await driver.pause(pollMs);
  }
}

/** Assert a unique key-value pair appears in a section. */
export async function expectPairInSection(sectionId: string, key: string, value: string) {
  await scrollToEl(`${sectionId}_section`, { direction: 'up' });

  const keyEl = await byTestId(`${sectionId}_pair_key_${key}`);
  await keyEl.waitForDisplayed({ timeout: 5_000 });
  const keyText = await keyEl.getText();
  expect(keyText).toContain(key);

  const valueEl = await byTestId(`${sectionId}_pair_value_${key}`);
  const valueText = await valueEl.getText();
  expect(valueText).toContain(value);
}

/** Lock and wake iOS to reveal lock-screen notifications. */
export async function lockScreen() {
  // SpringBoard queries require native context.
  await switchToNativeContext();
  await driver.updateSettings({ defaultActiveApplication: 'com.apple.springboard' });
  await driver.lock();

  await driver.execute('mobile: pressButton', { name: 'home' });
}

/** Return to the app from system UI. */
export async function returnToApp() {
  const caps = driver.capabilities as Record<string, unknown>;
  const platform = getPlatform();

  if (platform === 'android') {
    await driver.pressKeyCode(4);
    const appId = (caps['appPackage'] ?? caps['appium:appPackage']) as string;
    if (appId) {
      await driver.execute('mobile: activateApp', { appId });
    }
  } else {
    const bundleId = (caps['bundleId'] ?? caps['appium:bundleId']) as string;
    await driver.updateSettings({ defaultActiveApplication: bundleId });
    await driver.execute('mobile: activateApp', { bundleId });
  }

  await ensureMainWebViewContext();

  // Wait for Unity's focus bridge to refresh driver caches.
  if (isUnitySDK) {
    const root = await byTestId('main_scroll_view');
    await root.waitForDisplayed({ timeout: 3_000 });
  }
}

/** Expand an Android notification row when OEMs keep it collapsed. */
async function expandNotificationRow(title: string): Promise<void> {
  const byId = await $('//*[@resource-id="android:id/expand_button"]');
  if (await byId.isDisplayed().catch(() => false)) {
    await byId.click();
    return;
  }

  // Match "Expand" variants without relying on exact text.
  const byDesc = await $('//*[contains(@content-desc, "xpand")]');
  if (await byDesc.isDisplayed().catch(() => false)) {
    await byDesc.click();
    return;
  }

  // Last resort: pinch-open the row near its title.
  const row = await $(`//*[@text="${title}"]/ancestor::android.widget.FrameLayout[1]`);
  const target = (await row.isDisplayed().catch(() => false))
    ? row
    : await $(`//*[@text="${title}"]`);
  if (!(await target.isDisplayed().catch(() => false))) return;
  await driver
    .execute('mobile: pinchOpenGesture', {
      elementId: target.elementId,
      percent: 0.75,
    })
    .catch(() => {});
}

/** Wait for a notification in Android shade or iOS foreground banner. */
export async function waitForNotification(opts: {
  title: string;
  body?: string;
  timeoutMs?: number;
  expectImage?: boolean;
}) {
  const { title, body, timeoutMs = 30_000, expectImage = false } = opts;
  const platform = getPlatform();

  if (platform === 'android') {
    // SystemUI queries require native context.
    await switchToNativeContext();
    try {
      await driver.openNotifications();

      const titleEl = await $(`//*[@text="${title}"]`);
      await titleEl.waitForDisplayed({ timeout: timeoutMs });

      if (body) {
        const bodyEl = await $(`//*[@text="${body}"]`);
        await bodyEl.waitForDisplayed({ timeout: 5_000 });
      }

      if (expectImage) {
        // Target the BigPictureStyle image, not any shade ImageView.
        const image = await $('//*[@resource-id="android:id/big_picture"]');

        // Some OEMs keep rows collapsed.
        if (!(await image.isDisplayed().catch(() => false))) {
          await expandNotificationRow(title);
        }

        await image.waitForDisplayed({ timeout: 5_000 });
      }

      await returnToApp();
    } finally {
      await ensureMainWebViewContext();
    }
    return;
  }

  // iOS banners live under SpringBoard.
  const caps = driver.capabilities as Record<string, unknown>;
  const bundleId = (caps['bundleId'] ?? caps['appium:bundleId']) as string;
  await switchToNativeContext();
  try {
    await driver.updateSettings({ defaultActiveApplication: 'com.apple.springboard' });

    const predicate = body
      ? `label CONTAINS "${title}" AND label CONTAINS "${body}"`
      : `label CONTAINS "${title}"`;
    const banner = await $(`-ios predicate string:${predicate}`);
    await banner.waitForDisplayed({ timeout: timeoutMs });

    if (expectImage) {
      // Attachment appears as an extra image after expanding.
      const before = await driver.findElements('-ios class chain', '**/XCUIElementTypeImage');
      await driver.execute('mobile: touchAndHold', {
        elementId: banner.elementId,
        duration: 1.0,
      });
      await driver.waitUntil(
        async () => {
          const after = await driver.findElements('-ios class chain', '**/XCUIElementTypeImage');
          return after.length > before.length;
        },
        { timeout: 5_000, interval: 250 },
      );
    }

    // Dismiss the banner.
    await banner.click();
  } finally {
    if (bundleId) {
      await driver.updateSettings({ defaultActiveApplication: bundleId });
    }
    await ensureMainWebViewContext();
  }
}

export async function checkNotification(opts: {
  buttonId: string;
  title: string;
  body?: string;
  expectImage?: boolean;
}) {
  const button = await scrollToEl(opts.buttonId);

  // Let hybrid SDKs settle before the notification flow.
  if (isWebViewSDK) await driver.pause(3_000);
  await button.click();
  await waitForNotification({
    title: opts.title,
    body: opts.body,
    expectImage: opts.expectImage,
  });
}

export async function isWebViewVisible() {
  if (getPlatform() === 'ios' && !isWebViewSDK) {
    const webview = $('-ios predicate string:type == "XCUIElementTypeWebView"');
    return await webview.isExisting();
  }

  return findIamWebView().then(Boolean);
}

async function switchToIAMWebView(expectedTitle: string, timeoutMs: number) {
  await driver.waitUntil(() => findIamWebView(expectedTitle).then(Boolean), {
    timeout: timeoutMs,
    timeoutMsg: `Could not find IAM with title "${expectedTitle}"`,
  });
}

async function findIamWebView(expectedTitle?: string): Promise<boolean> {
  const restore = async () => {
    if (isWebViewSDK) {
      await ensureMainWebViewContext().catch(() => {});
    } else {
      await driver.switchContext('NATIVE_APP').catch(() => {});
    }
  };

  try {
    const contexts = (await driver.getContexts()).map(contextName).filter(isDefined);
    const webviewContexts = contexts.filter(isIamCandidateContext);

    for (const context of webviewContexts) {
      try {
        await driver.switchContext(context);
        const handles = await driver.getWindowHandles().catch(() => []);
        const candidates =
          handles.length > 0
            ? [...handles].reverse().filter((handle) => !closedIamWindowHandles.has(handle))
            : [undefined];

        for (const handle of candidates) {
          try {
            if (handle) await driver.switchToWindow(handle);
            if (await hasVisibleIamContent(expectedTitle)) return true;
          } catch {
            /* ignore closed/stale IAM windows */
          }
        }
      } catch {
        /* try the next WebView context */
      }
    }
  } catch {
    /* fall through to restore below */
  }

  await restore();
  return false;
}

const closedIamWindowHandles = new Set<string>();

function isIamCandidateContext(context: string): boolean {
  if (context === 'NATIVE_APP') return false;
  if (getPlatform() !== 'android' || isWebViewSDK) return true;
  return context.includes(appPackageName());
}

function appPackageName(): string {
  for (const key of ['appPackage', 'appium:appPackage']) {
    const value = Reflect.get(driver.capabilities, key);
    if (typeof value === 'string' && value) return value;
  }
  return process.env.BUNDLE_ID || 'com.onesignal.example';
}

async function hasVisibleIamContent(expectedTitle?: string): Promise<boolean> {
  const title = $('h1');
  if (!(await title.isExisting().catch(() => false))) return false;
  if (!expectedTitle) return true;
  return (await title.getText().catch(() => '')) === expectedTitle;
}

/** Tap an IAM trigger. */
async function tapIamTrigger(buttonId: string) {
  const el = await scrollToEl(buttonId);
  await el.click();
}

export async function checkInAppMessage(opts: {
  buttonId: string;
  expectedTitle: string;
  timeoutMs?: number;
  skipClick?: boolean;
}) {
  const { buttonId, expectedTitle, timeoutMs = 15_000 } = opts;

  if (!opts.skipClick) await tapIamTrigger(buttonId);

  await driver.waitUntil(() => isWebViewVisible(), {
    timeout: timeoutMs,
    timeoutMsg: `IAM webview not shown after clicking "${buttonId}"`,
  });

  await switchToIAMWebView(expectedTitle, timeoutMs);

  const title = await $('h1');
  await title.waitForExist({ timeout: timeoutMs });
  expect(await title.getText()).toBe(expectedTitle);

  const iamWindowHandle = await driver.getWindowHandle().catch(() => undefined);
  await (await $('.close-button')).click();
  if (iamWindowHandle) {
    closedIamWindowHandles.add(iamWindowHandle);
  }
  await driver.switchContext('NATIVE_APP');

  if (getPlatform() === 'ios') {
    // iOS can keep dismissed IAM WebViews around briefly.
    await driver.waitUntil(async () => !(await isWebViewVisible()), {
      timeout: 15_000,
      timeoutMsg: 'IAM webview still visible after closing',
    });
    // Wait for the app UI to be hit-testable again.
    if (!isWebViewSDK) {
      const main = await byTestId('main_scroll_view');
      await main.waitForDisplayed({ timeout: timeoutMs }).catch(() => {
        /* best-effort */
      });
    }
  }
  await ensureMainWebViewContext();
}

/** Assert a snackbar/toast appears with the expected text. */
export async function expectSnackbar(text: string, timeoutMs = 5_000) {
  if (sdkType === 'cordova' || sdkType === 'capacitor') {
    await browser.waitUntil(
      async () => {
        const toasts = await $$('ion-toast');
        for (const toast of toasts) {
          const message = (await toast.getProperty('message')) as string | null;
          if (message === text && (await toast.isDisplayed())) return true;
        }
        return false;
      },
      { timeout: timeoutMs, timeoutMsg: `toast "${text}" not displayed within ${timeoutMs}ms` },
    );
    return;
  }

  const el = await byText(text);
  await el.waitForDisplayed({ timeout: timeoutMs });
}

export async function checkTooltip(buttonId: string, key: string) {
  const tooltip = tooltipContent[key];
  const titleEl = await openModal(buttonId, 'tooltip_title');
  const title = await titleEl.getText();
  expect(title).toBe(tooltip.title);

  const descEl = await byTestId('tooltip_description');
  const description = await descEl.getText();
  expect(description).toBe(tooltip.description);

  const okButton = await byTestId('tooltip_ok_button');
  await okButton.click();
  await waitForDisappear('tooltip_ok_button');
}

export async function withRetryDelay(ctx: Mocha.Context, delayMs: number, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (err) {
    const testTitle = ctx.test?.fullTitle() ?? 'unknown test';
    console.warn(`Retrying for "${testTitle}"...`);
    const currentRetry: unknown = ctx.test ? Reflect.get(ctx.test, '_currentRetry') : 0;
    const retries: unknown = ctx.test ? Reflect.get(ctx.test, '_retries') : 0;
    if (typeof currentRetry === 'number' && typeof retries === 'number' && currentRetry < retries) {
      await browser.pause(delayMs);
    }
    throw err;
  }
}
