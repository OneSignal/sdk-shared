import {
  checkTooltip,
  confirmModal,
  expectPairInSection,
  scrollToEl,
  waitForAppReady,
} from '../helpers/app';
import { byTestId } from '../helpers/selectors.js';

describe('Aliases', () => {
  before(async () => {
    await waitForAppReady();
    await scrollToEl('aliases_section');
  });

  afterEach(async () => {
    await scrollToEl('aliases_section', { direction: 'up' });
  });

  it('should show correct tooltip info', async () => {
    await checkTooltip('aliases_info_icon', 'aliases');
  });

  it('can add an alias', async () => {
    const addButton = await scrollToEl('add_alias_button');
    await addButton.click();

    const labelInput = await byTestId('alias_label_input');
    await labelInput.waitForDisplayed({ timeout: 5_000 });
    await labelInput.setValue('test_label');

    const idInput = await byTestId('alias_id_input');
    await idInput.setValue('test_id');

    await confirmModal('singlepair_confirm_button');

    await expectPairInSection('aliases', 'test_label', 'test_id');
  });

  it('can add multiple aliases', async () => {
    const addButton = await scrollToEl('add_multiple_aliases_button');
    await addButton.click();

    const addRowButton = await byTestId('multipair_add_row_button');
    await addRowButton.click();

    const label0 = await byTestId('multipair_key_0');
    await label0.waitForDisplayed({ timeout: 5_000 });
    await label0.setValue('test_label_2');

    const id0 = await byTestId('multipair_value_0');
    await id0.waitForDisplayed({ timeout: 5_000 });
    await id0.setValue('test_id_2');

    const label1 = await byTestId('multipair_key_1');
    await label1.waitForDisplayed({ timeout: 5_000 });
    await label1.setValue('test_label_3');

    const id1 = await byTestId('multipair_value_1');
    await id1.waitForDisplayed({ timeout: 5_000 });
    await id1.setValue('test_id_3');

    await confirmModal('multipair_confirm_button');

    await scrollToEl('aliases_section', { direction: 'up' });
    await expectPairInSection('aliases', 'test_label_2', 'test_id_2');
    await expectPairInSection('aliases', 'test_label_3', 'test_id_3');
  });
});
