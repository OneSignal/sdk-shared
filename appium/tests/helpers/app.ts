import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getValue, setValue } from '@wdio/shared-store-service';

import { byTestId, byText, getPlatform, getSdkType, getTestExternalId } from './selectors.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const tooltipContent = JSON.parse(
  readFileSync(resolve(__dirname, '../../../demo/tooltip_content.json'), 'utf-8'),
);

async function stopScrolling() {
  const platform = getPlatform();

  if (platform === 'android') {
    // Android's scrollGesture already completes the gesture. A follow-up tap in
    // the center of the screen can hit interactive elements like LOGIN USER.
    // await driver.pause(150);
    return;
  }

  let x: number;
  let y: number;

  const mainScroll = await byTestId('main_scroll_view');
  const loc = await mainScroll.getLocation();
  const size = await mainScroll.getSize();
  x = Math.round(loc.x + 6);
  y = Math.round(loc.y + size.height / 2);

  await driver.performActions([
    {
      type: 'pointer',
      id: 'finger1',
      parameters: { pointerType: 'touch' },
      actions: [
        { type: 'pointerMove', duration: 0, x, y },
        { type: 'pointerDown', button: 0 },
        { type: 'pause', duration: 100 },
        { type: 'pointerUp', button: 0 },
      ],
    },
  ]);
  await driver.releaseActions();
}

/**
 * Scroll the main content area in the given direction using native scroll APIs.
 * Targets the main_scroll_view element to avoid scrolling the log view.
 */
async function swipeMainContent(
  direction: 'up' | 'down',
  distance: 'small' | 'normal' | 'large' = 'normal',
) {
  const distances = { small: 0.2, normal: 0.5, large: 1.0 };

  const { width, height } = await driver.getWindowSize();
  const swipeArea = height * 0.8;
  const swipeDistance = swipeArea * distances[distance];
  // Coordinates must be integers in WebView contexts (Capacitor/Cordova),
  // where chromedriver enforces W3C `actions` typing strictly. Native
  // UiAutomator2/XCUITest tolerate floats but rounding is harmless there.
  const centerX = Math.round(width / 2);
  const startY = Math.round(direction === 'down' ? height * 0.85 : height * 0.15);
  const endY = Math.round(direction === 'down' ? startY - swipeDistance : startY + swipeDistance);

  // Hard-bound the W3C pointer chain. If we ever end up swiping against a
  // stale/closed WebView window handle (e.g. a leftover IAM banner), the
  // chromedriver `actions` endpoint can stop responding indefinitely. Without
  // this guard a single stuck swipe would consume ~3 minutes per test until
  // wdio's session DELETE timeout fires. A failed swipe naturally surfaces as
  // a test failure via scrollToEl, which is the correct signal.
  const SWIPE_TIMEOUT_MS = 5_000;
  const action = browser
    .action('pointer', { parameters: { pointerType: 'touch' } })
    .move({ x: centerX, y: startY })
    .down()
    .pause(50)
    .move({ duration: 300, x: centerX, y: endY })
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

  await stopScrolling();
}

export async function scrollToTop() {
  await scrollToEl('APP', {
    by: 'text',
    direction: 'up',
  });
}

/**
 * Scroll to the given element. For Flutter, we need to scroll the main content area until the element is visible.
 * For all other platforms, we will just do the same though we could use scrollIntoView.
 * Defer to using by testId for all platforms and avoid getting by text.
 */
export async function scrollToEl(
  identifier: string,
  opts: {
    by?: 'testId' | 'text';
    partial?: boolean;
    direction?: 'up' | 'down';
    maxScrolls?: number;
  } = {},
) {
  const { by = 'testId', partial = false, direction = 'down', maxScrolls = 20 } = opts;
  const finder = (id: string) => (by === 'text' ? byText(id, partial) : byTestId(id));

  for (let i = 0; i < maxScrolls; i++) {
    const el = await finder(identifier);
    if (await el.isDisplayed()) {
      return await scrollExtraIfNeeded(el, () => finder(identifier));
    }
    await swipeMainContent(direction);
  }
  throw new Error(`Element "${identifier}" not found after ${maxScrolls} scrolls`);
}

/**
 * If the element sits in the bottom portion of the viewport, swipe a small
 * amount in the same direction so it lands further into safe territory, then
 * re-fetch the (potentially staled) handle.
 *
 * `scrollIntoView` on native Appium has no notion of centering — it stops the
 * moment the element first becomes visible, which on a downward scroll means
 * the element lands at the bottom edge. Sitting there risks the tap being
 * intercepted by snackbars, keyboard insets, or system gesture areas, and any
 * modal that opens from the tap can race against those overlays before its
 * accessibility tree fully registers.
 */
async function scrollExtraIfNeeded<T extends { getLocation(): Promise<{ y: number }> }>(
  el: T,
  refetch: () => Promise<T>,
  threshold = 0.9,
): Promise<T> {
  try {
    const { y } = await el.getLocation();
    const { height } = await driver.getWindowSize();
    if (y > height * threshold) {
      await swipeMainContent('down', 'small');
      return await refetch();
    }
  } catch {
    /* best-effort: if location read fails, return original ref */
  }
  return el;
}

/**
 * On Android the runtime permission dialog is rendered by a separate process
 * (the permission controller). Polling candidate selectors when no dialog
 * exists produces noisy `WebDriverError: selector "undefined"` warnings for
 * several seconds per `allowNotifications`/`allowLocation` call.
 *
 * Instead, poll the foreground package and only probe the UI tree once the
 * permission controller is actually up. The loop returns as soon as any of
 * the provided selectors resolves to a displayed element, and bails cleanly
 * after the timeout if no dialog ever appears — which covers the "already
 * granted" case that would otherwise spam warnings.
 */
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
      /* ignore transient errors and retry until the deadline */
    }
    await driver.pause(200);
  }
  return false;
}

/**
 * System permission dialogs live under SpringBoard on iOS, so treat them like
 * regular UI and click the expected button if it is visible.
 */
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

/**
 * Tap the system "Allow" button on the notification permission dialog.
 *
 * Must be called while the driver is in NATIVE_APP context (system dialogs
 * are not part of any WebView). `waitForAppReady` calls this before switching
 * to the WebView, so the launch path is already correct.
 */
export async function allowNotifications() {
  if (driver.isIOS) return clickIosPermissionButton('Allow');

  return clickAndroidPermissionButton([
    'id=com.android.permissioncontroller:id/permission_allow_button',
    'id=com.android.packageinstaller:id/permission_allow_button',
    'android=new UiSelector().textMatches("(?i)allow|ok")',
  ]);
}

/**
 * Tap the system "Allow While Using App" button on the location permission
 * dialog. Same NATIVE_APP requirement as `allowNotifications`. For
 * capacitor/cordova specs, switch back with `ensureMainWebViewContext()`
 * afterwards.
 */
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

/**
 * Capacitor and Cordova demos render their entire UI inside a WebView, so
 * `data-testid` queries (CSS selectors) only resolve when the driver is in the
 * `WEBVIEW_*` context. Switch to it once after launch and after any system
 * dialog/IAM that forced us back to NATIVE_APP. No-op for native SDKs.
 */
export async function ensureMainWebViewContext() {
  const sdkType = getSdkType();
  if (sdkType !== 'capacitor' && sdkType !== 'cordova') return;

  await driver.waitUntil(
    async () => {
      const contexts = await driver.getContexts();
      const webview = contexts.find((c) => String(c) !== 'NATIVE_APP');
      if (!webview) return false;
      const current = await driver.getContext();
      if (String(current) !== String(webview)) {
        await driver.switchContext(String(webview));
      }
      return true;
    },
    { timeout: 10_000, timeoutMsg: 'WebView context never became available' },
  );

  // On Android, the OneSignal IAM SDK opens each in-app message in its own
  // WebView window inside the same WEBVIEW_* context. Closing the IAM does
  // NOT detach the window handle -- the next pointer/getWindowSize call still
  // resolves against the (now stale) IAM viewport, which causes swipes to
  // operate on a tiny off-screen region or hang for the full session timeout.
  // Snap to the largest window (the main app fills the screen; IAM banners
  // are small overlays).
  try {
    const handles = await driver.getWindowHandles();
    if (handles.length > 1) {
      let bestHandle = handles[0];
      let bestArea = -1;
      for (const handle of handles) {
        try {
          await driver.switchToWindow(handle);
          const { width, height } = await driver.getWindowSize();
          const area = width * height;
          if (area > bestArea) {
            bestArea = area;
            bestHandle = handle;
          }
        } catch {
          /* ignore handles we can't activate */
        }
      }
      await driver.switchToWindow(bestHandle);
    }
  } catch {
    /* best effort: stale handles are recoverable on the next call */
  }
}

/**
 * Switch to NATIVE_APP context. Used by callers that need to interact with
 * system dialogs/native gestures while a WebView SDK has us parked in
 * `WEBVIEW_*`. Pair with `ensureMainWebViewContext()` once the native step
 * is done. No-op for native SDKs.
 */
export async function switchToNativeContext() {
  const sdkType = getSdkType();
  if (sdkType !== 'capacitor' && sdkType !== 'cordova') return;

  const current = String(await driver.getContext());
  if (current !== 'NATIVE_APP') {
    await driver.switchContext('NATIVE_APP');
  }
}

/**
 * Wait for the app to fully launch and the home screen to be visible.
 *
 * Accepts the notification permission dialog if present. Safe to call multiple
 * times: on iOS the prompt only appears on first launch after install, and
 * `allowNotifications` no-ops when the permission button isn't visible.
 */
export async function waitForAppReady(opts: { skipLogin?: boolean } = {}) {
  const { skipLogin = false } = opts;

  const hasNotifPerm = await getValue('hasNotifPerm');
  if (!hasNotifPerm) {
    await allowNotifications();
    await setValue('hasNotifPerm', true);
  }
  await ensureMainWebViewContext();

  const mainScroll = await byTestId('main_scroll_view');
  await mainScroll.waitForDisplayed({ timeout: 5_000 });

  if (skipLogin) return;

  // Want to login the user so we can clean up/delete its data on the next rerun.
  // `loggedIn` is module-local (worker-scoped) on purpose: each WDIO worker
  // runs in its own Node process and drives one device, so the cache reflects
  // that device's state.
  // Browserstack runs each test in a new session, so we need to set the loggedIn flag to false.
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

/**
 * Tap the login button, enter an external user ID, and confirm.
 */
export async function loginUser(externalUserId: string) {
  const loginButton = await byTestId('login_user_button');
  await loginButton.click();

  const userIdInput = await byTestId('login_user_id_input');
  await userIdInput.waitForDisplayed({ timeout: 5_000 });
  await userIdInput.setValue(externalUserId);

  await confirmModal('singleinput_confirm_button');
}

/**
 * Tap the logout button.
 */
export async function logoutUser() {
  const logoutButton = await byTestId('logout_user_button');
  await logoutButton.click();
}

/**
 * Toggle the push-enabled switch.
 */
export async function togglePushEnabled() {
  const toggle = await byTestId('push_enabled_toggle');
  await toggle.click();
}

/**
 * Tap a modal's confirm button and wait for the modal to dismiss.
 *
 * On Android, RN `Modal` opens in a separate window; querying the underlying
 * activity (e.g. via `scrollToEl`) returns NoSuchElement until the modal's
 * close animation finishes. Using the confirm button as a sentinel — wait
 * until it is no longer displayed — gives a deterministic close signal and
 * removes the timing flake from "click confirm, then immediately interact
 * with what's behind the modal".
 */
export async function confirmModal(buttonTestId: string, timeoutMs = 5_000) {
  const btn = await byTestId(buttonTestId);
  await btn.click();
  // waitForExist refetches by selector each poll; waitForDisplayed would
  // hit stale-element warnings against the dismissed modal's cached id.
  await btn.waitForExist({ timeout: timeoutMs, reverse: true });
}

/**
 * Add a single tag via the UI.
 */
export async function addTag(key: string, value: string) {
  const addButton = await byTestId('add_tag_button');
  await addButton.click();

  const keyInput = await byTestId('tag_key_input');
  await keyInput.waitForDisplayed({ timeout: 5_000 });
  await keyInput.setValue(key);

  const valueInput = await byTestId('tag_value_input');
  await valueInput.setValue(value);

  await confirmModal('tag_confirm_button');
}

/**
 * Assert that a key-value pair is displayed in the UI.
 * Uses `${sectionId}_pair_key_${key}` / `${sectionId}_pair_value_${key}` semantics on PairItem.
 *
 * Keys must be unique within the section (no duplicate keys in one list).
 */
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

/**
 * Lock the iOS screen and wake it to reveal the lock screen (with notifications).
 */
export async function lockScreen() {
  // SpringBoard interaction requires NATIVE_APP context. Hybrid SDKs
  // (Cordova/Capacitor) park the driver in WEBVIEW_*, where -ios predicate
  // queries used by callers (e.g. live-activity probes on the lock screen)
  // would fail. Pair with returnToApp() to restore the WebView context.
  await switchToNativeContext();
  await driver.updateSettings({ defaultActiveApplication: 'com.apple.springboard' });
  await driver.lock();
  await driver.pause(500);

  await driver.execute('mobile: pressButton', { name: 'home' });
  await driver.pause(500);
}

/**
 * Return to the app from SpringBoard / lock screen.
 */
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

  await driver.pause(1_000);
  await ensureMainWebViewContext();
}

/**
 * Wait for a notification to be received.
 *
 * Android: opens the notification shade, verifies the title (and optionally
 * body) are visible, then closes the shade.
 *
 * iOS: swipes down from the top-left to open the notification center,
 * verifies the notification, then returns to the app.
 */
export async function waitForNotification(opts: {
  title: string;
  body?: string;
  timeoutMs?: number;
  expectImage?: boolean;
}) {
  const { title, body, timeoutMs = 30_000, expectImage = false } = opts;
  const platform = getPlatform();

  if (platform === 'android') {
    // Notification shade queries run against SystemUI, which requires the
    // NATIVE_APP context. WebView SDKs (Capacitor/Cordova) are parked in a
    // `WEBVIEW_*` context by `waitForAppReady`, so swap to native for the
    // shade work and restore the WebView at the end.
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
        const image = await $('//android.widget.ImageView');
        await image.waitForDisplayed({ timeout: 5_000 });
      }

      await returnToApp();
    } finally {
      await ensureMainWebViewContext();
    }
    return;
  }

  // iOS: swipe down from the top-left to open notification center
  // (top-right opens Control Center on iOS 16+).
  // Native predicate selectors (`-ios predicate string:...`) only resolve in
  // NATIVE_APP. WebView SDKs (Capacitor/Cordova) are parked in a `WEBVIEW_*`
  // context by `waitForAppReady`, so the predicate query hangs until the
  // command timeout. Swap to native for the shade work and restore on exit.
  await switchToNativeContext();
  try {
    await driver.updateSettings({ defaultActiveApplication: 'com.apple.springboard' });

    await driver.execute('mobile: pressButton', { name: 'home' });
    await driver.pause(1_000);

    const { width, height } = await driver.getWindowSize();
    await driver.performActions([
      {
        type: 'pointer',
        id: 'finger1',
        parameters: { pointerType: 'touch' },
        actions: [
          { type: 'pointerMove', duration: 0, x: Math.round(width * 0.1), y: 5 },
          { type: 'pointerDown', button: 0 },
          { type: 'pause', duration: 100 },
          {
            type: 'pointerMove',
            duration: 500,
            x: Math.round(width * 0.1),
            y: Math.round(height * 0.6),
          },
          { type: 'pointerUp', button: 0 },
        ],
      },
    ]);
    await driver.releaseActions();
    await driver.pause(2_000);

    const predicate = body
      ? `label CONTAINS "${title}" AND label CONTAINS "${body}"`
      : `label CONTAINS "${title}"`;
    const notification = await $(`-ios predicate string:${predicate}`);
    await notification.waitForDisplayed({ timeout: timeoutMs });

    if (expectImage) {
      const location = await notification.getLocation();
      const size = await notification.getSize();
      const startX = Math.round(location.x + size.width * 0.8);
      const endX = Math.round(location.x + size.width * 0.2);
      const centerY = Math.round(location.y + size.height / 2);

      await driver.performActions([
        {
          type: 'pointer',
          id: 'finger1',
          parameters: { pointerType: 'touch' },
          actions: [
            { type: 'pointerMove', duration: 0, x: startX, y: centerY },
            { type: 'pointerDown', button: 0 },
            { type: 'pause', duration: 100 },
            { type: 'pointerMove', duration: 300, x: endX, y: centerY },
            { type: 'pointerUp', button: 0 },
          ],
        },
      ]);
      await driver.releaseActions();
      await driver.pause(300);

      const viewButton = await $(`-ios predicate string:label == "View"`);
      await viewButton.waitForDisplayed({ timeout: 5_000 });
      await viewButton.click();
      await driver.pause(500);

      const image = await $('-ios class chain:**/XCUIElementTypeImage');
      await image.waitForDisplayed({ timeout: 5_000 });
    }

    await returnToApp();
  } finally {
    await ensureMainWebViewContext();
  }
}

export async function checkNotification(opts: {
  buttonId: string;
  title: string;
  body?: string;
  expectImage?: boolean;
}) {
  const clearButton = await scrollToEl('clear_all_button');
  await clearButton.click();

  await driver.pause(1_000);
  const button = await scrollToEl(opts.buttonId, { direction: 'up' });
  await button.click();
  await driver.pause(3_000);
  await waitForNotification({
    title: opts.title,
    body: opts.body,
    expectImage: opts.expectImage,
  });
}

export async function isWebViewVisible() {
  if (getPlatform() === 'ios') {
    const sdk = getSdkType();
    // Capacitor/Cordova park the driver in WEBVIEW_* and the app itself is a
    // WebView, so the original predicate strategy can't be used here. The IAM
    // is exposed as its own WebView context only when isInspectable=YES is set
    // on it (see OSInAppMessageView.m, requires Verbose log level), so >1
    // non-NATIVE context means an IAM is up on top of the app's webview.
    if (sdk === 'capacitor' || sdk === 'cordova') {
      const contexts = await driver.getContexts();
      const nonNative = contexts.filter((c) => String(c) !== 'NATIVE_APP');
      return nonNative.length > 1;
    }
    const webview = await $('-ios predicate string:type == "XCUIElementTypeWebView"');
    return await webview.isExisting();
  }

  const contexts = await driver.getContexts();
  return contexts.some((c) => String(c).includes('WEBVIEW'));
}

/**
 * On Android, Appium pools all IAM webviews under a single WEBVIEW_* context,
 * so closing one IAM doesn't remove the context -- old window handles linger.
 * We iterate window handles to find the one whose <h1> matches the expected title.
 */
async function switchToWebViewContext() {
  const contexts = await driver.getContexts();
  const webviewContext = contexts.find((c) => String(c) !== 'NATIVE_APP');
  if (!webviewContext) return false;
  await driver.switchContext(String(webviewContext));
  return true;
}

async function switchToIAMWebView(expectedTitle: string, timeoutMs: number) {
  if (getPlatform() === 'ios') {
    // On hybrid iOS the app itself is a WebView, so getContexts() returns
    // ["NATIVE_APP", WEBVIEW_<app>, WEBVIEW_<iam>]. Iterate non-NATIVE contexts
    // and pick the one whose <h1> matches the expected title.
    await driver.waitUntil(
      async () => {
        try {
          const contexts = (await driver.getContexts()).map((c) => String(c));
          const nonNative = contexts.filter((c) => c !== 'NATIVE_APP');
          for (const ctx of nonNative) {
            await driver.switchContext(ctx);
            const h1 = await $('h1');
            if ((await h1.isExisting()) && (await h1.getText()) === expectedTitle) {
              return true;
            }
          }
          await driver.switchContext('NATIVE_APP');
          return false;
        } catch {
          return false;
        }
      },
      { timeout: timeoutMs, timeoutMsg: `Could not find IAM with title "${expectedTitle}"` },
    );
    return;
  }

  await driver.waitUntil(
    async () => {
      try {
        if (!(await switchToWebViewContext())) return false;

        for (const handle of await driver.getWindowHandles()) {
          await driver.switchToWindow(handle);
          const h1 = await $('h1');
          if ((await h1.isExisting()) && (await h1.getText()) === expectedTitle) {
            return true;
          }
        }
        await driver.switchContext('NATIVE_APP');
        return false;
      } catch {
        return false;
      }
    },
    { timeout: timeoutMs, timeoutMsg: `Could not find IAM with title "${expectedTitle}"` },
  );
}

export async function checkInAppMessage(opts: {
  buttonId: string;
  expectedTitle: string;
  timeoutMs?: number;
  skipClick?: boolean;
}) {
  const { buttonId, expectedTitle, timeoutMs = 5_000 } = opts;
  if (!opts.skipClick) {
    const button = await scrollToEl(buttonId);
    await button.click();
  }

  await driver.waitUntil(() => isWebViewVisible(), {
    timeout: timeoutMs,
    timeoutMsg: `IAM webview not shown after clicking "${buttonId}"`,
  });
  await driver.pause(1_000);

  await switchToIAMWebView(expectedTitle, timeoutMs);

  const title = await $('h1');
  await title.waitForExist({ timeout: timeoutMs });
  expect(await title.getText()).toBe(expectedTitle);

  const closeButton = await $('.close-button');
  await closeButton.click();

  await driver.switchContext('NATIVE_APP');

  if (getPlatform() === 'ios') {
    await driver.waitUntil(async () => !(await isWebViewVisible()), {
      timeout: timeoutMs,
      timeoutMsg: 'IAM webview still visible after closing',
    });
    await driver.pause(1_000);
  } else {
    await driver.pause(3_000);
  }

  await ensureMainWebViewContext();
}

/**
 * Asserts a transient snackbar/toast appears with the expected text, then waits
 * for it to fully disappear. This prevents the next test from racing against a
 * lingering toast that can intercept taps or block hit-testing on freshly
 * opened modals (e.g. `react-native-toast-message` keeps toasts visible for
 * ~4s by default).
 *
 * Cordova/Capacitor render the toast as `<ion-toast>` (Ionic), whose visible
 * text lives inside the component's shadow root and is not reachable via
 * UiAutomator/XPath. Ionic reflects the `message` prop onto the host element
 * as a `message` attribute, so we match the host directly.
 */
export async function expectSnackbar(text: string, timeoutMs = 5_000) {
  const sdkType = getSdkType();
  if (sdkType === 'cordova' || sdkType === 'capacitor') {
    const escaped = text.replace(/"/g, '\\"');
    const toast = await $(`ion-toast[message="${escaped}"]`);
    await toast.waitForDisplayed({ timeout: timeoutMs });
    return;
  }

  const el = await byText(text);
  await el.waitForDisplayed({ timeout: timeoutMs });
}

export async function checkTooltip(buttonId: string, key: string) {
  const tooltip = tooltipContent[key];

  const infoIcon = await scrollToEl(buttonId);
  await infoIcon.click();

  const titleEl = await byTestId('tooltip_title');
  await titleEl.waitForDisplayed({ timeout: 5_000 });
  const title = await titleEl.getText();
  expect(title).toBe(tooltip.title);

  const descEl = await byTestId('tooltip_description');
  const description = await descEl.getText();
  expect(description).toBe(tooltip.description);

  const okButton = await byTestId('tooltip_ok_button');
  await okButton.click();
}
