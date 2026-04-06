import { waitForAppReady } from '../helpers/app.js';
import { getLogCount, waitForLog } from '../helpers/logger.js';

describe('SDK Initialization', () => {
  it('should launch the app and display the home screen', async () => {
    await waitForAppReady();
  });

  it('should produce log entries on startup', async () => {
    await waitForAppReady();
    await browser.pause(3_000);

    const count = await getLogCount();
    expect(count).toBeGreaterThan(0);
  });

  it('should log SDK initialization', async () => {
    await waitForAppReady();
    await waitForLog('initialize', 15_000);
  });
});
