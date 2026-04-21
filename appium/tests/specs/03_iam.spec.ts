import {
  checkInAppMessage,
  checkTooltip,
  isWebViewVisible,
  scrollToEl,
  waitForAppReady,
} from '../helpers/app';
import { byTestId, getToggleState } from '../helpers/selectors';

describe('In-App Messaging', () => {
  before(async () => {
    await waitForAppReady();
    await scrollToEl('iam_section');
  });

  it('should show correct tooltip info', async () => {
    await checkTooltip('iam_info_icon', 'inAppMessaging');
    await checkTooltip('send_iam_info_icon', 'sendInAppMessage');
  });

  const iamTypes = [
    { buttonLabel: 'TOP BANNER', expectedTitle: 'Top Banner' },
    { buttonLabel: 'BOTTOM BANNER', expectedTitle: 'Bottom Banner' },
    { buttonLabel: 'CENTER MODAL', expectedTitle: 'Center Modal' },
    { buttonLabel: 'FULL SCREEN', expectedTitle: 'Full Screen' },
  ];

  for (const iam of iamTypes) {
    it(`can show ${iam.expectedTitle}`, async () => {
      await checkInAppMessage(iam);
    });
  }

  it('can pause iam', async () => {
    await scrollToEl('pause_iam_toggle', { direction: 'up' });
    const toggle = await byTestId('pause_iam_toggle');

    expect(await getToggleState(toggle)).toBe(false);
    await toggle.click();
    expect(await getToggleState(toggle)).toBe(true);

    // try to show top banner, should fail since IAM is paused
    const button = await scrollToEl('TOP BANNER', { by: 'text' });
    await button.click();
    await driver.pause(3_000);

    if (driver.isIOS) {
      expect(await isWebViewVisible()).toBe(false);
    }

    // reset back
    await toggle.click();
    await checkInAppMessage({
      buttonLabel: 'TOP BANNER',
      expectedTitle: 'Top Banner',
      skipClick: true,
    });
  });
});
