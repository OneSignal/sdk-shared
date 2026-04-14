import { checkTooltip, scrollToEl, waitForAppReady } from '../helpers/app';
import { waitForLog } from '../helpers/logger.js';
import { byTestId, byText } from '../helpers/selectors.js';

describe('Outcomes', () => {
  before(async () => {
    await waitForAppReady();
    await scrollToEl('outcomes_section');
  });

  it('should show correct tooltip info', async () => {
    await checkTooltip('outcomes_info_icon', 'outcomes');
  });

  it('can send a normal outcome', async () => {
    const sendButton = await scrollToEl('SEND OUTCOME', { by: 'text' });
    await sendButton.click();

    const nameInput = await byTestId('outcome_name_input');
    await nameInput.waitForDisplayed({ timeout: 5_000 });
    await nameInput.setValue('test_normal');

    const normalRadio = await byText('Normal Outcome');
    await normalRadio.click();

    const sendBtn = await byTestId('outcome_send_button');
    await sendBtn.click();

    await waitForLog('Outcome sent: test_normal');
  });

  it('can send a unique outcome', async () => {
    const sendButton = await scrollToEl('SEND OUTCOME', { by: 'text' });
    await sendButton.click();

    const nameInput = await byTestId('outcome_name_input');
    await nameInput.waitForDisplayed({ timeout: 5_000 });
    await nameInput.setValue('test_unique');

    const uniqueRadio = await byText('Unique Outcome');
    await uniqueRadio.click();

    const sendBtn = await byTestId('outcome_send_button');
    await sendBtn.click();

    await waitForLog('Unique outcome sent: test_unique');
  });

  it('can send an outcome with value', async () => {
    const sendButton = await scrollToEl('SEND OUTCOME', { by: 'text' });
    await sendButton.click();

    const withValueRadio = await byText('Outcome with Value');
    await withValueRadio.click();

    const nameInput = await byTestId('outcome_name_input');
    await nameInput.waitForDisplayed({ timeout: 5_000 });
    await nameInput.setValue('test_valued');

    const valueInput = await byTestId('outcome_value_input');
    await valueInput.waitForDisplayed({ timeout: 5_000 });
    await valueInput.setValue('3.14');

    const sendBtn = await byTestId('outcome_send_button');
    await sendBtn.click();

    await waitForLog('Outcome sent: test_valued = 3.14');
  });
});
