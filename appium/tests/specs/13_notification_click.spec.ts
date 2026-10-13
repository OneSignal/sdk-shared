import {
  waitForAppReady,
  waitForInitId,
  isBrowserStackIos,
  tapNotification,
  switchToNativeContext,
  returnToApp,
  getAppState,
  terminateApp,
  backgroundApp,
  getForegroundAppId,
  getForegroundActivity,
  hasLogView,
  expectOneNewLog,
  AppState,
} from '../helpers/app.js';
import {
  getPlatform,
  getTestExternalId,
  isPushSubscriptionReady,
  sendPushNotification,
} from '../helpers/selectors.js';

const itSkipBsIos = isBrowserStackIos() ? it.skip : it;

const LAUNCH_URL = 'https://onesignal.com';
const BROWSERS: Record<'ios' | 'android', RegExp> = {
  ios: /^com\.apple\.mobilesafari$/,
  android: /chrome|browser/i,
};

async function tapPushAndExpectLaunchUrl(subscriptionId: string, title: string) {
  const notificationId = await sendPushNotification({
    subscriptionId,
    title,
    body: 'Tap to open URL',
    url: LAUNCH_URL,
  });
  await tapNotification(title);

  const browser = BROWSERS[getPlatform()];
  await driver.waitUntil(
    async () => browser.test(await getForegroundAppId()) && !(await isBrowserFirstRun()),
    {
      timeout: 20_000,
      timeoutMsg: `Launch URL never opened (foreground: ${await getForegroundAppId()} ${await getForegroundActivity()})`,
    },
  );
  // The tap launched (or resumed) the app before the URL took over the foreground.
  expect([AppState.RunningInBackgroundSuspended, AppState.RunningInBackground]).toContain(
    await getAppState(),
  );

  await expectSingleClickEvent(notificationId);
}

/** A browser setup screen (e.g. Chrome's FirstRunActivity) is showing instead of the URL. */
async function isBrowserFirstRun() {
  return getPlatform() === 'android' && /firstrun/i.test(await getForegroundActivity());
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
  // URL is never opened. iOS only: Appium can only force-stop on Android,
  // which drops both incoming FCM messages and posted notifications.
  itSkipBsIos('opens the launch URL after a cold-start tap', async function () {
    if (getPlatform() !== 'ios') return this.skip();

    await switchToNativeContext();
    await terminateApp();
    expect(await getAppState()).toBe(AppState.NotRunning);

    await tapPushAndExpectLaunchUrl(subscriptionId, `Cold start ${Date.now()}`);
  });

  itSkipBsIos('opens the launch URL after a background tap', async () => {
    await switchToNativeContext();
    await backgroundApp();

    await tapPushAndExpectLaunchUrl(subscriptionId, `Background ${Date.now()}`);
  });
});
