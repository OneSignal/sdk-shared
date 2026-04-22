import {
  waitForAppReady,
  scrollToEl,
  checkTooltip,
  allowLocation,
  expectSnackbar,
  ensureMainWebViewContext,
  switchToNativeContext,
} from '../helpers/app.js';
import { byTestId } from '../helpers/selectors.js';

describe('Location', () => {
  before(async () => {
    await waitForAppReady();
    await scrollToEl('location_section');
  });

  it('can show correct tooltip info', async () => {
    await checkTooltip('location_info_icon', 'location');
  });

  it('can prompt for location', async () => {
    const promptButton = await scrollToEl('prompt_location_button');
    await promptButton.click();
    await driver.pause(3_000);

    await switchToNativeContext();
    await allowLocation();
    await ensureMainWebViewContext();
  });

  // share location is a separate state where if location permission is allowed,
  // then location details would be used for things like update user actions
  it('can share location', async () => {
    let checkSharedButton = await scrollToEl('check_location_button');
    await checkSharedButton.click();

    await expectSnackbar('Location shared: false');

    // toggle location sharing on
    await scrollToEl('location_shared_toggle');
    const shareToggle = await byTestId('location_shared_toggle');
    await shareToggle.click();

    // verify it's now shared — re-fetch to avoid stale reference after scroll
    checkSharedButton = await scrollToEl('check_location_button');
    await checkSharedButton.click();

    await expectSnackbar('Location shared: true');
  });
});
