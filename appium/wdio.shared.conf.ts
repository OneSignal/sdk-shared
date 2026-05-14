import { globSync } from 'glob';

import { deleteUser } from './tests/helpers/selectors.js';

const SHARED_CONF_DIR = import.meta.dirname ?? process.cwd();

const isLocal = !process.env.BROWSERSTACK_USERNAME;

const browserstackConnection = {
  user: process.env.BROWSERSTACK_USERNAME,
  key: process.env.BROWSERSTACK_ACCESS_KEY,
  hostname: 'hub.browserstack.com',
  services: ['shared-store', 'browserstack'] as string[],
};

const localConnection = {
  hostname: 'localhost',
  port: Number(process.env.APPIUM_PORT) || 4723,
  services: ['shared-store'] as string[],
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
    'spec',
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
};

export { bstackOptions };
