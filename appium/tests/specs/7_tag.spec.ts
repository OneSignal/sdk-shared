import { checkTooltip, expectPairInSection, scrollToEl, waitForAppReady } from '../helpers/app';
import { byTestId, byText } from '../helpers/selectors.js';

describe('Tags', () => {
  before(async () => {
    await waitForAppReady();
    await scrollToEl('TAGS', { by: 'text' });
  });

  it('should show correct tooltip info', async () => {
    await checkTooltip('tags_info_icon', 'tags');
  });

  it.only('can add and remove a tag', async () => {
    const addButton = await scrollToEl('ADD TAG', { by: 'text' });
    await addButton.click();

    // add tag
    const keyInput = await byTestId('multi_pair_key_0');
    await keyInput.waitForDisplayed({ timeout: 5_000 });
    await keyInput.setValue('test_tag');

    const valueInput = await byTestId('multi_pair_value_0');
    await valueInput.setValue('test_tag_value');

    const confirmButton = await byTestId('multi_pair_confirm_button');
    await confirmButton.click();

    await expectPairInSection('tags', 'test_tag', 'test_tag_value');

    // // remove tag
    // const removeButton = await byTestId(`remove_test_tag`);
    // await removeButton.click();

    // const el = await byText('test_tag');
    // await el.waitForDisplayed({ timeout: 5_000, reverse: true });
  });

  it('can add multiple tags', async () => {
    const addButton = await scrollToEl('ADD MULTIPLE TAGS', { by: 'text' });
    await addButton.click();

    const key0 = await byTestId('Key_input_0');
    await key0.waitForDisplayed({ timeout: 5_000 });
    await key0.setValue('test_tag_2');

    const value0 = await byTestId('Value_input_0');
    await value0.setValue('test_tag_value_2');

    const addRowButton = await byText('Add Row');
    await addRowButton.click();

    const key1 = await byTestId('Key_input_1');
    await key1.waitForDisplayed({ timeout: 5_000 });
    await key1.setValue('test_tag_3');

    const value1 = await byTestId('Value_input_1');
    await value1.setValue('test_tag_value_3');

    const confirmButton = await byText('Add All');
    await confirmButton.click();

    await expectPairInSection('tags', 'test_tag_2', 'test_tag_value_2');
    await expectPairInSection('tags', 'test_tag_3', 'test_tag_value_3');
  });
});
