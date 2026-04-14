import { waitForAppReady, scrollToEl, checkTooltip } from '../helpers/app.js';
import { getPlatform } from '../helpers/selectors.js';

async function lockScreen() {
  await driver.updateSettings({ defaultActiveApplication: 'com.apple.springboard' });
  await driver.lock();
  await driver.pause(500);

  // // wake from lock screen
  // await driver.execute('mobile: pressButton', { name: 'home' });
  // await driver.pause(500);

  // const allowButton = await $(`-ios predicate string:label == "Allow"`);
  // if (await allowButton.isExisting()) {
  //   await allowButton.click();
  // }
}

async function checkActivity(options: { orderId?: string; status: string; message: string }) {
  const { orderId = 'ORD-1234', status, message } = options;

  // lock screen Lock Screen with Live Activity
  await lockScreen();

  const statusEl = await $(`-ios predicate string:label CONTAINS "${status}"`);
  await statusEl.waitForDisplayed({ timeout: 10_000 });

  const messageEl = await $(`-ios predicate string:label CONTAINS "${message}"`);
  expect(messageEl).toBeDisplayed();

  const orderEl = await $(`-ios predicate string:label CONTAINS "${orderId}"`);
  expect(orderEl).toBeDisplayed();

  // unlock and switch back to app context
  const caps = driver.capabilities as Record<string, unknown>;
  const bundleId = (caps['bundleId'] ?? caps['appium:bundleId']) as string;
  await driver.updateSettings({ defaultActiveApplication: bundleId });
  await driver.execute('mobile: activateApp', { bundleId });
  await driver.pause(2_000);
}

describe('Live Activities', () => {
  before(async function () {
    if (getPlatform() !== 'ios') {
      return this.skip();
    }
    await waitForAppReady({ skipLogin: true });
    await scrollToEl('live_activities_section');
  });

  it('can show correct tooltip info', async () => {
    await checkTooltip('live_activities_info_icon', 'liveActivities');
  });

  it('can start a live, update, and exit activity', async () => {
    const startButton = await scrollToEl('START LIVE ACTIVITY', { by: 'text' });
    await startButton.click();

    await checkActivity({
      status: 'Preparing',
      message: 'Your order is being prepared',
    });

    // update live activity to on the way
    let updateButton = await scrollToEl('UPDATE → ON THE WAY', { by: 'text' });
    await updateButton.click();

    await checkActivity({
      status: 'On the Way',
      message: 'Driver is heading your way',
    });

    // update live activity to delivered
    updateButton = await scrollToEl('UPDATE → DELIVERED', { by: 'text' });
    await updateButton.click();

    await checkActivity({
      status: 'Delivered',
      message: 'Order delivered!',
    });

    // end live activity
    const endButton = await scrollToEl('END LIVE ACTIVITY', { by: 'text' });
    await endButton.click();
    await lockScreen();

    const activityEl = await $(`-ios predicate string:label CONTAINS "ORD-1234"`);
    await activityEl.waitForDisplayed({ timeout: 5_000, reverse: true });
  });
});
