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

describe('Tags', () => {
  before(async () => {
    await waitForAppReady();
    await scrollToEl('tags_section');
  });

  afterEach(async () => {
    await scrollToEl('tags_section', { direction: 'up' });
  });

  it('should show correct tooltip info', async () => {
    await checkTooltip('tags_info_icon', 'tags');
  });

  it('can add and remove a tag', async () => {
    const keyInput = await openModal('add_tag_button', 'tag_key_input');
    await keyInput.setValue('tag1');

    const valueInput = await byTestId('tag_value_input');
    await valueInput.setValue('val1');

    await confirmModal('singlepair_confirm_button');

    await expectPairInSection('tags', 'tag1', 'val1');

    // remove tag
    const removeButton = await byTestId(`tags_remove_tag1`);
    await removeButton.click();

    await waitForDisappear('tags_pair_key_tag0');
  });

  it('can add and remove multiple tags', async () => {
    const key0 = await openModal('add_multiple_tags_button', 'multipair_key_0');
    await key0.setValue('tag2');

    const value0 = await byTestId('multipair_value_0');
    await value0.setValue('val2');

    const addRowButton = await byTestId('multipair_add_row_button');
    await addRowButton.click();

    const key1 = await byTestId('multipair_key_1');
    await key1.waitForDisplayed({ timeout: 5_000 });
    await key1.setValue('tag3');

    const value1 = await byTestId('multipair_value_1');
    await value1.setValue('val3');

    await confirmModal('multipair_confirm_button');

    await expectPairInSection('tags', 'tag2', 'val2');
    await expectPairInSection('tags', 'tag3', 'val3');

    const tag2Checkbox = await openModal('remove_tags_button', 'remove_checkbox_tag2');
    await tag2Checkbox.click();

    const tag3Checkbox = await byTestId('remove_checkbox_tag3');
    await tag3Checkbox.click();

    await confirmModal('multiselect_confirm_button');

    // wait for tags to be removed
    await scrollToEl('tags_section', { direction: 'up' });
    await waitForDisappear('tags_pair_key_tag2');
    await waitForDisappear('tags_pair_key_tag3');
  });
});
