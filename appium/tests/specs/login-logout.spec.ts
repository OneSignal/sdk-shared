import {
  waitForAppReady,
  loginUser,
  logoutUser,
  clearLogs,
} from '../helpers/app.js';
import { waitForLog } from '../helpers/logger.js';

describe('Login / Logout', () => {
  before(async () => {
    await waitForAppReady();
  });

  it('should login with an external user ID', async () => {
    await clearLogs();
    await loginUser('e2e-test-user');
    await waitForLog('login', 10_000);
  });

  it('should logout the user', async () => {
    await clearLogs();
    await logoutUser();
    await waitForLog('logout', 10_000);
  });
});
