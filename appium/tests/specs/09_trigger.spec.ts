import {
  checkTooltip,
  confirmModal,
  expectPairInSection,
  scrollToEl,
  waitForAppReady,
} from '../helpers/app';
import { byTestId } from '../helpers/selectors.js';

async function addMultipleTriggers() {
  const addButton = await scrollToEl('add_multiple_triggers_button');
  await addButton.click();

  const addRowButton = await byTestId('multipair_add_row_button');
  await addRowButton.click();

  const key0 = await byTestId('multipair_key_0');
  await key0.waitForDisplayed({ timeout: 5_000 });
  await key0.setValue('test_trigger_key_2');

  const value0 = await byTestId('multipair_value_0');
  await value0.setValue('test_trigger_value_2');

  const key1 = await byTestId('multipair_key_1');
  await key1.setValue('test_trigger_key_3');

  const value1 = await byTestId('multipair_value_1');
  await value1.setValue('test_trigger_value_3');

  await confirmModal('multipair_confirm_button');

  await expectPairInSection('triggers', 'test_trigger_key_2', 'test_trigger_value_2');
  await expectPairInSection('triggers', 'test_trigger_key_3', 'test_trigger_value_3');
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
    const addButton = await scrollToEl('add_trigger_button');
    await addButton.click();

    // add trigger
    const keyInput = await byTestId('trigger_key_input');
    await keyInput.waitForDisplayed({ timeout: 5_000 });
    await keyInput.setValue('test_trigger_key');

    const valueInput = await byTestId('trigger_value_input');
    await valueInput.setValue('test_trigger_value');

    await confirmModal('singlepair_confirm_button');

    await expectPairInSection('triggers', 'test_trigger_key', 'test_trigger_value');

    // remove trigger
    const removeButton = await byTestId(`triggers_remove_test_trigger_key`);
    await removeButton.click();

    const el = await byTestId('triggers_pair_key_test_trigger_key');
    await el.waitForDisplayed({ timeout: 5_000, reverse: true });
  });

  it('can add and remove multiple triggers', async () => {
    await addMultipleTriggers();

    // remove triggers
    const removeButton = await scrollToEl('remove_triggers_button');
    await removeButton.click();

    const trigger2Checkbox = await byTestId('remove_checkbox_test_trigger_key_2');
    await trigger2Checkbox.waitForDisplayed({ timeout: 5_000 });
    await trigger2Checkbox.click();

    const trigger3Checkbox = await byTestId('remove_checkbox_test_trigger_key_3');
    await trigger3Checkbox.click();

    await confirmModal('multiselect_confirm_button');

    await scrollToEl('triggers_section', { direction: 'up' });

    // wait for triggers to be removed
    const trigger2El = await byTestId('triggers_pair_key_test_trigger_key_2');
    const trigger3El = await byTestId('triggers_pair_key_test_trigger_key_3');
    await trigger2El.waitForDisplayed({ timeout: 5_000, reverse: true });
    await trigger3El.waitForDisplayed({ timeout: 5_000, reverse: true });
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
