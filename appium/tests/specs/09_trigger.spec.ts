import {
  checkTooltip,
  expectPairInSection,
  scrollToEl,
  typeInto,
  waitForAppReady,
} from '../helpers/app';
import { byTestId, byText } from '../helpers/selectors.js';

async function addMultipleTriggers() {
  const addButton = await scrollToEl('ADD MULTIPLE TRIGGERS', { by: 'text' });
  await addButton.click();

  const addRowButton = await byText('Add Row');
  await addRowButton.click();

  const key0 = await byTestId('Key_input_0');
  await key0.waitForDisplayed({ timeout: 5_000 });
  await typeInto(key0, 'test_trigger_key_2');

  const value0 = await byTestId('Value_input_0');
  await typeInto(value0, 'test_trigger_value_2');

  const key1 = await byTestId('Key_input_1');
  await typeInto(key1, 'test_trigger_key_3');

  const value1 = await byTestId('Value_input_1');
  await typeInto(value1, 'test_trigger_value_3');

  let confirmButton = await byText('Add All');
  await confirmButton.click();

  await expectPairInSection('triggers', 'test_trigger_key_2', 'test_trigger_value_2');
  await expectPairInSection('triggers', 'test_trigger_key_3', 'test_trigger_value_3');
}

describe('Triggers', () => {
  before(async () => {
    await waitForAppReady();
    await scrollToEl('triggers_section');
  });

  it('should show correct tooltip info', async () => {
    await checkTooltip('triggers_info_icon', 'triggers');
  });

  it('can add and remove trigger', async () => {
    const addButton = await scrollToEl('ADD TRIGGER', { by: 'text' });
    await addButton.click();

    // add trigger
    const keyInput = await byTestId('trigger_key_input');
    await keyInput.waitForDisplayed({ timeout: 5_000 });
    await typeInto(keyInput, 'test_trigger_key');

    const valueInput = await byTestId('trigger_value_input');
    await typeInto(valueInput, 'test_trigger_value');

    const confirmButton = await byTestId('trigger_confirm_button');
    await confirmButton.click();

    await expectPairInSection('triggers', 'test_trigger_key', 'test_trigger_value');

    // remove trigger
    const removeButton = await byTestId(`triggers_remove_test_trigger_key`);
    await removeButton.click();

    const el = await byText('test_trigger_key');
    await el.waitForDisplayed({ timeout: 5_000, reverse: true });
  });

  it('can add multiple triggers', async () => {
    await addMultipleTriggers();

    // remove triggers
    const removeButton = await scrollToEl('REMOVE TRIGGERS', { by: 'text' });
    await removeButton.click();

    const trigger2Checkbox = await byTestId('remove_checkbox_test_trigger_key_2');
    await trigger2Checkbox.waitForDisplayed({ timeout: 5_000 });
    await trigger2Checkbox.click();

    const trigger3Checkbox = await byTestId('remove_checkbox_test_trigger_key_3');
    await trigger3Checkbox.click();

    const confirmButton = await byText('Remove (2)');
    await confirmButton.click();

    await scrollToEl('triggers_section', { direction: 'up' });

    // wait for triggers to be removed
    const trigger2El = await byText('test_trigger_key_2');
    const trigger3El = await byText('test_trigger_key_3');
    await trigger2El.waitForDisplayed({ timeout: 5_000, reverse: true });
    await trigger3El.waitForDisplayed({ timeout: 5_000, reverse: true });
  });

  it('can clear all triggers', async () => {
    await addMultipleTriggers();

    // clear all triggers
    const clearButton = await scrollToEl('CLEAR ALL TRIGGERS', { by: 'text' });
    await clearButton.click();

    await scrollToEl('triggers_section', { direction: 'up' });
    const el = await byText('No triggers added');
    await el.waitForDisplayed({ timeout: 5_000 });
  });
});
