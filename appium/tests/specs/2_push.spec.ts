import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { waitForAppReady, togglePushEnabled, waitForNotification, checkNotification } from "../helpers/app.js";
import { waitForLog } from "../helpers/logger.js";
import { byTestId } from "../helpers/selectors.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const tooltipContent = JSON.parse(
  readFileSync(resolve(__dirname, "../../../demo/tooltip_content.json"), "utf-8"),
);

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

  it("should show correct tooltip info", async () => {
    const infoIcon = await byTestId("push_info_icon");
    await infoIcon.click();

    const titleEl = await byTestId("tooltip_title");
    await titleEl.waitForDisplayed({ timeout: 5_000 });
    const title = await titleEl.getText();
    expect(title).toBe(tooltipContent.push.title);

    const descEl = await byTestId("tooltip_description");
    const description = await descEl.getText();
    expect(description).toBe(tooltipContent.push.description);

    const okButton = await $("~OK");
    await okButton.click();
  });

  it("can send a simple notification", async () => {
    const logView = await byTestId("log_view_container");
    await logView.waitForDisplayed({ timeout: 30_000 });

    await checkNotification("send_simple_button", "Simple Notification", "This is a simple push notification");
  });

  // it("should toggle push subscription off and on", async () => {
  //   await togglePushEnabled();
  //   await waitForLog("Push disabled", 10_000);

  //   await driver.pause(3_000);

  //   await togglePushEnabled();
  //   await waitForLog("Push enabled", 10_000);
  // });
});
