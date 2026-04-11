import { checkTooltip, scrollToEl, waitForAppReady } from '../helpers/app';
import { byTestId, byText, getTestExternalId } from '../helpers/selectors.js';

describe('Emails', () => {
  before(async () => {
    await waitForAppReady();
    await scrollToEl('EMAILS', { by: 'text' });
  });

  it('should show correct tooltip info', async () => {
    await checkTooltip('emails_info_icon', 'emails');
  });

  it('can add and remove email', async () => {
    const email = `${getTestExternalId()}@test.com`; // e.g. appium-flutter-ios@test.com

    // add email
    const addButton = await scrollToEl('ADD EMAIL', { by: 'text' });
    await addButton.click();

    const emailInput = await byTestId('Email_input');
    await emailInput.waitForDisplayed({ timeout: 5_000 });
    await emailInput.setValue(email);

    const confirmButton = await byText('Add');
    await confirmButton.click();

    let el = await byText(email);
    await el.waitForDisplayed({ timeout: 5_000 });

    // remove email
    const removeButton = await byTestId(`remove_${email}`);
    await removeButton.click();

    el = await byText(email);
    await el.waitForDisplayed({ timeout: 5_000, reverse: true });
  });
});
