import {
  waitForAppReady,
  scrollToEl,
  checkTooltip,
  lockScreen,
  returnToApp,
} from '../helpers/app.js';
import { getPlatform } from '../helpers/selectors.js';

async function checkActivity(options: { orderId?: string; status: string; message: string }) {
  const { orderId = 'ORD-1234', status, message } = options;

  await lockScreen();

  const statusEl = await $(`-ios predicate string:label CONTAINS "${status}"`);
  await statusEl.waitForDisplayed({ timeout: 10_000 });

  const messageEl = await $(`-ios predicate string:label CONTAINS "${message}"`);
  await expect(messageEl).toBeDisplayed();

  const orderEl = await $(`-ios predicate string:label CONTAINS "${orderId}"`);
  await expect(orderEl).toBeDisplayed();

  await returnToApp();
}

describe('Live Activities', () => {
  before(async function () {
    await waitForAppReady();
    if (getPlatform() !== 'ios') {
      return this.skip();
    }
    await scrollToEl('live_activities_section');
  });

  it('can show correct tooltip info', async () => {
    await checkTooltip('live_activities_info_icon', 'liveActivities');
  });

  it('can start a live, update, and exit activity', async () => {
    const startButton = await scrollToEl('START LIVE ACTIVITY', { by: 'text' });
    await startButton.click();

    const clickUpdateButton = async (status: string) => {
      let updateButton = await scrollToEl(`UPDATE → ${status}`, { by: 'text' });
      await updateButton.click();
      await driver.pause(3_000);
    };

    await checkActivity({
      status: 'Preparing',
      message: 'Your order is being prepared',
    });

    // update live activity to on the way
    await clickUpdateButton('ON THE WAY');

    await checkActivity({
      status: 'On the Way',
      message: 'Driver is heading your way',
    });

    // end live activity
    const endButton = await scrollToEl('END LIVE ACTIVITY', { by: 'text' });
    await endButton.click();
    await driver.pause(3_000);
    await lockScreen();

    const activityEl = await $(`-ios predicate string:label CONTAINS "ORD-1234"`);
    await activityEl.waitForDisplayed({ timeout: 5_000, reverse: true });

    await returnToApp();
  });
});
