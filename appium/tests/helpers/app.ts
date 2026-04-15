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

  if (platform === 'android') {
    // Android's scrollGesture already completes the gesture. A follow-up tap in
    // the center of the screen can hit interactive elements like LOGIN USER.
    await driver.pause(150);
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
      direction,
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
  const { by = 'testId', partial = false, direction = 'down', maxScrolls = 20 } = opts;
  const finder = (id: string) => (by === 'text' ? byText(id, partial) : byTestId(id));

  for (let i = 0; i < maxScrolls; i++) {
    const el = await finder(identifier);
    if (await el.isDisplayed()) {
      return el;
    }
    await swipeMainContent(direction);
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

async function acceptSystemAlerts(timeoutMs: number): Promise<void> {
  await browser.waitUntil(
    async () => {
      const alertText = await acceptSystemAlert(500);
      return !alertText;
    },
    { timeout: timeoutMs, interval: 500 },
  );
}

/**
 * Wait for the app to fully launch and the home screen to be visible.
 */
export async function waitForAppReady(opts: { skipLogin?: boolean } = {}) {
  const { skipLogin = false } = opts;

  const alertHandled = await browser.sharedStore.get('alertHandled');
  if (!alertHandled) {
    // Accept permission dialogs until the app UI is visible.
    await acceptSystemAlerts(5_000);
    await browser.sharedStore.set('alertHandled', true);
  }

  const mainScroll = await byTestId('main_scroll_view');
  await mainScroll.waitForDisplayed({ timeout: 5_000 });

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

  const userIdInput = await byTestId('login_user_id_input');
  await userIdInput.waitForDisplayed({ timeout: 5_000 });
  await typeInto(userIdInput, externalUserId);

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
 * Type text into an input field. On Flutter Android, setValue is unreliable
 * so we tap the field and use the native `mobile: type` command instead.
 */
export async function typeInto(
  el: { click(): Promise<void>; setValue(value: string): Promise<void> },
  text: string,
) {
  if (getPlatform() === 'android' && getSdkType() === 'flutter') {
    await el.click();
    await driver.execute('mobile: type', { text });
    return;
  }
  await el.setValue(text);
}

/**
 * Add a single tag via the UI.
 */
export async function addTag(key: string, value: string) {
  const addButton = await byTestId('add_tag_button');
  await addButton.click();

  const keyInput = await byTestId('tag_key_input');
  await keyInput.waitForDisplayed({ timeout: 5_000 });
  await typeInto(keyInput, key);

  const valueInput = await byTestId('tag_value_input');
  await typeInto(valueInput, value);

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
      const image = await $('//android.widget.ImageView');
      await image.waitForDisplayed({ timeout: 5_000 });
    }

    await returnToApp();
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
  const clearButton = await scrollToEl('clear_all_button');
  await clearButton.click();

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
  if (getPlatform() === 'ios') {
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
    expect(await switchToWebViewContext()).toBe(true);
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
  } else {
    await driver.pause(3000);
  }
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
