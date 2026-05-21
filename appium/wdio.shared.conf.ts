import type { HookStats, SuiteStats, TestStats } from '@wdio/reporter';
import SpecReporter from '@wdio/spec-reporter';
import { globSync } from 'glob';

import { deleteUser } from './tests/helpers/selectors.js';

// Spec reporter's `realtimeReporting` also streams suite-start banners and `Hook executed: ...` lines;
// patch printCurrentStats to only emit for test events while leaving state-tracking intact.
// `this` is rebound via `.call(this, stat)` in the override below, so the prototype reference is safe.
// eslint-disable-next-line @typescript-eslint/unbound-method
// const originalPrintCurrentStats = SpecReporter.prototype.printCurrentStats;
// SpecReporter.prototype.printCurrentStats = function (stat: TestStats | HookStats | SuiteStats) {
//   if (stat.type !== 'test') return;
//   originalPrintCurrentStats.call(this, stat);
// };

const SHARED_CONF_DIR = import.meta.dirname ?? process.cwd();

const isLocal = !process.env.BROWSERSTACK_USERNAME;

// Don't register @wdio/browserstack-service: its mocha CLI bootstrap can stall 25m+ with no log and can't be disabled.
const browserstackConnection = {
  user: process.env.BROWSERSTACK_USERNAME,
  key: process.env.BROWSERSTACK_ACCESS_KEY,
  hostname: 'hub.browserstack.com',
  services: ['shared-store'] satisfies WebdriverIO.Config['services'],
};

const localConnection = {
  hostname: 'localhost',
  port: Number(process.env.APPIUM_PORT) || 4723,
  services: ['shared-store'] satisfies WebdriverIO.Config['services'],
};

const bstackOptions = {
  projectName: 'OneSignal SDK E2E',
  buildName: process.env.BUILD_NAME || 'local',
  sessionName: process.env.SDK_TYPE || 'unknown',
  debug: true,
  networkLogs: true,
  appiumVersion: '3.2.0',
  idleTimeout: 300,
};

export const sharedConfig: WebdriverIO.Config = {
  ...(isLocal ? localConnection : browserstackConnection),
  maxInstances: 1,
  logLevel: 'warn',

  // Pre-expand the glob so WDIO groups all specs into one runner and reuses a single Appium session (a raw glob or `--spec` flag spawns one runner per file, costing ~10-30s of iOS session setup each).
  specs: [globSync('tests/specs/**/*.spec.ts', { cwd: SHARED_CONF_DIR, absolute: true }).sort()],

  capabilities: [],

  framework: 'mocha',
  mochaOpts: { timeout: 120_000, bail: isLocal },
  reporters: [
    ['spec', { realtimeReporting: false }],
    [
      'junit',
      {
        outputDir: './results',
        outputFileFormat: ({ cid }: { cid: string }) => `results-${cid}.xml`,
      },
    ],
  ],

  waitforTimeout: isLocal ? 3_000 : 15_000,
  // BrowserStack can hold POST /session open while waiting for a free
  // parallel slot (up to its 15-min queue cap). Keep the HTTP client
  // alive long enough that we don't bail before the queue clears.
  connectionRetryTimeout: 900_000,
  connectionRetryCount: 2,

  // cleans up test data once before all specs run
  onPrepare: async () => {
    const sdkType = process.env.SDK_TYPE;
    const platform = process.env.PLATFORM;
    if (!sdkType || !platform) return;
    const externalId = sdkType === platform ? `appium-${sdkType}` : `appium-${sdkType}-${platform}`;
    await deleteUser(externalId);
  },

  // Flip BrowserStack's session status pill to passed/failed (replaces what @wdio/browserstack-service did).
  after: async (result) => {
    if (isLocal) return;
    const status = result === 0 ? 'passed' : 'failed';
    const reason = status === 'failed' ? `${result} failed test(s)` : '';
    await driver.execute(
      `browserstack_executor: ${JSON.stringify({
        action: 'setSessionStatus',
        arguments: { status, reason },
      })}`,
    );
  },
};

export { bstackOptions };
