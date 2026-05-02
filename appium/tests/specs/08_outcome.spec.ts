import {
  checkTooltip,
  dismissKeyboard,
  expectSnackbar,
  openModal,
  scrollToEl,
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
    const nameInput = await openModal('send_outcome_button', 'outcome_name_input');
    await nameInput.setValue('test_normal');
    await dismissKeyboard();

    const normalRadio = await byTestId('outcome_type_normal_radio');
    await normalRadio.click();

    const sendBtn = await byTestId('outcome_send_button');
    await sendBtn.click();

    await expectSnackbar('Outcome sent: test_normal');
  });

  it('can send a unique outcome', async () => {
    const nameInput = await openModal('send_outcome_button', 'outcome_name_input');
    await nameInput.setValue('test_unique');
    await dismissKeyboard();

    const uniqueRadio = await byTestId('outcome_type_unique_radio');
    await uniqueRadio.click();

    const sendBtn = await byTestId('outcome_send_button');
    await sendBtn.click();

    await expectSnackbar('Unique outcome sent: test_unique');
  });

  it('can send an outcome with value', async () => {
    const nameInput = await openModal('send_outcome_button', 'outcome_name_input');

    const withValueRadio = await byTestId('outcome_type_value_radio');
    await withValueRadio.click();

    await nameInput.setValue('test_valued');

    const valueInput = await byTestId('outcome_value_input');
    await valueInput.waitForDisplayed({ timeout: 5_000 });
    await valueInput.setValue('3.14');
    await dismissKeyboard();

    const sendBtn = await byTestId('outcome_send_button');
    await sendBtn.click();

    await expectSnackbar('Outcome sent: test_valued = 3.14');
  });
});
