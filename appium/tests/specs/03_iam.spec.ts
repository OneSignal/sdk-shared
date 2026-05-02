import { checkInAppMessage, checkTooltip, scrollToEl, waitForAppReady } from '../helpers/app';
import { byTestId, expectToggleState } from '../helpers/selectors';

describe('In-App Messaging', () => {
  before(async () => {
    await waitForAppReady();
    await scrollToEl('iam_section');
  });

  afterEach(async () => {
    await scrollToEl('iam_section', { direction: 'up' });
  });

  it('should show correct tooltip info', async () => {
    await checkTooltip('iam_info_icon', 'inAppMessaging');
    await checkTooltip('send_iam_info_icon', 'sendInAppMessage');
  });

  const iamTypes = [
    { buttonId: 'send_iam_top_banner_button', expectedTitle: 'Top Banner' },
    { buttonId: 'send_iam_bottom_banner_button', expectedTitle: 'Bottom Banner' },
    { buttonId: 'send_iam_center_modal_button', expectedTitle: 'Center Modal' },
    { buttonId: 'send_iam_full_screen_button', expectedTitle: 'Full Screen' },
  ];

  for (const iam of iamTypes) {
    it(`can show ${iam.expectedTitle}`, async () => {
      await checkInAppMessage(iam);
    });
  }

  it('can pause iam', async () => {
    await scrollToEl('pause_iam_toggle');
    const toggle = await byTestId('pause_iam_toggle');

    await expectToggleState(toggle, false);
    await toggle.click();
    await expectToggleState(toggle, true);

    // try to show top banner, should fail since IAM is paused
    const button = await scrollToEl('send_iam_top_banner_button');
    await button.click();

    // reset back
    await toggle.click();
    await checkInAppMessage({
      buttonId: 'send_iam_top_banner_button',
      expectedTitle: 'Top Banner',
      skipClick: true,
    });
  });
});
