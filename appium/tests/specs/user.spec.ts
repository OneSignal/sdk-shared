import { waitForAppReady, loginUser, logoutUser, clearLogs } from "../helpers/app.js";
import { waitForLog } from "../helpers/logger.js";
import { byTestId } from "../helpers/selectors.js";

const TEST_USER_ID = "appium-flutter-ios";

describe("User", () => {
  before(async () => {
    await waitForAppReady();
  });

  it("should start as anonymous", async () => {
    const statusEl = await byTestId("user_status_value");
    const status = await statusEl.getText();
    expect(status).toBe("Anonymous");

    const externalIdEl = await byTestId("user_external_id_value");
    const externalId = await externalIdEl.getText();
    expect(externalId).toBe("–");
  });

  it("can login", async () => {
    await loginUser(TEST_USER_ID);
    await waitForLog(`Login user: ${TEST_USER_ID}`);

    const statusEl = await byTestId("user_status_value");
    const status = await statusEl.getText();
    expect(status).toBe("Logged In");

    const externalIdEl = await byTestId("user_external_id_value");
    const externalId = await externalIdEl.getText();
    expect(externalId).toBe(TEST_USER_ID);
  });

  it("can logout", async () => {
    await logoutUser();
    await waitForLog("Logout user");

    const statusEl = await byTestId("user_status_value");
    await statusEl.waitUntil(
      async () => (await statusEl.getText()) === "Anonymous",
      { timeout: 5_000, timeoutMsg: 'Expected status to be "Anonymous"' },
    );

    const externalIdEl = await byTestId("user_external_id_value");
    const externalId = await externalIdEl.getText();
    expect(externalId).toBe("–");
  });
});
