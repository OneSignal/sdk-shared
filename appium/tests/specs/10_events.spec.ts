import { checkTooltip, scrollToEl, waitForAppReady } from '../helpers/app';
import { waitForLog } from '../helpers/logger.js';
import { byTestId, getTestData } from '../helpers/selectors.js';

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

  it('should show correct tooltip info', async () => {
    // TODO: Rename trackEvent property to customEvents
    await checkTooltip('custom_events_info_icon', 'trackEvent');
  });

  it('can send a custom event with no properties', async () => {
    const { customEvent } = getTestData();
    const sendButton = await scrollToEl('TRACK EVENT', { by: 'text' });
    await sendButton.click();

    const nameInput = await byTestId('event_name_input');
    await nameInput.waitForDisplayed({ timeout: 5_000 });
    await nameInput.setValue(`${customEvent}_no_props`);

    const trackBtn = await byTestId('event_track_button');
    await trackBtn.click();

    await waitForLog(`Event tracked: ${customEvent}`);
  });

  it('can send a custom event with properties', async () => {
    const { customEvent } = getTestData();
    const sendButton = await scrollToEl('TRACK EVENT', { by: 'text' });
    await sendButton.click();

    const nameInput = await byTestId('event_name_input');
    await nameInput.waitForDisplayed({ timeout: 5_000 });
    await nameInput.setValue(`${customEvent}_with_props`);

    const propertiesInput = await byTestId('event_properties_input');
    await propertiesInput.click();
    await propertiesInput.setValue(JSON.stringify(TEST_JSON));

    const trackBtn = await byTestId('event_track_button');
    await trackBtn.click();

    await waitForLog(`Event tracked: ${customEvent}_with_props`);
  });
});
