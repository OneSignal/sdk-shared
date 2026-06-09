import {
  checkTooltip,
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
    const normalRadio = await openModal('send_outcome_button', 'outcome_type_normal_radio');
    await normalRadio.click();

    const nameInput = await byTestId('outcome_name_input');
    await nameInput.setValue('normal');

    const sendBtn = await byTestId('outcome_send_button');
    await sendBtn.click();

    await expectSnackbar('Outcome sent: normal');
  });

  it('can send a unique outcome', async () => {
    const uniqueRadio = await openModal('send_outcome_button', 'outcome_type_unique_radio');
    await uniqueRadio.click();

    const nameInput = await byTestId('outcome_name_input');
    await nameInput.setValue('unique');

    const sendBtn = await byTestId('outcome_send_button');
    await sendBtn.click();

    await expectSnackbar('Unique outcome sent: unique');
  });

  it('can send an outcome with value', async () => {
    const withValueRadio = await openModal('send_outcome_button', 'outcome_type_value_radio');
    await withValueRadio.click();

    const nameInput = await byTestId('outcome_name_input');
    await nameInput.setValue('valued');

    const valueInput = await byTestId('outcome_value_input');
    await valueInput.waitForDisplayed({ timeout: 5_000 });
    await valueInput.setValue('3.14');

    const sendBtn = await byTestId('outcome_send_button');
    await sendBtn.click();

    await expectSnackbar('Outcome sent: valued = 3.14');
  });
});
