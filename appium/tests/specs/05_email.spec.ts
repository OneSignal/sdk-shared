import { checkTooltip, confirmModal, scrollToEl, typeInto, waitForAppReady } from '../helpers/app';
import { byTestId, getTestData } from '../helpers/selectors.js';

describe('Emails', () => {
  before(async () => {
    await waitForAppReady();
    await scrollToEl('emails_section');
  });

  it('should show correct tooltip info', async () => {
    await checkTooltip('emails_info_icon', 'emails');
  });

  it('can add and remove email', async () => {
    const { email } = getTestData();

    // add email
    const addButton = await scrollToEl('add_email_button');
    await addButton.click();

    const emailInput = await byTestId('email_input');
    await emailInput.waitForDisplayed({ timeout: 5_000 });
    await typeInto(emailInput, email);
    await confirmModal('singleinput_confirm_button');

    let el = await byTestId(`emails_value_${email}`);
    await el.waitForDisplayed({ timeout: 5_000 });

    // remove email
    await driver.pause(2_000);
    const removeButton = await byTestId(`emails_remove_${email}`);
    await removeButton.click();

    el = await byTestId(`emails_value_${email}`);
    await el.waitForDisplayed({ timeout: 5_000, reverse: true });
  });
});
