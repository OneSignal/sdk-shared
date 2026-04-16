import { deleteUser } from './tests/helpers/selectors.js';

const isLocal = !process.env.BROWSERSTACK_USERNAME;

const browserstackConnection = {
  user: process.env.BROWSERSTACK_USERNAME,
  key: process.env.BROWSERSTACK_ACCESS_KEY,
  hostname: 'hub.browserstack.com',
  services: ['shared-store', 'browserstack'] as string[],
};

const localConnection = {
  hostname: 'localhost',
  port: 4723,
  services: ['shared-store'] as string[],
};

const bstackOptions = {
  projectName: 'OneSignal SDK E2E',
  buildName: process.env.BUILD_NAME || 'local',
  sessionName: process.env.SDK_TYPE || 'unknown',
  debug: true,
  networkLogs: true,
  appiumVersion: '3.2.0',
};

export const sharedConfig: WebdriverIO.Config = {
  ...(isLocal ? localConnection : browserstackConnection),

  maxInstances: 1,
  logLevel: 'warn',

  specs: ['./tests/specs/**/*.spec.ts'],

  capabilities: [],

  framework: 'mocha',
  mochaOpts: { timeout: 120_000, bail: true },
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
  connectionRetryTimeout: 90_000,
  connectionRetryCount: 3,

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
