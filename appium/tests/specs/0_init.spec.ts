import { waitForAppReady } from "../helpers/app.js";
import { waitForLog } from "../helpers/logger.js";

describe("SDK Initialization", () => {
  it("should have init message and anonymous state", async () => {
    await waitForAppReady();

    // app id
    await waitForLog("OneSignal initialized with app ID:");
    const appId = process.env.ONESIGNAL_APP_ID;
    if (appId) {
      await waitForLog(appId);
    }
  });
});
