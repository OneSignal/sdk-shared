import {
  waitForAppReady,
  loginUser,
  logoutUser,
  scrollToEl,
  waitForIdentityChange,
} from '../helpers/app.js';
import { getTestExternalId } from '../helpers/selectors.js';

describe('User', () => {
  before(async () => {
    await waitForAppReady({ skipLogin: true });
    await scrollToEl('user_section');
  });

  it('should start as anonymous', async () => {
    const externalIdEl = await scrollToEl('user_external_id_value');
    const externalId = await externalIdEl.getText();
    expect(externalId).toBe('—');
  });

  it('can login and logout', async () => {
    // Logging in before the anonymous user reaches the backend folds both into one create,
    // and Android may not fire the user observer for that login.
    await waitForIdentityChange({ externalId: null });

    const userId = getTestExternalId();
    await loginUser(userId);
    await waitForIdentityChange({ externalId: userId });

    const externalIdEl = await scrollToEl('user_external_id_value');
    const externalId = await externalIdEl.getText();
    expect(externalId).toBe(getTestExternalId());

    await logoutUser();
    await waitForIdentityChange({ externalId: null });

    const loggedOutIdEl = await scrollToEl('user_external_id_value');
    await loggedOutIdEl.waitUntil(async () => (await loggedOutIdEl.getText()) === '—', {
      timeout: 5_000,
      timeoutMsg: 'Expected external ID to be "—"',
    });
  });
});
