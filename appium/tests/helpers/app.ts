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
const isFlutterSDK = sdkType === 'flutter';
const isUnitySDK = sdkType === 'unity';
/**
 * Scroll the main content area in the given direction using native scroll APIs.
 * Targets the main_scroll_view element to avoid scrolling the log view.
 */
async function swipeMainContent(direction: 'up' | 'down', distance: 'small' | 'normal' = 'normal') {
  const distances = { small: 0.2, normal: 0.33 };

  const { width, height } = await driver.getWindowSize();
  const swipeArea = height * 0.8;
  const swipeDistance = swipeArea * distances[distance];
  // Coordinates must be integers in WebView contexts (Capacitor/Cordova),
  // where chromedriver enforces W3C `actions` typing strictly. Native
  // UiAutomator2/XCUITest tolerate floats but rounding is harmless there.
  const centerX = Math.round(width / 2);
  const startY = Math.round(direction === 'down' ? height * 0.85 : height * 0.15);
  const endY = Math.round(direction === 'down' ? startY - swipeDistance : startY + swipeDistance);

  // Slower drag on Flutter stays under the fling threshold; momentum
  // otherwise carries the target past the viewport between polls.
  const moveDurationMs = isFlutterSDK ? 700 : 300;

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
    .move({ duration: moveDurationMs, x: centerX, y: endY })
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
}

/**
 * Scroll to the given testId, returning a handle to the element.
 *
 * Strategy is SDK-specific to avoid the cost and flakiness of full pointer-swipe
 * loops where the driver provides a faster primitive:
 *
 *   - Capacitor / Cordova: DOM `scrollIntoView({block: 'center'})` inside the
 *     WebView. One round-trip, no pointer chain, no chromedriver staleness.
 *   - Native Android (RN, .NET MAUI, expo, native): UiAutomator2's
 *     `UiScrollable.scrollIntoView` walks the first scrollable forward until
 *     the resource-id matches, in a single driver call.
 *   - Native iOS (RN, .NET MAUI, expo, native): pages `main_scroll_view`
 *     downward via XCUITest's directional `mobile: scroll`, checking
 *     visibility between pages.
 *   - Flutter: Skia-canvas rendering means lazy children aren't in the native
 *     a11y tree until they're realised, so neither UiScrollable nor
 *     `mobile: scroll` can find them. Always uses the swipe loop.
 *
 * Native fast paths only run for downward searches. `direction: 'up'` falls
 * through to the swipe loop, which also catches any case where a fast path
 * silently failed to land the element.
 */
export async function scrollToEl(
  identifier: string,
  opts: {
    direction?: 'up' | 'down';
    maxScrolls?: number;
  } = {},
) {
  // Safety net for `direction: 'up'` and any case where a native fast path
  // didn't land the element. Flutter has no fast path and uses slower swipes
  // (see `swipeMainContent`), so it needs a higher cap.
  const { direction = 'down', maxScrolls = isFlutterSDK ? 30 : 20 } = opts;
  const platform = getPlatform();

  if (isWebViewSDK) {
    const el = await byTestId(identifier);
    await el.waitForExist({ timeout: 10_000 });
    await browser.execute(
      (e: HTMLElement) => e.scrollIntoView({ block: 'center', behavior: 'instant' }),
      el,
    );
    return el;
  }

  // Native fast path: pre-warms the scroll view so the loop below either
  // returns immediately or has very little work left.
  if (direction === 'down' && !isFlutterSDK) {
    if (platform === 'android') {
      await tryNativeScrollAndroid(identifier);
    } else {
      await tryNativeScrollIos(identifier);
    }
  }

  for (let i = 0; i < maxScrolls; i++) {
    const el = await byTestId(identifier);
    if (await isVisibleInViewport(el, sdkType)) {
      return await scrollExtraIfNeeded(el, () => byTestId(identifier));
    }
    await swipeMainContent(direction);
    // Let Flutter realize freshly scrolled-in widgets before the next poll.
    if (isFlutterSDK) await driver.pause(250);
  }
  throw new Error(`Element "${identifier}" not found after ${maxScrolls} scrolls`);
}

/**
 * UiAutomator2 `UiScrollable.scrollIntoView` finds the first scrollable
 * container and pages forward until a child's resource-id matches.
 *
 * Resource-id namespacing differs by SDK:
 *   - Flutter / RN / Capacitor / Cordova / Expo: ids are bare (`my_button`).
 *   - .NET MAUI: ids are package-prefixed (`com.onesignal.example:id/my_button`).
 *
 * Appium's `id=` strategy hides this via the `disableIdLocatorAutocompletion`
 * setting (see `wdio.android.conf.ts`), but inline `UiSelector` strings bypass
 * that setting and need the full id directly.
 *
 * Returns a boolean (rather than throwing) so the caller can transparently
 * fall back to the swipe loop when the element isn't reachable forward.
 */
async function tryNativeScrollAndroid(id: string): Promise<boolean> {
  try {
    const fullId =
      sdkType === 'dotnet' ? `${process.env.BUNDLE_ID || 'com.onesignal.example'}:id/${id}` : id;
    const sel =
      `new UiScrollable(new UiSelector().scrollable(true).instance(0))` +
      `.scrollIntoView(new UiSelector().resourceId("${fullId}"))`;
    const result = await $(`android=${sel}`);
    return await result.isExisting();
  } catch {
    return false;
  }
}

/**
 * XCUITest's match-based `mobile: scroll` modes (`predicateString`, `name`,
 * `toVisible`) call WDA's internal `scrollToVisible`, which is hard-capped by
 * `maxScrollCellCount` (default 25). Hitting the cap surfaces as "Failed to
 * perform scroll with visible cell due to max scroll count reached", and the
 * cap is reached *slowly* (~1s per attempt × 25 = ~25s before failure), which
 * is enough to blow the 60s mocha hook budget on deep scroll views.
 *
 * Instead, drive the scroll view directionally and check visibility ourselves
 * between pages. `mobile: scroll { direction }` has no internal cap, each call
 * is ~200ms, and we stop the moment the element appears.
 *
 * `byTestId` on iOS uses accessibility-id, which XCUITest exposes as `name`,
 * so this works for every iOS SDK that lands testIds via accessibility
 * identifiers (RN, .NET MAUI, expo, native iOS — Flutter is skipped by the
 * caller because lazy widgets aren't in the a11y tree to find).
 */
async function tryNativeScrollIos(id: string): Promise<boolean> {
  try {
    const main = await byTestId('main_scroll_view');
    if (!(await main.isExisting())) return false;
    for (let i = 0; i < 30; i++) {
      const el = await byTestId(id);
      if (await el.isDisplayed().catch(() => false)) return true;
      await driver.execute('mobile: scroll', {
        elementId: main.elementId,
        direction: 'down',
      });
    }
    return false;
  } catch {
    return false;
  }
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
/**
 * XCUITest's `isDisplayed` does a hit-test against the standard UIView
 * hierarchy, which doesn't include Flutter-rendered widgets exposed only via
 * the Semantics tree. The element still has a valid frame in the a11y tree,
 * but `_AXVisible` returns false (false negative). For Flutter we fall back
 * to a rect-in-viewport check so we don't scroll past elements that are
 * actually on screen.
 */
async function isVisibleInViewport(
  el: {
    isDisplayed(): Promise<boolean>;
    isExisting(): Promise<boolean>;
    getLocation(): Promise<{ x: number; y: number }>;
    getSize(): Promise<{ width: number; height: number }>;
  },
  sdk: string,
): Promise<boolean> {
  if (await el.isDisplayed().catch(() => false)) return true;
  if (!isFlutterSDK) return false;
  if (!(await el.isExisting().catch(() => false))) return false;
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
  // Coordinate units differ by platform: iOS XCUITest reports points, Android
  // UiAutomator2 reports physical pixels. A fixed pixel threshold (e.g. 100)
  // is enough on iOS but only ~33dp on a density-3 Android phone — well inside
  // a Material Snackbar (48–68dp + 16dp margin, plus a 24dp gesture-bar inset
  // on edge-to-edge devices). 12% of the viewport gives a unit-agnostic safe
  // margin (~96dp on density-3 Android, ~102pt on iPhone) that clears
  // two-line snackbars, gesture bars, and keyboard insets on every device we
  // run on.
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
 * Dismiss the Android soft keyboard if shown, to avoid stale-element
 * warnings caused by the IME's late layout reflow during the next click.
 * Android-only (iOS XCUITest dismisses cleanly on its own). Skipped for
 * WebView SDKs (Capacitor/Cordova) where UiAutomator2's hideKeyboard can't
 * dismiss WebView-hosted inputs and retries for ~10s before throwing.
 */
export async function dismissKeyboard() {
  if (getPlatform() !== 'android') return;
  if (isWebViewSDK) return;
  if (!(await driver.isKeyboardShown())) return;
  try {
    await driver.execute('mobile: hideKeyboard');
  } catch (error) {
    console.error('Error dismissing keyboard', error);
  }
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
  if (!isWebViewSDK) return;

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
  if (!isWebViewSDK) return;

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
  // Generous timeout to accommodate slow cold-starts (notably .NET MAUI on
  // Android, where session creation returns before the app is on screen).
  await mainScroll.waitForDisplayed({ timeout: 30_000 });

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
  const userIdInput = await openModal('login_user_button', 'login_user_id_input');
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
 * Tap a button expected to open a modal/dialog and wait for one of its
 * elements (`expectedTestId`) to appear. On Unity-iOS the first tap is
 * occasionally swallowed when fired right after a previous modal's
 * dismissal animation; if the expected element doesn't show up within
 * `firstTryMs`, re-tap once. Reactive (state-gated), no fixed sleeps.
 */
export async function openModal(triggerTestId: string, expectedTestId: string, firstTryMs = 2_500) {
  const maxAttempts = isUnitySDK && getPlatform() === 'ios' ? 3 : 1;

  for (let attempt = 1; ; attempt++) {
    console.log(`Attempt ${attempt} to open modal "${triggerTestId}"`);
    try {
      const trigger = await scrollToEl(triggerTestId);
      await trigger.click();

      const expected = await byTestId(expectedTestId);
      await expected.waitForExist({ timeout: firstTryMs });
      return expected;
    } catch (err) {
      if (attempt >= maxAttempts) {
        throw new Error(
          `Modal element "${expectedTestId}" not present after ${attempt} tap(s) on "${triggerTestId}": ${err}`,
        );
      }
    }
  }
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

  await driver.execute('mobile: pressButton', { name: 'home' });
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

  await ensureMainWebViewContext();
}

/**
 * Expand a collapsed notification row in the Android shade.
 *
 * AOSP auto-expands a single shade entry; Samsung One UI does not. We try
 * the public framework chevron id first, then a content-desc match, and
 * finally a pinch-open gesture anchored on the title for OEM templates that
 * rename or hide the chevron.
 */
async function expandNotificationRow(title: string): Promise<void> {
  const byId = await $('//*[@resource-id="android:id/expand_button"]');
  if (await byId.isDisplayed().catch(() => false)) {
    await byId.click();
    return;
  }

  // Chevron content-desc varies by locale ("Expand", "Expand button", etc.)
  // but consistently contains "xpand" in English builds; matching on the
  // substring keeps us off brittle exact-string selectors.
  const byDesc = await $('//*[contains(@content-desc, "xpand")]');
  if (await byDesc.isDisplayed().catch(() => false)) {
    await byDesc.click();
    return;
  }

  // Last resort: pinch-open anchored on the notification row to trigger the
  // framework's expand gesture. Works on any OEM template since it doesn't
  // rely on a specific view id. We anchor on the title's nearest sizeable
  // ancestor so the gesture has enough surface to register.
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

/**
 * Wait for a notification to be received.
 *
 * Android: opens the notification shade, verifies the title (and optionally
 * body) are visible, then closes the shade.
 *
 * iOS: asserts against the foreground notification banner that SpringBoard
 * overlays on the app while it's in foreground. No home press, no
 * Notification Center swipe, no lock-screen path. Requires the SDK demo's
 * `notificationWillDisplay` handler to allow display (the OneSignal demos
 * default to this).
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
        // Target the BigPictureStyle attachment specifically. The shade is
        // full of ImageViews (small icon, expand chevron, status bar), so
        // matching by resource-id avoids false positives.
        const image = await $('//*[@resource-id="android:id/big_picture"]');

        // Samsung's One UI keeps shade entries collapsed by default, while
        // AOSP auto-expands a single entry. If the big picture isn't already
        // inflated, expand the row before asserting.
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

  // iOS: query the foreground banner SpringBoard renders over the app.
  // Native predicate selectors (`-ios predicate string:...`) only resolve in
  // NATIVE_APP, and the banner lives in SpringBoard's UI tree, so we point
  // `defaultActiveApplication` at SpringBoard for the query and restore the
  // app on the way out.
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
      // Long-press to expand the banner; the attachment renders as a new
      // XCUIElementTypeImage on top of the existing app icon.
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

    // dismiss the banner
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

  // webview goes through flows really quick so need to pause a bit
  if (isWebViewSDK) await driver.pause(5_000);
  await button.click();
  await waitForNotification({
    title: opts.title,
    body: opts.body,
    expectImage: opts.expectImage,
  });
}

export async function isWebViewVisible() {
  if (getPlatform() === 'ios') {
    // Capacitor/Cordova park the driver in WEBVIEW_* and the app itself is a
    // WebView, so the original predicate strategy can't be used here. The IAM
    // is exposed as its own WebView context only when isInspectable=YES is set
    // on it (see OSInAppMessageView.m, requires Verbose log level), so >1
    // non-NATIVE context means an IAM is up on top of the app's webview.
    if (isWebViewSDK) {
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

// Handles that we've already matched as IAM webviews on Android. After the IAM
// is closed, chromedriver does not detach the handle from getWindowHandles(),
// so we must skip it on subsequent iterations to avoid `switchToWindow` ->
// "no such window" noise (and chromedriver instability when many stale handles
// pile up).
const knownStaleIAMHandles = new Set<string>();

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

        // chromedriver appends new IAM windows to the end and does NOT detach
        // closed-IAM handles from getWindowHandles(). Iterate newest-first and
        // skip handles previously matched/failed -- otherwise switchToWindow
        // on a stale handle emits `no such window` warnings and, when several
        // stale handles pile up, can crash the chromedriver session.
        const candidates = [...(await driver.getWindowHandles())]
          .reverse()
          .filter((h) => !knownStaleIAMHandles.has(h));
        for (const handle of candidates) {
          try {
            await driver.switchToWindow(handle);
          } catch {
            knownStaleIAMHandles.add(handle);
            continue;
          }
          const h1 = await $('h1');
          if ((await h1.isExisting()) && (await h1.getText()) === expectedTitle) {
            knownStaleIAMHandles.add(handle);
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

/**
 * On Flutter the first tap is intermittently swallowed by a leftover IAM
 * container window. If no WebView appears in 2.5s, re-tap.
 */
async function tapIamTrigger(buttonId: string) {
  await (await scrollToEl(buttonId)).click();
  if (getPlatform() === 'android' && !isFlutterSDK) return;
  try {
    await driver.waitUntil(() => isWebViewVisible(), { timeout: 2_500 });
  } catch {
    await (await byTestId(buttonId)).click();
  }
}

export async function checkInAppMessage(opts: {
  buttonId: string;
  expectedTitle: string;
  timeoutMs?: number;
  skipClick?: boolean;
}) {
  const { buttonId, expectedTitle, timeoutMs = 5_000 } = opts;

  if (!opts.skipClick) await tapIamTrigger(buttonId);

  await driver.waitUntil(() => isWebViewVisible(), {
    timeout: timeoutMs,
    timeoutMsg: `IAM webview not shown after clicking "${buttonId}"`,
  });

  await switchToIAMWebView(expectedTitle, timeoutMs);

  const title = await $('h1');
  await title.waitForExist({ timeout: timeoutMs });
  expect(await title.getText()).toBe(expectedTitle);

  await (await $('.close-button')).click();
  await driver.switchContext('NATIVE_APP');

  if (getPlatform() === 'ios') {
    await driver.waitUntil(async () => !(await isWebViewVisible()), {
      timeout: timeoutMs,
      timeoutMsg: 'IAM webview still visible after closing',
    });
    // The IAM container UIView hosting the WKWebView can outlive the WebView
    // itself by a few hundred ms (dismiss animation), intercepting both
    // accessibility hit-tests and pointer events. Wait for the home-screen
    // scroll view to become hit-testable again before returning, so the next
    // step's swipes/queries don't race the teardown.
    if (!isWebViewSDK) {
      const main = await byTestId('main_scroll_view');
      await main.waitForDisplayed({ timeout: timeoutMs }).catch(() => {
        /* best-effort; caller will surface real failure */
      });
    }
  }
  await ensureMainWebViewContext();
}

/**
 * Asserts a transient snackbar/toast appears with the expected text
 *
 * Cordova/Capacitor render the toast as `<ion-toast>` (Ionic), whose visible
 * text lives inside the component's shadow root and is not reachable via
 * UiAutomator/XPath. Ionic reflects the `message` prop onto the host element
 * as a `message` attribute, so we match the host directly.
 */
export async function expectSnackbar(text: string, timeoutMs = 5_000) {
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
  const titleEl = await openModal(buttonId, 'tooltip_title');
  const title = await titleEl.getText();
  expect(title).toBe(tooltip.title);

  const descEl = await byTestId('tooltip_description');
  const description = await descEl.getText();
  expect(description).toBe(tooltip.description);

  const okButton = await byTestId('tooltip_ok_button');
  await okButton.click();
}
