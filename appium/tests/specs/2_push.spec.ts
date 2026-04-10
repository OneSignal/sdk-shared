import { waitForAppReady, togglePushEnabled } from "../helpers/app.js";
import { waitForLog } from "../helpers/logger.js";
import { byTestId } from "../helpers/selectors.js";

describe("Push Subscription", () => {
  before(async () => {
    await waitForAppReady();
  });

  it("should have push ID and be enabled initially", async () => {
    const pushIdEl = await byTestId("push_id_value");
    const pushId = await pushIdEl.getText();
    expect(pushId).not.toBe("N/A");
    expect(pushId.length).toBeGreaterThan(0);

    const toggleEl = await byTestId("push_enabled_toggle");
    const value = await toggleEl.getAttribute("value");
    expect(value).toBe("1");
  });

  it("should toggle push subscription off and on", async () => {
    await togglePushEnabled();
    await waitForLog("Push disabled", 10_000);

    await togglePushEnabled();
    await waitForLog("Push enabled", 10_000);
  });
});
