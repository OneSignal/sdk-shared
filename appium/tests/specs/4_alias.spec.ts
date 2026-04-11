import { checkTooltip, scrollToEl, waitForAppReady } from '../helpers/app';
import { byTestId, byText } from '../helpers/selectors.js';

describe('Aliases', () => {
  before(async () => {
    await waitForAppReady();
    await scrollToEl('ALIASES', { by: 'text' });
  });

  it.only('should show correct tooltip info', async () => {
    await checkTooltip('aliases_info_icon', 'aliases');
  });

  it('can add an alias', async () => {
    const addButton = await scrollToEl('ADD ALIAS', { by: 'text' });
    await addButton.click();

    const labelInput = await byTestId('alias_label_input');
    await labelInput.waitForDisplayed({ timeout: 5_000 });
    await labelInput.setValue('test_label');

    const idInput = await byTestId('alias_id_input');
    await idInput.setValue('test_id');

    const confirmButton = await byText('Add');
    await confirmButton.click();

    const addedAlias = await byText('test_label', true);
    await addedAlias.waitForDisplayed({ timeout: 5_000 });
    const addedAliasText = await addedAlias.getText();
    expect(addedAliasText).toContain('test_id');
  });
});
