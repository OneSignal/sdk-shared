import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getValue, setValue } from '@wdio/shared-store-service';

import {
  byTestId,
  byTestIdSelector,
  byText,
  getPlatform,
  getSdkType,
  getTestExternalId,
  waitForBackendUser,
  waitForPushSubscriptionReady,
} from './selectors.js';

const PACKAGE_ID = process.env.BUNDLE_ID || 'com.onesignal.sdkdemo';

const __dirname = dirname(fileURLToPath(import.meta.url));
const tooltipContent = JSON.parse(
  readFileSync(resolve(__dirname, '../../../demo/tooltip_content.json'), 'utf-8'),
);

const sdkType = getSdkType();
export const isWebViewSDK = sdkType === 'capacitor' || sdkType === 'cordova';
export const isBrowserStack = Boolean(process.env.BROWSERSTACK_USERNAME);

export function isBrowserStackIos(): boolean {
  return isBrowserStack && getPlatform() === 'ios';
}

const SCROLL_DURATION = 750;
const getScrollContainer = () => byTestId('main_scroll_view');

/** Scroll to a test id using the fastest reliable SDK-specific path. */
export async function scrollToEl(
  identifier: string,
  opts: { direction?: 'up' | 'down'; maxScrolls?: number } = {},
) {
  const { direction = 'down', maxScrolls = 20 } = opts;

  if (isWebViewSDK) {
    const el = await byTestId(identifier);
    await el.waitForExist({ timeout: 10_000 });
    await el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    return el;
  }

  const swipeDirection = direction === 'down' ? 'up' : 'down';
  const scrollable = await getScrollContainer();

  // Chainable selector — lets WDIO re-resolve on each scroll step instead of validating a stale snapshot.
  await $(byTestIdSelector(identifier)).scrollIntoView({
    direction: swipeDirection,
    duration: SCROLL_DURATION,
    maxScrolls,
    percent: 0.25,
    scrollableElement: scrollable, // needed for android
  });

  const el = await byTestId(identifier);
  return nudgeAboveBottomOverlay(identifier, el);
}

type Element = Awaited<ReturnType<typeof byTestId>>;

async function nudgeAboveBottomOverlay(identifier: string, el: Element): Promise<Element> {
  // Skip the rect probe when the snapshot has no id (RN re-rendered after scroll); WDIO would throw past our .catch.
  if (!el.elementId) return el;

  const [loc, size, { height }] = await Promise.all([
    el.getLocation().catch(() => null),
    el.getSize().catch(() => null),
    driver.getWindowSize(),
  ]);
  const bottomOverlayStart = Math.round(height * 0.82);
  if (!loc || !size || size.height <= 0 || loc.y + size.height < bottomOverlayStart) {
    return el;
  }
  await driver.swipe({
    direction: 'up',
    duration: SCROLL_DURATION,
    percent: 0.12,
    scrollableElement: await getScrollContainer(),
  });
  await driver.pause(250);
  return byTestId(identifier);
}

async function clickAndroidPermissionButton(
  selectors: string[],
  timeoutMs = 30_000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const selector of selectors) {
      try {
        const el = await $(selector);
        if (await el.isDisplayed().catch(() => false)) {
          await el.click();
          return true;
        }
      } catch {
        /* try next selector */
      }
    }
    await driver.pause(200);
  }
  return false;
}

/** Tap an iOS system alert button by label, regardless of which process owns the alert. */
async function clickIosPermissionButton(buttonLabel: string, timeoutMs = 10_000) {
  await driver.updateSettings({ defaultActiveApplication: 'com.apple.springboard' });
  try {
    const btn = await $(`~${buttonLabel}`);
    await btn.waitForExist({
      timeout: timeoutMs,
      timeoutMsg: `iOS alert "${buttonLabel}" never appeared`,
    });
    await btn.click();
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
      const webview = contexts.find(isAppWebViewContext);
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

/** Android also lists other apps' WebViews, e.g. Chrome after a launch URL opened it. */
function isAppWebViewContext(context: string): boolean {
  if (context === 'NATIVE_APP') return false;
  return getPlatform() !== 'android' || context.includes(PACKAGE_ID);
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

  // Probing a stale window blocks for the atom timeout, so try the current one first.
  const current = await driver.getWindowHandle().catch(() => undefined);
  const ordered = current ? [current, ...handles.filter((h) => h !== current)] : handles;
  for (const handle of ordered) {
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

/** Switch to NATIVE_APP for system UI. Usually a no-op outside WebView SDKs. */
export async function switchToNativeContext() {
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

/** Type into an input and confirm it stuck; typing right after a modal opens can be dropped. */
export async function fillInput(testId: string, value: string) {
  const input = await byTestId(testId);
  await input.waitForDisplayed({ timeout: 5_000 });
  // UiAutomator2 has no `value` attribute; native Android exposes input text via getText.
  const readsText = getPlatform() === 'android' && !isWebViewSDK;
  await driver.waitUntil(
    async () => {
      await input.setValue(value);
      const typed = readsText ? await input.getText() : await input.getValue();
      return typed === value;
    },
    { timeout: 10_000, interval: 500, timeoutMsg: `Input "${testId}" did not keep "${value}"` },
  );
}

/** Tap a modal confirm button. */
export async function confirmModal(buttonTestId: string) {
  const btn = await byTestId(buttonTestId);
  await btn.click();
}

/** Wait for an element to leave the view hierarchy via chainable lookup, avoiding staleElementReference. */
export async function waitForDisappear(testId: string, timeoutMs = 5_000) {
  await $(byTestIdSelector(testId)).waitForExist({
    timeout: timeoutMs,
    reverse: true,
    timeoutMsg: `Element "${testId}" still displayed after ${timeoutMs}ms`,
  });
}

/** Open a modal and wait for its sentinel element. */
export async function openModal(triggerTestId: string, expectedTestId: string, timeoutMs = 5_000) {
  const open = async () => {
    const trigger = await scrollToEl(triggerTestId);

    // iOS WDA can 500 on a click that actually landed; sentinel below confirms.
    await trigger.click().catch(() => undefined);

    const expected = await byTestId(expectedTestId);
    await expected.waitForDisplayed({ timeout: timeoutMs });
    return expected;
  };

  return open();
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
  const platform = getPlatform();

  if (platform === 'android') {
    // Back would background the app itself if nothing is covering it.
    if ((await getAppState()) !== AppState.RunningInForeground) {
      await driver.pressKeyCode(4);
      await driver.execute('mobile: activateApp', { appId: PACKAGE_ID });
    }
  } else {
    await driver.updateSettings({ defaultActiveApplication: PACKAGE_ID });
    await driver.execute('mobile: activateApp', { bundleId: PACKAGE_ID });
  }

  await ensureMainWebViewContext();
  await driver.pause(1_000);
}

/** Values returned by Appium's `mobile: queryAppState` on both platforms. */
export const AppState = {
  NotRunning: 1,
  RunningInBackgroundSuspended: 2,
  RunningInBackground: 3,
  RunningInForeground: 4,
} as const;

const appIdArgs = () =>
  getPlatform() === 'ios' ? { bundleId: PACKAGE_ID } : { appId: PACKAGE_ID };

export async function getAppState(): Promise<number> {
  return Number(await driver.execute('mobile: queryAppState', appIdArgs()));
}

export async function terminateApp() {
  await driver.execute('mobile: terminateApp', appIdArgs());
}

/**
 * End the app's process the way a user swiping it away from recents does.
 * Android's terminateApp is a force-stop, which blocks FCM delivery and clears
 * posted notifications until the next manual launch, and BrowserStack rejects
 * the shell commands that could kill it otherwise.
 */
export async function killApp() {
  if (getPlatform() === 'ios') {
    await terminateApp();
  } else {
    await swipeAwayFromRecents();
  }
  await driver.waitUntil(async () => (await getAppState()) === AppState.NotRunning, {
    timeout: 10_000,
    interval: 200,
    timeoutMsg: 'App process is still running after being killed',
  });
  if (getPlatform() === 'android') await driver.pressKeyCode(3); // KEYCODE_HOME
}

async function swipeAwayFromRecents() {
  // UiAutomator2 otherwise blocks each action until the launcher's recents
  // animations go idle, which takes seconds.
  const { waitForIdleTimeout } = (await driver.getSettings()) as { waitForIdleTimeout?: number };
  await driver.updateSettings({ waitForIdleTimeout: 0 });
  try {
    await driver.pressKeyCode(187); // KEYCODE_APP_SWITCH, with this app as the focused card
    await driver.waitUntil(async () => (await driver.getCurrentPackage()) !== PACKAGE_ID, {
      timeout: 5_000,
      interval: 100,
      timeoutMsg: 'Recents never opened',
    });
    // The launcher takes focus before the card finishes animating into place.
    await driver.pause(500);
    const { width, height } = await driver.getWindowSize();
    const x = Math.round(width / 2);
    await driver.swipe({
      from: { x, y: Math.round(height * 0.55) },
      to: { x, y: Math.round(height * 0.05) },
      duration: 200,
    });
  } finally {
    await driver.updateSettings({ waitForIdleTimeout: waitForIdleTimeout ?? 10_000 });
  }
}

/** Send the app to the background until something else activates it. */
export async function backgroundApp() {
  await driver.execute('mobile: backgroundApp', { seconds: -1 });
}

/** Tap a notification from the iOS banner or the Android shade, whatever app is in front. */
export async function tapNotification(title: string, timeoutMs = 30_000) {
  await switchToNativeContext();

  if (getPlatform() === 'android') {
    await driver.openNotifications();
    const titleEl = $(`//*[@text="${title}"]`);
    try {
      await titleEl.waitForDisplayed({ timeout: timeoutMs });
    } catch (error) {
      await driver.pressKeyCode(4); // KEYCODE_BACK, closes the shade
      throw error;
    }
    await titleEl.click();
    return;
  }

  await driver.updateSettings({ defaultActiveApplication: 'com.apple.springboard' });
  try {
    const banner = $(`-ios predicate string:label CONTAINS "${title}"`);
    await banner.waitForDisplayed({ timeout: timeoutMs });
    await banner.click();
  } finally {
    await driver.updateSettings({ defaultActiveApplication: PACKAGE_ID });
  }
}

export async function hasLogView(): Promise<boolean> {
  return $(byTestIdSelector('log_view'))
    .isExisting()
    .catch(() => false);
}

/**
 * Text of the demo's log entries, oldest first. Native Android only sees
 * entries on screen, so counts can miss older matches that scrolled away.
 */
export async function getLogMessages(): Promise<string[]> {
  if (isWebViewSDK) {
    return driver.execute(() =>
      Array.from(document.querySelectorAll('[data-testid^="log_entry_"]')).map(
        (el) => el.textContent ?? '',
      ),
    );
  }

  if (getPlatform() === 'ios') {
    return $$('-ios predicate string:name BEGINSWITH "log_entry_"').map((el) => el.getText());
  }

  const entries = $$('android=new UiSelector().resourceIdMatches(".*log_entry_.*")');
  // Flutter Android exposes text labels as content-desc, not text.
  if (sdkType === 'flutter') {
    return entries.map(async (el) => (await el.getAttribute('content-desc')) ?? '');
  }
  return entries.map((el) => el.getText());
}

/** Number of log entries that contain every one of `parts`. */
export async function countLogMessages(...parts: string[]): Promise<number> {
  const messages = await getLogMessages();
  return messages.filter((message) => parts.every((part) => message.includes(part))).length;
}

const USER_CHANGED_LOG = /User changed: onesignalId=([^,\s]+), externalId=(\S+)/;

/** onesignalId from the newest "User changed" log if it's for `externalId` (null = anonymous). */
async function latestUserChange(externalId: string | null) {
  const messages = await getLogMessages().catch(() => []);
  for (let i = messages.length - 1; i >= 0; i--) {
    const match = USER_CHANGED_LOG.exec(messages[i]);
    if (!match) continue;
    return match[1] !== 'null' && match[2] === (externalId ?? 'null') ? match[1] : undefined;
  }
  return undefined;
}

/**
 * Wait for a login/logout to settle: the demo logs a "User changed" for `externalId` (null = anonymous),
 * then the backend has that user. Settling first avoids racing the SDK's user switch on the next call
 * (e.g. a fast logout then login on iOS never fires the user observer). Demos without that log
 * just get `timeoutMs` as a grace period.
 */
export async function waitForIdentityChange(
  { externalId }: { externalId: string | null },
  timeoutMs = 10_000,
) {
  let onesignalId: string | undefined;
  await driver
    .waitUntil(async () => Boolean((onesignalId = await latestUserChange(externalId))), {
      timeout: timeoutMs,
      interval: 500,
    })
    .catch(() => undefined);
  if (!onesignalId) {
    console.info(`No "User changed" log for external_id ${externalId ?? 'null'}`);
    return undefined;
  }
  await waitForBackendUser(onesignalId, externalId);
  return onesignalId;
}

/** Expect exactly one new log entry containing every one of `parts` beyond `baseline`. */
export async function expectOneNewLog(parts: string[], baseline = 0, timeoutMs = 15_000) {
  await driver.waitUntil(async () => (await countLogMessages(...parts)) > baseline, {
    timeout: timeoutMs,
    timeoutMsg: `No new log entry containing ${JSON.stringify(parts)}`,
  });
  // Give a duplicate replay time to land before counting.
  await driver.pause(2_000);
  expect(await countLogMessages(...parts)).toBe(baseline + 1);
}

/**
 * Expand an Android notification row when OEMs keep it collapsed. The chevron
 * lookup is scoped to the ancestor row containing `title`; otherwise a busy
 * shade (e.g. Samsung One UI with Battery/USB above us) matches the topmost
 * expand button instead of ours.
 */
async function expandNotificationRow(title: string): Promise<void> {
  const expandPredicate =
    '@resource-id="android:id/expand_button" or ' +
    'contains(@content-desc,"xpand") or ' +
    'contains(@content-desc,"ollapse")';

  const titleXpath = `//*[@text="${title}"]`;
  const scopedExpandXpath =
    `${titleXpath}/ancestor::android.widget.FrameLayout` +
    `[.//*[${expandPredicate}]][1]` +
    `//*[${expandPredicate}]`;

  const scoped = await $(scopedExpandXpath);
  if (await scoped.isDisplayed().catch(() => false)) {
    await scoped.click();
    return;
  }

  // Last resort: pinch-open the row near its title.
  const row = await $(`${titleXpath}/ancestor::android.widget.FrameLayout[1]`);
  const target = (await row.isDisplayed().catch(() => false)) ? row : await $(titleXpath);
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

      // Tap rather than press back so the click listener fires, matching iOS.
      await titleEl.click();
      await driver.pause(1_000);
    } finally {
      await ensureMainWebViewContext();
    }
    return;
  }

  // iOS banners live under SpringBoard.
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
    await driver.updateSettings({ defaultActiveApplication: PACKAGE_ID });
    await ensureMainWebViewContext();
  }
}

/** Wait for the push ID to be populated. */
export async function waitForInitId(timeoutMs = 30_000): Promise<string> {
  // Later specs start scrolled far down, and scrolling back up to read it is slow.
  const cached = (await getValue('pushId')) as string | undefined;
  if (cached) return cached;

  // Uncached means push hasn't been read this session, so the screen can be above or below it.
  const pushIdEl = await scrollToEl('push_id_value', { direction: 'up' }).catch(() =>
    scrollToEl('push_id_value', { direction: 'down' }),
  );
  await driver.waitUntil(
    async () => {
      const pushId = (await pushIdEl.getText().catch(() => '')).trim();
      return pushId !== '' && pushId !== '—';
    },
    { timeout: timeoutMs, timeoutMsg: 'Notifications not ready.' },
  );
  const pushId = (await pushIdEl.getText()).trim();
  await setValue('pushId', pushId);
  return pushId;
}

export async function checkNotification(opts: {
  buttonId: string;
  title: string;
  body?: string;
  expectImage?: boolean;
}) {
  await waitForPushSubscriptionReady(await waitForInitId());

  const button = await scrollToEl(opts.buttonId);
  await driver.pause(2_000); // small wait to hopefully get image notif early

  const displayLog = ['Notification foregroundWillDisplay:', opts.title];
  const clickLog = ['Notification click:', opts.title];
  const logged = await hasLogView();
  const [displaysBefore, clicksBefore] = logged
    ? await Promise.all([countLogMessages(...displayLog), countLogMessages(...clickLog)])
    : [0, 0];

  await button.click();
  await waitForNotification({
    title: opts.title,
    body: opts.body,
    expectImage: opts.expectImage,
  });

  // Demos without the log view can't report JS events yet.
  if (!logged) return;
  await expectOneNewLog(displayLog, displaysBefore);
  await expectOneNewLog(clickLog, clicksBefore);
}

export async function isWebViewVisible() {
  if (getPlatform() === 'ios' && !isWebViewSDK) {
    const webview = $('-ios predicate string:type == "XCUIElementTypeWebView"');
    return await webview.isExisting();
  }

  return findIamWebView().then(Boolean);
}

const closedIamWindowHandles = new Set<string>();

function isIamCandidateContext(context: string): boolean {
  if (context === 'NATIVE_APP') return false;
  if (getPlatform() !== 'android' || isWebViewSDK) return true;
  return context.includes(PACKAGE_ID);
}

/** Race a driver call against a deadline; iOS WebKit can hang forever on a stale handle. */
async function bounded(fn: () => Promise<unknown>, ms = 5_000): Promise<boolean> {
  try {
    await Promise.race([
      fn(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
    ]);
    return true;
  } catch {
    return false;
  }
}

/** Locate the IAM by walking newest-first across contexts and window handles. */
async function findIamWebView(expectedTitle?: string): Promise<boolean> {
  const contexts = (await driver.getContexts().catch(() => []))
    .map(contextName)
    .filter(isDefined)
    .filter(isIamCandidateContext)
    .reverse();

  for (const context of contexts) {
    if (!(await bounded(() => driver.switchContext(context)))) continue;
    const handles = (await driver.getWindowHandles().catch(() => [])).reverse();
    for (const handle of handles.length ? handles : [null]) {
      if (handle && !expectedTitle && closedIamWindowHandles.has(handle)) continue;
      if (handle && !(await bounded(() => driver.switchToWindow(handle)))) continue;
      if (await hasVisibleIamContent(expectedTitle)) return true;
    }
  }

  if (isWebViewSDK) {
    await ensureMainWebViewContext().catch(() => {});
  } else {
    await driver.switchContext('NATIVE_APP').catch(() => {});
  }
  return false;
}

async function hasVisibleIamContent(expectedTitle?: string): Promise<boolean> {
  return driver
    .execute((titleText?: string) => {
      const title = document.querySelector('h1');
      const isVisible = Boolean(title?.getClientRects().length);
      return isVisible && (!titleText || title?.textContent === titleText);
    }, expectedTitle)
    .catch(() => false);
}

export async function checkInAppMessage(opts: {
  buttonId: string;
  expectedTitle: string;
  skipClick?: boolean;
}) {
  if (!opts.skipClick) {
    const el = await scrollToEl(opts.buttonId);
    await el.click();
  }
  await driver.waitUntil(() => findIamWebView(opts.expectedTitle), {
    timeout: 20_000,
    timeoutMsg: `Could not find IAM with title "${opts.expectedTitle}"`,
  });
  const iamWindowHandle = await driver.getWindowHandle().catch(() => undefined);
  await (await $('.close-button')).click();
  if (iamWindowHandle) closedIamWindowHandles.add(iamWindowHandle);
  await driver.switchContext('NATIVE_APP');
  await waitForIamDismissed();
  await ensureMainWebViewContext();
}

/**
 * Block until the IAM WebView is gone from the native view hierarchy.
 * Without this, the SDK can still be in its "displaying message" state when
 * the next trigger fires, causing the SDK to silently drop the trigger.
 */
async function waitForIamDismissed(timeoutMs = 8_000) {
  if (getPlatform() !== 'android' || isWebViewSDK) return;
  await driver.waitUntil(
    async () => {
      const src = await driver.getPageSource().catch(() => '');
      return !/<android\.webkit\.WebView/.test(src);
    },
    { timeout: timeoutMs, interval: 250, timeoutMsg: 'IAM dismiss did not complete' },
  );
}

/** Assert a snackbar/toast appears with the expected text. */
export async function expectSnackbar(text: string, timeoutMs = 5_000) {
  await switchToNativeContext();
  try {
    const el = await byText(text);
    await el.waitForDisplayed({ timeout: timeoutMs });
  } finally {
    await ensureMainWebViewContext();
  }
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
