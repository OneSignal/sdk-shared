import {
  waitForAppReady,
  waitForInitId,
  tapNotification,
  switchToNativeContext,
  returnToApp,
  killApp,
  backgroundApp,
  expectOneNewLog,
  NOTIFICATION_CLICK_LOG,
} from '../helpers/app.js';
import {
  getPlatform,
  sendPushNotification,
  sendPushWithRetry,
  waitForPushSubscriptionReady,
} from '../helpers/selectors.js';

const LAUNCH_URL_HOST = 'onesignal.com';
const LAUNCH_URL = `https://${LAUNCH_URL_HOST}`;
const ADDRESS_BARS: Record<'ios' | 'android', string> = {
  ios: '-ios predicate string:name == "TabBarItemTitle"',
  android: 'android=new UiSelector().resourceId("com.android.chrome:id/url_bar")',
};
// Chrome's first launch can show its sign-in screen and a notification permission dialog,
// both covering the address bar.
const CHROME_FIRST_RUN_DISMISS = [
  'android=new UiSelector().resourceId("com.android.chrome:id/signin_fre_dismiss_button")',
  'android=new UiSelector().resourceId("com.android.chrome:id/negative_button")',
];

async function tapPushAndExpectLaunchUrl(subscriptionId: string, title: string) {
  const notificationId = await sendPushWithRetry({
    subscriptionId,
    send: () =>
      sendPushNotification({ subscriptionId, title, body: 'Tap to open URL', url: LAUNCH_URL }),
    expectArrived: () => tapNotification(title),
  });

  // A cold Chrome start on a slow emulator can take over 15s to show the address bar.
  await driver.waitUntil(async () => (await getBrowserAddress()).includes(LAUNCH_URL_HOST), {
    timeout: 45_000,
    timeoutMsg: 'Launch URL never opened',
  });

  await expectSingleClickEvent(notificationId);
}

/** Address shown by the foreground browser, or empty if no browser address bar is showing. */
async function getBrowserAddress(): Promise<string> {
  if (getPlatform() === 'android') {
    for (const selector of CHROME_FIRST_RUN_DISMISS) {
      const dismiss = $(selector);
      if (await dismiss.isExisting()) await dismiss.click();
    }
  }
  const addressBar = $(ADDRESS_BARS[getPlatform()]);
  return (await addressBar.isExisting()) ? addressBar.getText() : '';
}

/** The JS click listener must fire exactly once for the tapped notification. */
async function expectSingleClickEvent(notificationId: string) {
  await returnToApp();
  await expectOneNewLog([NOTIFICATION_CLICK_LOG, notificationId]);
}

describe('Notification click', () => {
  let subscriptionId: string;

  before(async () => {
    await waitForAppReady();
    subscriptionId = await waitForInitId();

    // The app is killed below, so the SDK must have already synced the push
    // token; otherwise the backend rejects the send as an invalid target.
    await waitForPushSubscriptionReady(subscriptionId);
  });

  afterEach(async () => {
    await returnToApp();
  });

  // The click reaches the SDK before the wrapper has initialized it. Wrappers
  // that initialize late must hold that click and replay it, or the launch
  // URL is never opened.
  it('opens the launch URL after a cold-start tap', async () => {
    await switchToNativeContext();
    await killApp();

    await tapPushAndExpectLaunchUrl(subscriptionId, `Cold start ${Date.now()}`);
  });

  it('opens the launch URL after a background tap', async () => {
    await switchToNativeContext();
    await backgroundApp();

    await tapPushAndExpectLaunchUrl(subscriptionId, `Background ${Date.now()}`);
  });
});
