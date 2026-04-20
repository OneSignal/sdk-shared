import { waitForAppReady, loginUser, logoutUser, scrollToEl } from '../helpers/app.js';
import { getTestExternalId } from '../helpers/selectors.js';

describe('User', () => {
  before(async () => {
    await waitForAppReady({ skipLogin: true });
    await scrollToEl('user_section');
  });

  after(async () => {
    // login user back so we can clean up the user data for the next run
    await driver.pause(2_000);
    await waitForAppReady();
  });

  it('should start as anonymous', async () => {
    const statusEl = await scrollToEl('user_status_value');
    const status = await statusEl.getText();
    expect(status).toBe('Anonymous');

    const externalIdEl = await scrollToEl('user_external_id_value');
    const externalId = await externalIdEl.getText();
    expect(externalId).toBe('–');
  });

  it('can login and logout', async () => {
    const userId = getTestExternalId();
    await loginUser(userId);

    let statusEl = await scrollToEl('user_status_value');
    const status = await statusEl.getText();
    expect(status).toBe('Logged In');

    const externalIdEl = await scrollToEl('user_external_id_value');
    const externalId = await externalIdEl.getText();
    expect(externalId).toBe(getTestExternalId());

    await driver.pause(2_000);
    await logoutUser();

    statusEl = await scrollToEl('user_status_value');
    await statusEl.waitUntil(async () => (await statusEl.getText()) === 'Anonymous', {
      timeout: 5_000,
      timeoutMsg: 'Expected status to be "Anonymous"',
    });
  });
});
