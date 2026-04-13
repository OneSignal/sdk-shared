import { waitForAppReady, loginUser, logoutUser, scrollToEl } from '../helpers/app.js';
import { getTestExternalId } from '../helpers/selectors.js';

describe('User', () => {
  before(async () => {
    await waitForAppReady({ skipLogin: true });
    await scrollToEl('USER', { by: 'text' });
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

    await logoutUser();

    statusEl = await scrollToEl('user_status_value');
    await statusEl.waitUntil(async () => (await statusEl.getText()) === 'Anonymous', {
      timeout: 5_000,
      timeoutMsg: 'Expected status to be "Anonymous"',
    });
  });
});
