import { waitForAppReady, waitForAlert, scrollToEl, checkTooltip } from '../helpers/app.js';
import { byText } from '../helpers/selectors.js';

describe('Location', () => {
  before(async () => {
    await waitForAppReady({ skipLogin: true });
    await scrollToEl('location_section');
  });

  it('can show correct tooltip info', async () => {
    await checkTooltip('location_info_icon', 'location');
  });

  it('can prompt for location', async () => {
    const promptButton = await scrollToEl('PROMPT LOCATION', { by: 'text' });
    await promptButton.click();

    await driver.pause(3_000);
    const alert = await waitForAlert();

    expect(alert).toContain('location');
    await driver.execute('mobile: alert', {
      action: 'accept',
      buttonLabel: 'Allow While Using App',
    });
  });

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
