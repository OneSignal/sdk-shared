import { waitForLog } from "./logger.js";
import { byTestId, getPlatform, getTestExternalId } from "./selectors.js";

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
 * Wait for a notification to be received.
 *
 * Android: opens the notification shade, verifies the title (and optionally
 * body) are visible, then closes the shade.
 *
 * iOS: XCUITest can't access the notification center, so we verify receipt
 * via the foreground notification handler log instead.
 */
export async function waitForNotification(
  title: string,
  body?: string,
  timeoutMs = 15_000,
) {
  const platform = getPlatform();

  if (platform === "android") {
    await driver.pause(3_000);
    await driver.execute("mobile: openNotifications", {});

    const titleEl = await $(`//*[@text="${title}"]`);
    await titleEl.waitForDisplayed({ timeout: timeoutMs });

    if (body) {
      const bodyEl = await $(`//*[@text="${body}"]`);
      await bodyEl.waitForDisplayed({ timeout: 5_000 });
    }

    await driver.pressKeyCode(4);
  } else {
    await driver.pause(3_000);

    const caps = driver.capabilities as Record<string, unknown>;
    const bundleId = caps["bundleId"] ?? caps["appium:bundleId"];

    // switch driver context to springboard so gestures target the system UI
    await driver.updateSettings({
      defaultActiveApplication: "com.apple.springboard",
    });

    await driver.execute("mobile: swipe", { direction: "down" });
    await driver.pause(1_000);

    const predicate = body
      ? `label CONTAINS "${title}" AND label CONTAINS "${body}"`
      : `label CONTAINS "${title}"`;
    const notification = await $(`-ios predicate string:${predicate}`);
    await notification.waitForDisplayed({ timeout: timeoutMs });

    // switch back to the app
    await driver.updateSettings({
      defaultActiveApplication: bundleId as string,
    });
    await driver.execute("mobile: activateApp", { bundleId });
  }
}
