import {
  checkTooltip,
  expectSnackbar,
  scrollToEl,
  typeInto,
  waitForAppReady,
} from '../helpers/app';
import { byTestId } from '../helpers/selectors.js';

describe('Outcomes', () => {
  before(async () => {
    await waitForAppReady();
    await scrollToEl('outcomes_section');
  });

  it('should show correct tooltip info', async () => {
    await checkTooltip('outcomes_info_icon', 'outcomes');
  });

  it('can send a normal outcome', async () => {
    const sendButton = await scrollToEl('send_outcome_button');
    await sendButton.click();

    const nameInput = await byTestId('outcome_name_input');
    await nameInput.waitForDisplayed({ timeout: 5_000 });
    await typeInto(nameInput, 'test_normal');

    const normalRadio = await byTestId('outcome_type_normal_radio');
    await normalRadio.click();

    const sendBtn = await byTestId('outcome_send_button');
    await sendBtn.click();

    await expectSnackbar('Outcome sent: test_normal');
  });

  it('can send a unique outcome', async () => {
    const sendButton = await scrollToEl('send_outcome_button');
    await sendButton.click();

    const nameInput = await byTestId('outcome_name_input');
    await nameInput.waitForDisplayed({ timeout: 5_000 });
    await typeInto(nameInput, 'test_unique');

    const uniqueRadio = await byTestId('outcome_type_unique_radio');
    await uniqueRadio.click();

    const sendBtn = await byTestId('outcome_send_button');
    await sendBtn.click();

    await expectSnackbar('Unique outcome sent: test_unique');
  });

  it('can send an outcome with value', async () => {
    const sendButton = await scrollToEl('send_outcome_button');
    await sendButton.click();

    const nameInput = await byTestId('outcome_name_input');
    await nameInput.waitForDisplayed({ timeout: 5_000 });

    const withValueRadio = await byTestId('outcome_type_value_radio');
    await withValueRadio.click();

    await typeInto(nameInput, 'test_valued');

    const valueInput = await byTestId('outcome_value_input');
    await valueInput.waitForDisplayed({ timeout: 5_000 });
    await typeInto(valueInput, '3.14');

    const sendBtn = await byTestId('outcome_send_button');
    await sendBtn.click();

    await expectSnackbar('Outcome sent: test_valued = 3.14');
  });
});
