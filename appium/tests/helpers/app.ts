import { byTestId, getPlatform, getTestExternalId } from "./selectors.js";

/**
 * Swipe the main content area (below the log view) in the given direction.
 * Uses W3C touch actions at specific coordinates to avoid scrolling
 * the wrong scrollable container (e.g. the log view's inner list).
 */
async function swipeMainContent(direction: "up" | "down") {
  const { width, height } = await driver.getWindowSize();
  const centerX = Math.round(width / 2);
  const startY = Math.round(direction === "up" ? height * 0.7 : height * 0.3);
  const endY = Math.round(direction === "up" ? height * 0.3 : height * 0.7);

  await driver.performActions([
    {
      type: "pointer",
      id: "finger1",
      parameters: { pointerType: "touch" },
      actions: [
        { type: "pointerMove", duration: 0, x: centerX, y: startY },
        { type: "pointerDown", button: 0 },
        { type: "pause", duration: 100 },
        { type: "pointerMove", duration: 300, x: centerX, y: endY },
        { type: "pointerUp", button: 0 },
      ],
    },
  ]);
  await driver.releaseActions();
}

/**
 * Scroll until a test-ID element appears in the accessibility tree, then
 * return it. Needed for Flutter where off-screen elements aren't in the
 * tree until scrolled into view.
 *
 * Scrolls to the top first, then searches downward.
 */
export async function scrollTo(testId: string, maxScrolls = 10) {
  for (let i = 0; i < maxScrolls; i++) {
    const el = await byTestId(testId);
    if (await el.isExisting()) {
      return el;
    }
    await swipeMainContent("down");
    await driver.pause(300);
  }

  for (let i = 0; i < maxScrolls; i++) {
    const el = await byTestId(testId);
    if (await el.isExisting()) {
      return el;
    }
    await swipeMainContent("up");
    await driver.pause(500);
  }
  throw new Error(`Element "${testId}" not found after ${maxScrolls} scrolls`);
}

/**
 * Wait for the app to fully launch and the home screen to be visible.
 * Uses the log view container as the sentinel element since it's present
 * on the home screen of all demo apps.
 */
export async function waitForAppReady(timeoutMs = 30_000) {
  const logView = await byTestId("log_view_container");
  await logView.waitForDisplayed({ timeout: timeoutMs });

  const testUserId = getTestExternalId();
  const userIdEl = await byTestId("user_external_id_value");
  const sessionUserId = await userIdEl.getText();
  if (sessionUserId !== testUserId) {
    await loginUser(testUserId);
  }
}

/**
 * Tap the login button, enter an external user ID, and confirm.
 */
export async function loginUser(externalUserId: string) {
  const loginButton = await byTestId("login_user_button");
  await loginButton.click();

  const userIdInput = await byTestId("login_user_id_input");
  await userIdInput.waitForDisplayed({ timeout: 5_000 });
  await userIdInput.setValue(externalUserId);

  const confirmButton = await byTestId("login_confirm_button");
  await confirmButton.click();
}

/**
 * Tap the logout button.
 */
export async function logoutUser() {
  const logoutButton = await byTestId("logout_user_button");
  await logoutButton.click();
}

/**
 * Toggle the push-enabled switch.
 */
export async function togglePushEnabled() {
  const toggle = await byTestId("push_enabled_toggle");
  await toggle.click();
}

/**
 * Add a single tag via the UI.
 */
export async function addTag(key: string, value: string) {
  const addButton = await byTestId("add_tag_button");
  await addButton.click();

  const keyInput = await byTestId("multi_pair_key_0");
  await keyInput.waitForDisplayed({ timeout: 5_000 });
  await keyInput.setValue(key);

  const valueInput = await byTestId("multi_pair_value_0");
  await valueInput.setValue(value);

  const confirmButton = await byTestId("multi_pair_confirm_button");
  await confirmButton.click();
}

/**
 * Clear the log view.
 */
export async function clearLogs() {
  const clearButton = await byTestId("log_view_clear_button");
  await clearButton.click();
}

/**
 * Clear all notifications.
 * Android: uses the native clearAllNotifications command.
 * iOS: taps the app's "CLEAR ALL" button since XCUITest has no equivalent.
 */
export async function clearAllNotifications() {
  if (getPlatform() === "android") {
    await driver.execute("mobile: clearAllNotifications", {});
  } else {
    const clearButton = await scrollTo("clear_all_button");
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
export async function waitForNotification(title: string, body?: string, timeoutMs = 15_000) {
  const platform = getPlatform();

  if (platform === "android") {
    await driver.openNotifications();

    const titleEl = await $(`//*[@text="${title}"]`);
    await titleEl.waitForDisplayed({ timeout: timeoutMs });

    if (body) {
      const bodyEl = await $(`//*[@text="${body}"]`);
      await bodyEl.waitForDisplayed({ timeout: 5_000 });
    }

    await driver.pressKeyCode(4);

    const caps = driver.capabilities as Record<string, unknown>;
    const appId = (caps["appPackage"] ?? caps["appium:appPackage"]) as string;
    if (appId) {
      await driver.execute("mobile: activateApp", { appId });
    }
    return;
  }

  // iOS: swipe down from the top-left of the screen to open notification center
  // (top-right opens Control Center on iOS 16+)
  const caps = driver.capabilities as Record<string, unknown>;
  const bundleId = (caps["bundleId"] ?? caps["appium:bundleId"]) as string;

  await driver.execute("mobile: pressButton", { name: "home" });
  await driver.pause(1_000);

  await driver.updateSettings({
    defaultActiveApplication: "com.apple.springboard",
  });
  await driver.pause(500);

  const { width, height } = await driver.getWindowSize();
  await driver.performActions([
    {
      type: "pointer",
      id: "finger1",
      parameters: { pointerType: "touch" },
      actions: [
        { type: "pointerMove", duration: 0, x: Math.round(width * 0.1), y: 5 },
        { type: "pointerDown", button: 0 },
        { type: "pause", duration: 100 },
        {
          type: "pointerMove",
          duration: 500,
          x: Math.round(width * 0.1),
          y: Math.round(height * 0.6),
        },
        { type: "pointerUp", button: 0 },
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

  await driver.execute("mobile: pressButton", { name: "home" });
  await driver.pause(500);

  await driver.updateSettings({ defaultActiveApplication: bundleId });
  await driver.execute("mobile: activateApp", { bundleId });
}


export async function checkNotification(buttonId: string, title: string, body?: string) {
  await clearAllNotifications();
  const button = await scrollTo(buttonId);
  await button.click();
  await driver.pause(3_000);
  await waitForNotification(title, body);
}
