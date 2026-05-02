import { checkTooltip, confirmModal, openModal, scrollToEl, waitForAppReady } from '../helpers/app';
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
    const emailInput = await openModal('add_email_button', 'email_input');
    await emailInput.setValue(email);

    await confirmModal('singleinput_confirm_button');

    let el = await byTestId(`emails_value_${email}`);
    await el.waitForDisplayed({ timeout: 5_000 });

    // remove email
    const removeButton = await byTestId(`emails_remove_${email}`);
    await removeButton.click();

    el = await byTestId(`emails_value_${email}`);
    await el.waitForDisplayed({ timeout: 5_000, reverse: true });
  });
});
