import {
  checkTooltip,
  expectPairInSection,
  scrollToEl,
  typeInto,
  waitForAppReady,
} from '../helpers/app';
import { byTestId, byText } from '../helpers/selectors.js';

describe('Tags', () => {
  before(async () => {
    await waitForAppReady();
    await scrollToEl('tags_section');
  });

  it('should show correct tooltip info', async () => {
    await checkTooltip('tags_info_icon', 'tags');
  });

  it('can add and remove a tag', async () => {
    const addButton = await scrollToEl('ADD TAG', { by: 'text' });
    await addButton.click();

    // add tag
    const keyInput = await byTestId('tag_key_input');
    await keyInput.waitForDisplayed({ timeout: 5_000 });
    await typeInto(keyInput, 'test_tag');

    const valueInput = await byTestId('tag_value_input');
    await typeInto(valueInput, 'test_tag_value');

    const confirmButton = await byTestId('tag_confirm_button');
    await confirmButton.click();

    await expectPairInSection('tags', 'test_tag', 'test_tag_value');

    // remove tag
    const removeButton = await byTestId(`tags_remove_test_tag`);
    await removeButton.click();

    const el = await byText('test_tag');
    await el.waitForDisplayed({ timeout: 5_000, reverse: true });
  });

  it('can add and remove multiple tags', async () => {
    const addButton = await scrollToEl('ADD MULTIPLE TAGS', { by: 'text' });
    await addButton.click();

    // add tags
    const key0 = await byTestId('Key_input_0');
    await key0.waitForDisplayed({ timeout: 5_000 });
    await typeInto(key0, 'test_tag_2');

    const value0 = await byTestId('Value_input_0');
    await typeInto(value0, 'test_tag_value_2');

    const addRowButton = await byText('Add Row');
    await addRowButton.click();

    const key1 = await byTestId('Key_input_1');
    await key1.waitForDisplayed({ timeout: 5_000 });
    await typeInto(key1, 'test_tag_3');

    const value1 = await byTestId('Value_input_1');
    await typeInto(value1, 'test_tag_value_3');

    let confirmButton = await byText('Add All');
    await confirmButton.click();

    await expectPairInSection('tags', 'test_tag_2', 'test_tag_value_2');
    await expectPairInSection('tags', 'test_tag_3', 'test_tag_value_3');

    // remove tags
    const removeButton = await scrollToEl('REMOVE TAGS', { by: 'text' });
    await removeButton.click();

    const tag2Checkbox = await byTestId('remove_checkbox_test_tag_2');
    await tag2Checkbox.waitForDisplayed({ timeout: 5_000 });
    await tag2Checkbox.click();

    const tag3Checkbox = await byTestId('remove_checkbox_test_tag_3');
    await tag3Checkbox.click();

    confirmButton = await byText('Remove (2)');
    await confirmButton.click();

    // wait for tags to be removed
    await scrollToEl('tags_section', { direction: 'up' });
    const tag2El = await byText('test_tag_2');
    const tag3El = await byText('test_tag_3');
    await tag2El.waitForDisplayed({ timeout: 5_000, reverse: true });
    await tag3El.waitForDisplayed({ timeout: 5_000, reverse: true });
  });
});
