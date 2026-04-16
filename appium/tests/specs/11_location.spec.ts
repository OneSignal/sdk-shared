import { waitForAppReady, scrollToEl, checkTooltip, acceptAlert } from '../helpers/app.js';
import { byText } from '../helpers/selectors.js';

describe('Location', () => {
  before(async () => {
    await waitForAppReady({ skipLogin: true });
    await scrollToEl('location_section');
  });

  it('can show correct tooltip info', async () => {
    await checkTooltip('location_info_icon', 'location');
  });

  // Not an ideal test since we auto accept the system permission dialog
  // If we have observable callbacks for ios & android, we can test this better
  it('can prompt for location', async () => {
    // The system permission dialog is auto-accepted by Appium
    // (`autoGrantPermissions` on Android, `autoAcceptAlerts` on iOS),
    // so we just trigger the prompt and let Appium handle it.
    const promptButton = await scrollToEl('PROMPT LOCATION', { by: 'text' });
    await promptButton.click();
    await driver.pause(3_000);
  });

  // share location is a separate state where if location permission is allowed,
  // then location details would be used for things like update user actions
  it('can share location', async () => {
    let checkSharedButton = await scrollToEl('CHECK LOCATION SHARED', { by: 'text' });
    await checkSharedButton.click();

    let snackbar = await byText('Location shared: false');
    await snackbar.waitForDisplayed({ timeout: 5_000 });

    // toggle location sharing on
    const shareButton = await scrollToEl('Share device location', { by: 'text', partial: true });
    await shareButton.click();

    // verify it's now shared — re-fetch to avoid stale reference after scroll
    checkSharedButton = await scrollToEl('CHECK LOCATION SHARED', { by: 'text' });
    await checkSharedButton.click();
    snackbar = await byText('Location shared: true');
    await snackbar.waitForDisplayed({ timeout: 5_000 });
  });
});
