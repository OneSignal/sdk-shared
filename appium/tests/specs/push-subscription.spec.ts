import { waitForAppReady, togglePushEnabled, clearLogs } from '../helpers/app.js';
import { waitForLog } from '../helpers/logger.js';

describe('Push Subscription', () => {
  before(async () => {
    await waitForAppReady();
  });

  it('should toggle push subscription on', async () => {
    await clearLogs();
    await togglePushEnabled();
    await waitForLog('push', 10_000);
  });
});
