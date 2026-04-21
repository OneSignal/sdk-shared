import { checkTooltip, scrollToEl, typeInto, waitForAppReady } from '../helpers/app';
import { byTestId, byText, getTestData } from '../helpers/selectors.js';

const TEST_JSON = {
  someNum: 123,
  someFloat: 3.14159,
  someString: 'abc',
  someBool: true,
  someObject: {
    abc: '123',
    nested: {
      def: '456',
    },
    ghi: null,
  },
  someArray: [1, 2],
  someMixedArray: [1, '2', { abc: '123' }, null],
  someNull: null,
};

describe('Custom Events', () => {
  before(async () => {
    await waitForAppReady();
    await scrollToEl('custom_events_section');
  });

  // wait for rename when merged to main
  it('should show correct tooltip info', async () => {
    await checkTooltip('custom_events_info_icon', 'customEvents');
  });

  it('can send a custom event with no properties', async () => {
    const { customEvent } = getTestData();
    const sendButton = await scrollToEl('track_event_button');
    await sendButton.click();

    const nameInput = await byTestId('event_name_input');
    await nameInput.waitForDisplayed({ timeout: 5_000 });
    await typeInto(nameInput, `${customEvent}_no_props`);

    const trackBtn = await byTestId('event_track_button');
    await trackBtn.click();

    const snackbar = await byText(`Event tracked: ${customEvent}_no_props`);
    await snackbar.waitForDisplayed({ timeout: 5_000 });
  });

  it('can send a custom event with properties', async () => {
    const { customEvent } = getTestData();
    const sendButton = await scrollToEl('track_event_button');
    await sendButton.click();

    const nameInput = await byTestId('event_name_input');
    await nameInput.waitForDisplayed({ timeout: 5_000 });
    await typeInto(nameInput, `${customEvent}_with_props`);

    const propertiesInput = await byTestId('event_properties_input');
    const json = JSON.stringify(TEST_JSON);
    await typeInto(propertiesInput, json);

    const trackBtn = await byTestId('event_track_button');
    await trackBtn.click();

    const snackbar = await byText(`Event tracked: ${customEvent}_with_props`);
    await snackbar.waitForDisplayed({ timeout: 5_000 });
  });
});
