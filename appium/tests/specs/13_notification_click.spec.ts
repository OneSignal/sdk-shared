import {
  waitForAppReady,
  waitForInitId,
  isBrowserStackIos,
  tapNotification,
  switchToNativeContext,
  returnToApp,
  killApp,
  backgroundApp,
  hasLogView,
  expectOneNewLog,
} from '../helpers/app.js';
import {
  getPlatform,
  getTestExternalId,
  isPushSubscriptionReady,
  sendPushNotification,
} from '../helpers/selectors.js';

const itSkipBsIos = isBrowserStackIos() ? it.skip : it;

const LAUNCH_URL_HOST = 'onesignal.com';
const LAUNCH_URL = `https://${LAUNCH_URL_HOST}`;
const ADDRESS_BARS: Record<'ios' | 'android', string> = {
  ios: '-ios predicate string:name == "TabBarItemTitle"',
  android: 'android=new UiSelector().resourceId("com.android.chrome:id/url_bar")',
};
// Chrome asks for notification permission on its first launch, covering the address bar.
const CHROME_DIALOG_DISMISS =
  'android=new UiSelector().resourceId("com.android.chrome:id/negative_button")';

async function tapPushAndExpectLaunchUrl(subscriptionId: string, title: string) {
  const notificationId = await sendPushNotification({
    subscriptionId,
    title,
    body: 'Tap to open URL',
    url: LAUNCH_URL,
  });
  await tapNotification(title);

  await driver.waitUntil(async () => (await getBrowserAddress()).includes(LAUNCH_URL_HOST), {
    timeout: 20_000,
    timeoutMsg: 'Launch URL never opened',
  });

  await expectSingleClickEvent(notificationId);
}

/** Address shown by the foreground browser, or empty if no browser address bar is showing. */
async function getBrowserAddress(): Promise<string> {
  if (getPlatform() === 'android') {
    const dismiss = $(CHROME_DIALOG_DISMISS);
    if (await dismiss.isExisting()) await dismiss.click();
  }
  const addressBar = $(ADDRESS_BARS[getPlatform()]);
  return (await addressBar.isExisting()) ? addressBar.getText() : '';
}

/** The JS click listener must fire exactly once for the tapped notification. */
async function expectSingleClickEvent(notificationId: string) {
  await returnToApp();
  // Demos without the log view can't report JS events yet.
  if (!(await hasLogView())) return;
  await expectOneNewLog([`Notification click: ${notificationId}`]);
}

describe('Notification click', () => {
  let subscriptionId: string;

  before(async () => {
    await waitForAppReady();
    subscriptionId = await waitForInitId();

    // The app is killed below, so the SDK must have already synced the push
    // token; otherwise the backend rejects the send as an invalid target.
    const externalId = getTestExternalId();
    await driver.waitUntil(() => isPushSubscriptionReady(externalId, subscriptionId), {
      timeout: 60_000,
      interval: 2_000,
      timeoutMsg: `Push subscription ${subscriptionId} never became sendable`,
    });
  });

  afterEach(async () => {
    await returnToApp();
  });

  // The click reaches the SDK before the wrapper has initialized it. Wrappers
  // that initialize late must hold that click and replay it, or the launch
  // URL is never opened.
  itSkipBsIos('opens the launch URL after a cold-start tap', async () => {
    await switchToNativeContext();
    await killApp();

    await tapPushAndExpectLaunchUrl(subscriptionId, `Cold start ${Date.now()}`);
  });

  itSkipBsIos('opens the launch URL after a background tap', async () => {
    await switchToNativeContext();
    await backgroundApp();

    await tapPushAndExpectLaunchUrl(subscriptionId, `Background ${Date.now()}`);
  });
});
