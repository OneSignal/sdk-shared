import {
  checkTooltip,
  confirmModal,
  expectPairInSection,
  openModal,
  scrollToEl,
  waitForAppReady,
  waitForDisappear,
} from '../helpers/app';
import { byTestId } from '../helpers/selectors.js';

async function addMultipleTriggers() {
  const addRowButton = await openModal('add_multiple_triggers_button', 'multipair_add_row_button');
  await addRowButton.click();

  const key0 = await byTestId('multipair_key_0');
  await key0.waitForDisplayed({ timeout: 5_000 });
  await key0.setValue('trig2');

  const value0 = await byTestId('multipair_value_0');
  await value0.setValue('val2');

  const key1 = await byTestId('multipair_key_1');
  await key1.setValue('trig3');

  const value1 = await byTestId('multipair_value_1');
  await value1.setValue('val3');

  await confirmModal('multipair_confirm_button');

  await expectPairInSection('triggers', 'trig2', 'val2');
  await expectPairInSection('triggers', 'trig3', 'val3');
}

describe('Triggers', () => {
  before(async () => {
    await waitForAppReady();
    await scrollToEl('triggers_section');
  });

  afterEach(async () => {
    await scrollToEl('triggers_section', { direction: 'up' });
  });

  it('should show correct tooltip info', async () => {
    await checkTooltip('triggers_info_icon', 'triggers');
  });

  it('can add and remove trigger', async () => {
    const keyInput = await openModal('add_trigger_button', 'trigger_key_input');

    // add trigger
    await keyInput.setValue('trig1');

    const valueInput = await byTestId('trigger_value_input');
    await valueInput.setValue('val1');

    await confirmModal('singlepair_confirm_button');

    await expectPairInSection('triggers', 'trig1', 'val1');

    // remove trigger
    const removeButton = await byTestId(`triggers_remove_trig1`);
    await removeButton.click();

    await waitForDisappear('triggers_pair_key_trig1');
  });

  it('can add and remove multiple triggers', async () => {
    await addMultipleTriggers();

    // remove triggers
    const trigger2Checkbox = await openModal('remove_triggers_button', 'remove_checkbox_trig2');
    await trigger2Checkbox.click();

    const trigger3Checkbox = await byTestId('remove_checkbox_trig3');
    await trigger3Checkbox.click();

    await confirmModal('multiselect_confirm_button');

    await scrollToEl('triggers_section', { direction: 'up' });

    // wait for triggers to be removed
    await waitForDisappear('triggers_pair_key_trig2');
    await waitForDisappear('triggers_pair_key_trig3');
  });

  it('can clear all triggers', async () => {
    await addMultipleTriggers();

    // clear all triggers
    const clearButton = await scrollToEl('clear_triggers_button');
    await clearButton.click();

    await scrollToEl('triggers_section', { direction: 'up' });
    const el = await byTestId('triggers_empty');
    await el.waitUntil(async () => (await el.getText()).includes('No triggers added'), {
      timeout: 5_000,
      timeoutMsg: 'Expected triggers_empty to contain "No triggers added"',
    });
  });
});
