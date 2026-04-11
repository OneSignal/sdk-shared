import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { byTestId, byText, getPlatform, getTestExternalId } from './selectors.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const tooltipContent = JSON.parse(
  readFileSync(resolve(__dirname, '../../../demo/tooltip_content.json'), 'utf-8'),
);

/**
 * Swipe the main content area (below the log view) in the given direction.
 * Uses W3C touch actions at specific coordinates to avoid scrolling
 * the wrong scrollable container (e.g. the log view's inner list).
 */
async function swipeMainContent(direction: 'up' | 'down') {
  const mainScroll = await byTestId('main_scroll_view');
  const location = await mainScroll.getLocation();
  const size = await mainScroll.getSize();

  const centerX = Math.round(location.x + size.width / 2);
  const topY = Math.round(location.y + size.height * 0.3);
  const bottomY = Math.round(location.y + size.height * 0.7);
  const startY = direction === 'up' ? bottomY : topY;
  const endY = direction === 'up' ? topY : bottomY;

  await driver.performActions([
    {
      type: 'pointer',
      id: 'finger1',
      parameters: { pointerType: 'touch' },
      actions: [
        { type: 'pointerMove', duration: 0, x: centerX, y: startY },
        { type: 'pointerDown', button: 0 },
        { type: 'pointerMove', duration: 300, x: centerX, y: endY },
        { type: 'pointerUp', button: 0 },
      ],
    },
  ]);
  await driver.releaseActions();
}

export async function scrollToTop() {
  for (let i = 0; i < 5; i++) {
    const topElement = await byTestId('user_status_value');
    if (await topElement.isDisplayed()) {
      return;
    }
    await swipeMainContent('down');
  }
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
  opts: { by?: 'testId' | 'text'; direction?: 'up' | 'down'; maxScrolls?: number } = {},
) {
  const { by = 'testId', direction = 'up', maxScrolls = 10 } = opts;
  const finder = by === 'text' ? byText : byTestId;

  for (let i = 0; i < maxScrolls; i++) {
    const el = await finder(identifier);
    if (await el.isExisting()) {
      return el;
    }
    await swipeMainContent(direction);
    await driver.pause(500);
  }
  throw new Error(`Element "${identifier}" not found after ${maxScrolls} scrolls`);
}

/**
 * Wait for the app to fully launch and the home screen to be visible.
 * Uses the log view container as the sentinel element since it's present
 * on the home screen of all demo apps.
 */
export async function waitForAppReady(skipLogin = false, timeoutMs = 30_000) {
  const logView = await byTestId('log_view_container');
  await logView.waitForDisplayed({ timeout: timeoutMs });

  const testUserId = getTestExternalId();
  await scrollToTop();

  if (!skipLogin) {
    const userIdEl = await scrollToEl('user_external_id_value');
    const sessionUserId = await userIdEl.getText();
    if (sessionUserId !== testUserId) {
      await loginUser(testUserId);
    }
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

  const keyInput = await byTestId('multi_pair_key_0');
  await keyInput.waitForDisplayed({ timeout: 5_000 });
  await keyInput.setValue(key);

  const valueInput = await byTestId('multi_pair_value_0');
  await valueInput.setValue(value);

  const confirmButton = await byTestId('multi_pair_confirm_button');
  await confirmButton.click();
}

/**
 * Clear the log view.
 */
export async function clearLogs() {
  const clearButton = await byTestId('log_view_clear_button');
  await clearButton.click();
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
 * iOS: goes to the home screen, switches to the SpringBoard context, then
 * uses W3C touch actions (viewport origin) to swipe down and open the
 * notification center. After verifying the notification, it returns to the app.
 */
export async function waitForNotification(opts: {
  title: string;
  body?: string;
  timeoutMs?: number;
  expectImage?: boolean;
}) {
  const { title, body, timeoutMs = 15_000, expectImage = false } = opts;
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

  // iOS: swipe down from the top-left of the screen to open notification center
  // (top-right opens Control Center on iOS 16+)
  const caps = driver.capabilities as Record<string, unknown>;
  const bundleId = (caps['bundleId'] ?? caps['appium:bundleId']) as string;

  await driver.execute('mobile: pressButton', { name: 'home' });
  await driver.pause(1_000);

  await driver.updateSettings({
    defaultActiveApplication: 'com.apple.springboard',
  });
  await driver.pause(500);

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

  await driver.execute('mobile: pressButton', { name: 'home' });
  await driver.pause(500);

  await driver.updateSettings({ defaultActiveApplication: bundleId });
  await driver.execute('mobile: activateApp', { bundleId });
}

export async function checkNotification(opts: {
  buttonId: string;
  title: string;
  body?: string;
  expectImage?: boolean;
}) {
  await clearAllNotifications();
  const button = await scrollToEl(opts.buttonId, { direction: 'down' });
  await button.click();
  await driver.pause(3_000);
  await waitForNotification({
    title: opts.title,
    body: opts.body,
    expectImage: opts.expectImage,
  });
}

export async function checkInAppMessage(opts: {
  buttonLabel: string;
  expectedTitle: string;
  timeoutMs?: number;
}) {
  const { buttonLabel, expectedTitle, timeoutMs = 5_000 } = opts;

  const button = await scrollToEl(buttonLabel, { by: 'text' });
  await button.click();
  await driver.pause(3_000);

  // switch to the webview context
  const contexts = await driver.getContexts();
  const webviewContext = contexts.find((c) => String(c) !== 'NATIVE_APP');
  expect(webviewContext).toBeDefined();
  await driver.switchContext(String(webviewContext));

  // const bodyEl = await $('body');
  // const html = await bodyEl.getHTML();
  // console.log('IAM HTML:', html);

  const title = await $('h1');
  await title.waitForExist({ timeout: timeoutMs });
  const text = await title.getText();
  expect(text).toBe(expectedTitle);

  // close the IAM
  const closeButton = await $('.close-button');
  await closeButton.click();

  await driver.pause(1_000);
  await driver.switchContext('NATIVE_APP');
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
