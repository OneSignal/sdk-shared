import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { byTestId, byText, getPlatform, getSdkType, getTestExternalId } from './selectors.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const tooltipContent = JSON.parse(
  readFileSync(resolve(__dirname, '../../../demo/tooltip_content.json'), 'utf-8'),
);

async function stopScrolling() {
  const platform = getPlatform();

  let x: number;
  let y: number;

  if (platform === 'ios') {
    const mainScroll = await byTestId('main_scroll_view');
    const loc = await mainScroll.getLocation();
    const size = await mainScroll.getSize();
    x = Math.round(loc.x + 6);
    y = Math.round(loc.y + size.height / 2);
  } else {
    const { width, height } = await driver.getWindowSize();
    x = Math.round(width / 2);
    y = Math.round(height / 2);
  }

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
  const platform = getPlatform();
  const invertedDirection = direction === 'up' ? 'down' : 'up';

  if (platform === 'ios') {
    await driver.execute('mobile: swipe', { direction: invertedDirection });
  } else {
    const { width, height } = await driver.getWindowSize();
    await driver.execute('mobile: scrollGesture', {
      left: 0,
      top: Math.round(height * 0.1),
      width,
      height: Math.round(height * 0.8),
      direction: direction === 'up' ? 'down' : 'up',
      percent: distances[distance],
    });
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
 * Scroll until a test-ID element appears in the accessibility tree, then
 * return it. Needed for Flutter where off-screen elements aren't in the
 * tree until scrolled into view.
 *
 * Scrolls to the top first, then searches downward.
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
  const { by = 'testId', partial = false, direction = 'down', maxScrolls = 10 } = opts;
  const finder = (id: string) => (by === 'text' ? byText(id, partial) : byTestId(id));

  for (let i = 0; i < maxScrolls; i++) {
    const el = await finder(identifier);
    if (await el.isDisplayed()) {
      return el;
    }
    await swipeMainContent(direction, 'small');
  }
  throw new Error(`Element "${identifier}" not found after ${maxScrolls} scrolls`);
}

/**
 * Wait for an iOS system alert to appear and return its text without
 * dismissing it. Returns null if no alert appears within the timeout.
 * iOS-only — used by the location spec which needs to accept with a
 * specific button label.
 */
export async function waitForAlert(timeoutMs = 10_000): Promise<string | null> {
  try {
    await driver.waitUntil(
      async () => {
        try {
          const buttons = await driver.execute('mobile: alert', { action: 'getButtons' });
          return Array.isArray(buttons) && buttons.length > 0;
        } catch {
          return false;
        }
      },
      { timeout: timeoutMs, interval: 250 },
    );
    return await driver.getAlertText();
  } catch {
    return null;
  }
}

/**
 * Wait for a native system alert/permission dialog, accept it, and return
 * its text. Returns null if no dialog appears within the timeout.
 *
 * iOS: uses XCUITest `mobile: alert` API.
 * Android: looks for the standard permission dialog "Allow" button via
 * UiAutomator (works for POST_NOTIFICATIONS, location, etc.).
 */
export async function acceptSystemAlert(timeoutMs = 10_000): Promise<string | null> {
  const platform = getPlatform();

  try {
    if (platform === 'ios') {
      const text = await waitForAlert(timeoutMs);
      if (text) await driver.acceptAlert();
      return text;
    }

    const allowBtn = await $('android=new UiSelector().text("Allow")');
    await allowBtn.waitForDisplayed({ timeout: timeoutMs });
    let text = 'Permission dialog';
    try {
      const msgEl = await $(
        'android=new UiSelector().resourceId("com.android.permissioncontroller:id/permission_message")',
      );
      text = await msgEl.getText();
    } catch {
      /* best-effort */
    }
    await allowBtn.click();
    return text;
  } catch {
    return null;
  }
}

/**
 * Wait for the app to fully launch and the home screen to be visible.
 */
export async function waitForAppReady(opts: { skipLogin?: boolean } = {}) {
  const { skipLogin = false } = opts;

  if (getPlatform() === 'android' && getSdkType() === 'flutter') {
    await driver.updateSettings({ disableIdLocatorAutocompletion: true });
  }

  const waitForMainScroll = async () => {
    const mainScroll = await byTestId('main_scroll_view');
    await mainScroll.waitForDisplayed({ timeout: 5_000 });
  };

  const alertHandled = await browser.sharedStore.get('alertHandled');
  if (!alertHandled) {
    // Dismiss permission dialogs until the app UI is visible
    while (await acceptSystemAlert(5_000)) {
      await driver.pause(500);
    }
  }

  const html = await driver.getPageSource();
  console.log(html);

  try {
    await waitForMainScroll();
  } catch {
    while (await acceptSystemAlert(2_000)) {
      await driver.pause(500);
    }
    await waitForMainScroll();
  }

  await browser.sharedStore.set('alertHandled', true);

  if (skipLogin) return;

  // want to login user so we can't clean up/delete user data for the next rerun
  const testUserId = getTestExternalId();
  const loggedIn = await browser.sharedStore.get('loggedIn');
  if (!loggedIn) {
    const userIdEl = await scrollToEl('user_external_id_value', { direction: 'up' });
    const sessionUserId = await userIdEl.getText();
    if (sessionUserId !== testUserId) {
      await loginUser(testUserId);
    }
    await browser.sharedStore.set('loggedIn', true);
  }
}

/**
 * Tap the login button, enter an external user ID, and confirm.
 */
export async function loginUser(externalUserId: string) {
  const loginButton = await byText('LOGIN USER');
  await loginButton.click();

  const html = await driver.getPageSource();
  console.log(html);

  if (getPlatform() === 'android' && getSdkType() === 'flutter') {
    const userIdInput = await byTestId('login_user_id_input');
    await userIdInput.waitForDisplayed({ timeout: 5_000 });
    await userIdInput.click();
    await driver.pause(250);
    await driver.execute('mobile: type', { text: externalUserId });
    const confirmButton = await byText('Login');
    await browser.waitUntil(async () => confirmButton.isEnabled(), {
      timeout: 5_000,
      timeoutMsg: 'Expected Login button to enable',
    });
    await confirmButton.click();
    return;
  }

  const userIdInput = await byTestId('login_user_id_input');
  await userIdInput.waitForDisplayed({ timeout: 5_000 });
  await userIdInput.setValue(externalUserId);

  const confirmButton = await byTestId('login_confirm_button');
  await confirmButton.click();
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

  const confirmButton = await byTestId('tag_confirm_button');
  await confirmButton.click();
}

/**
 * Assert that a key-value pair is displayed in the UI.
 * Uses `${sectionId}_pair_key_${key}` / `${sectionId}_pair_value_${key}` semantics on PairItem.
 *
 * Keys must be unique within the section (no duplicate keys in one list).
 */
export async function expectPairInSection(sectionId: string, key: string, value: string) {
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
  const bundleId = (caps['bundleId'] ?? caps['appium:bundleId']) as string;
  await driver.updateSettings({ defaultActiveApplication: bundleId });
  await driver.execute('mobile: activateApp', { bundleId });
  await driver.pause(1_000);
}

/**
 * Clear all notifications.
 * Android: uses the native clearAllNotifications command.
 * iOS: taps the app's "CLEAR ALL" button since XCUITest has no equivalent.
 */
export async function clearAllNotifications() {
  if (getPlatform() === 'android') {
    await driver.execute('mobile: clearAllNotifications', {});
  } else {
    const clearButton = await scrollToEl('clear_all_button');
    await clearButton.click();
  }
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
    await driver.openNotifications();

    const titleEl = await $(`//*[@text="${title}"]`);
    await titleEl.waitForDisplayed({ timeout: timeoutMs });

    if (body) {
      const bodyEl = await $(`//*[@text="${body}"]`);
      await bodyEl.waitForDisplayed({ timeout: 5_000 });
    }

    if (expectImage) {
      const location = await titleEl.getLocation();
      const size = await titleEl.getSize();
      const centerX = Math.round(location.x + size.width / 2);
      const startY = Math.round(location.y + size.height / 2);
      const endY = startY + 300;

      await driver.performActions([
        {
          type: 'pointer',
          id: 'finger1',
          parameters: { pointerType: 'touch' },
          actions: [
            { type: 'pointerMove', duration: 0, x: centerX, y: startY },
            { type: 'pointerDown', button: 0 },
            { type: 'pause', duration: 100 },
            { type: 'pointerMove', duration: 300, x: centerX, y: endY },
            { type: 'pointerUp', button: 0 },
          ],
        },
      ]);
      await driver.releaseActions();
      await driver.pause(500);

      const image = await $('//android.widget.ImageView');
      await image.waitForDisplayed({ timeout: 5_000 });
    }

    await driver.pressKeyCode(4);

    const caps = driver.capabilities as Record<string, unknown>;
    const appId = (caps['appPackage'] ?? caps['appium:appPackage']) as string;
    if (appId) {
      await driver.execute('mobile: activateApp', { appId });
    }
    return;
  }

  // iOS: swipe down from the top-left to open notification center
  // (top-right opens Control Center on iOS 16+)
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
}

export async function checkNotification(opts: {
  buttonId: string;
  title: string;
  body?: string;
  expectImage?: boolean;
}) {
  await clearAllNotifications();
  await driver.pause(1_000);
  const button = await scrollToEl(opts.buttonId);
  await button.click();
  await driver.pause(3_000);
  await waitForNotification({
    title: opts.title,
    body: opts.body,
    expectImage: opts.expectImage,
  });
}

export async function isWebViewVisible() {
  const platform = getPlatform();
  const webview =
    platform === 'ios'
      ? await $('-ios predicate string:type == "XCUIElementTypeWebView"')
      : await $('android=new UiSelector().className("android.webkit.WebView")');
  return webview.isExisting();
}

export async function checkInAppMessage(opts: {
  buttonLabel: string;
  expectedTitle: string;
  timeoutMs?: number;
  skipClick?: boolean;
}) {
  const { buttonLabel, expectedTitle, timeoutMs = 5_000 } = opts;
  if (!opts.skipClick) {
    const button = await scrollToEl(buttonLabel, { by: 'text' });
    await button.click();
  }

  await driver.waitUntil(() => isWebViewVisible(), {
    timeout: timeoutMs,
    timeoutMsg: `IAM webview not shown after clicking "${buttonLabel}"`,
  });
  await driver.pause(1_000);

  const contexts = await driver.getContexts();
  const webviewContext = contexts.find((c) => String(c) !== 'NATIVE_APP');
  expect(webviewContext).toBeDefined();
  await driver.switchContext(String(webviewContext));

  const title = await $('h1');
  await title.waitForExist({ timeout: timeoutMs });
  const text = await title.getText();
  expect(text).toBe(expectedTitle);

  const closeButton = await $('.close-button');
  await closeButton.click();

  await driver.switchContext('NATIVE_APP');
  await driver.waitUntil(async () => !(await isWebViewVisible()), {
    timeout: timeoutMs,
    timeoutMsg: 'IAM webview still visible after closing',
  });
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

  const okButton = await $('~OK');
  await okButton.click();
}
