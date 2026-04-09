import { waitForAppReady } from "../helpers/app.js";
import { waitForLog } from "../helpers/logger.js";

describe("SDK Initialization", () => {
  it("should launch the app and display the home screen", async () => {
    await waitForAppReady();
  });

  it("should have init message in the log", async () => {
    await waitForAppReady();
    await waitForLog("OneSignal initialized with app ID");
  });
});
