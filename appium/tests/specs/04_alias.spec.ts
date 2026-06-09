import {
  checkTooltip,
  confirmModal,
  expectPairInSection,
  openModal,
  scrollToEl,
  waitForAppReady,
} from '../helpers/app';
import { byTestId, getTestData, TEST_DATA } from '../helpers/selectors.js';

describe('Aliases', () => {
  before(async () => {
    // check that all aliases are unique since we want to avoid 409 conflicts
    const aliases = Object.values(TEST_DATA)
      .map((data) => data.alias)
      .concat('iam_type');
    const uniqueAliases = [...new Set(aliases)];
    if (uniqueAliases.length !== aliases.length) {
      throw new Error('Aliases are not unique');
    }

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
    const { alias } = getTestData();
    const labelValue = `${alias}1`;
    const labelInput = await openModal('add_alias_button', 'alias_label_input');
    await labelInput.setValue(labelValue);

    const idValue = 'id1';
    const idInput = await byTestId('alias_id_input');
    await idInput.setValue(idValue);

    await confirmModal('singlepair_confirm_button');

    await expectPairInSection('aliases', labelValue, idValue);
  });

  it('can add multiple aliases', async () => {
    const { alias } = getTestData();
    const addRowButton = await openModal('add_multiple_aliases_button', 'multipair_add_row_button');
    await addRowButton.click();

    const label0 = await byTestId('multipair_key_0');
    await label0.setValue(`${alias}2`);

    const id0 = await byTestId('multipair_value_0');
    await id0.waitForDisplayed({ timeout: 5_000 });
    await id0.setValue('id2');

    const label1 = await byTestId('multipair_key_1');
    await label1.waitForDisplayed({ timeout: 5_000 });
    await label1.setValue(`${alias}3`);

    const id1 = await byTestId('multipair_value_1');
    await id1.waitForDisplayed({ timeout: 5_000 });
    await id1.setValue('id3');

    await confirmModal('multipair_confirm_button');

    await scrollToEl('aliases_section', { direction: 'up' });
    await expectPairInSection('aliases', `${alias}2`, 'id2');
    await expectPairInSection('aliases', `${alias}3`, 'id3');
  });
});
