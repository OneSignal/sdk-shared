import { deleteUser, getTestExternalId } from './tests/helpers/selectors.js';

const isLocal = !process.env.BROWSERSTACK_USERNAME;

const browserstackConnection = {
  user: process.env.BROWSERSTACK_USERNAME,
  key: process.env.BROWSERSTACK_ACCESS_KEY,
  hostname: 'hub.browserstack.com',
  services: ['browserstack'] as string[],
};

const localConnection = {
  hostname: 'localhost',
  port: 4723,
  services: [] as string[],
};

const bstackOptions = {
  projectName: 'OneSignal SDK E2E',
  buildName: process.env.BUILD_NAME || 'local',
  sessionName: process.env.SDK_TYPE || 'unknown',
  debug: true,
  networkLogs: true,
  appiumVersion: '2.6',
};

export const sharedConfig: WebdriverIO.Config = {
  ...(isLocal ? localConnection : browserstackConnection),

  maxInstances: isLocal ? 1 : 0,
  logLevel: isLocal ? 'warn' : 'info',

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

  // cleans up test data (deletes a user and their subscriptions from OneSignal dashboard)
  before: async () => {
    await deleteUser(getTestExternalId());
  },
};

export { bstackOptions };
