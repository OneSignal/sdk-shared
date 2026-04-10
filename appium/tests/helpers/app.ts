import { byTestId, getTestExternalId } from "./selectors.js";

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
