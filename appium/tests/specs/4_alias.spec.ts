import { checkTooltip, scrollToEl, waitForAppReady } from '../helpers/app';
import { byTestId, byText } from '../helpers/selectors.js';

async function expectPairInList(key: string, value: string) {
  const el = await byText(key, true);
  await el.waitForDisplayed({ timeout: 5_000 });
  const text = await el.getText();
  expect(text).toContain(value);
}

describe('Aliases', () => {
  before(async () => {
    await waitForAppReady();
    await scrollToEl('ALIASES', { by: 'text' });
  });

  it('should show correct tooltip info', async () => {
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

    await expectPairInList('test_label', 'test_id');
  });

  it('can add multiple aliases', async () => {
    const addButton = await scrollToEl('ADD MULTIPLE ALIASES', { by: 'text' });
    await addButton.click();

    const addRowButton = await byText('Add Row');
    await addRowButton.click();

    const label0 = await byTestId('Label_input_0');
    await label0.waitForDisplayed({ timeout: 5_000 });
    await label0.setValue('test_label_2');

    const id0 = await byTestId('ID_input_0');
    await id0.waitForDisplayed({ timeout: 5_000 });
    await id0.setValue('test_id_2');

    const label1 = await byTestId('Label_input_1');
    await label1.waitForDisplayed({ timeout: 5_000 });
    await label1.setValue('test_label_3');

    const id1 = await byTestId('ID_input_1');
    await id1.waitForDisplayed({ timeout: 5_000 });
    await id1.setValue('test_id_3');

    const confirmButton = await byText('Add All');
    await confirmButton.click();

    await expectPairInList('test_label_2', 'test_id_2');
    await expectPairInList('test_label_3', 'test_id_3');
  });
});
