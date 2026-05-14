import { checkTooltip, confirmModal, openModal, scrollToEl, waitForAppReady } from '../helpers/app';
import { byTestId, getTestData } from '../helpers/selectors.js';

describe('SMS', () => {
  before(async () => {
    await waitForAppReady();
    await scrollToEl('sms_section');
  });

  it('should show correct tooltip info', async () => {
    await checkTooltip('sms_info_icon', 'sms');
  });

  it('can add and remove sms', async () => {
    const { sms } = getTestData();

    const smsInput = await openModal('add_sms_button', 'sms_input');
    await smsInput.setValue(sms);

    await confirmModal('singleinput_confirm_button');

    await scrollToEl('sms_section', { direction: 'up' });
    let el = await byTestId(`sms_value_${sms}`);
    await el.waitForDisplayed({ timeout: 5_000 });

    // remove sms
    const removeButton = await byTestId(`sms_remove_${sms}`);
    await removeButton.click();

    el = await byTestId(`sms_value_${sms}`);
    await el.waitForDisplayed({ timeout: 5_000, reverse: true });
  });
});
