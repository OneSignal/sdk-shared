import { checkTooltip, scrollToEl, typeInto, waitForAppReady } from '../helpers/app';
import { byTestId, byText, getTestData } from '../helpers/selectors.js';

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

    const addButton = await scrollToEl('add_sms_button');
    await addButton.click();

    const smsInput = await byTestId('sms_input');
    await smsInput.waitForDisplayed({ timeout: 5_000 });
    await typeInto(smsInput, sms);

    const confirmButton = await byTestId('singleinput_confirm_button');
    await confirmButton.click();

    let el = await byText(sms);
    await el.waitForDisplayed({ timeout: 5_000 });

    // remove sms
    await driver.pause(2_000);
    const removeButton = await byTestId(`sms_remove_${sms}`);
    await removeButton.click();

    el = await byText(sms);
    await el.waitForDisplayed({ timeout: 5_000, reverse: true });
  });
});
