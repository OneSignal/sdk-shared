import { checkNotification, clearAllNotifications, scrollTo,  waitForNotification } from "../helpers/app";
import { byTestId } from "../helpers/selectors";

describe("Notification", () => {
  it("can send a notification", async () => {
    const logView = await byTestId("log_view_container");
    await logView.waitForDisplayed({ timeout: 30_000 });

    await checkNotification("send_simple_button", "Simple Notification", "This is a simple push notification");
  });
});
