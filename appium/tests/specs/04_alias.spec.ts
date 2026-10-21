import {
  checkTooltip,
  confirmModal,
  expectPairInSection,
  fillInput,
  openModal,
  scrollToEl,
  waitForAppReady,
} from '../helpers/app';
import { getTestData, TEST_DATA } from '../helpers/selectors.js';

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
    await openModal('add_alias_button', 'alias_label_input');
    await fillInput('alias_label_input', labelValue);

    const idValue = 'id1';
    await fillInput('alias_id_input', idValue);

    await confirmModal('singlepair_confirm_button');

    await expectPairInSection('aliases', labelValue, idValue);
  });

  it('can add multiple aliases', async () => {
    const { alias } = getTestData();
    const addRowButton = await openModal('add_multiple_aliases_button', 'multipair_add_row_button');
    await addRowButton.click();

    await fillInput('multipair_key_0', `${alias}2`);
    await fillInput('multipair_value_0', 'id2');
    await fillInput('multipair_key_1', `${alias}3`);
    await fillInput('multipair_value_1', 'id3');

    await confirmModal('multipair_confirm_button');

    await scrollToEl('aliases_section', { direction: 'up' });
    await expectPairInSection('aliases', `${alias}2`, 'id2');
    await expectPairInSection('aliases', `${alias}3`, 'id3');
  });
});
