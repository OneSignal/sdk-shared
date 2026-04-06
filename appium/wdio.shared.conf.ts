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

  specs: ['./tests/specs/**/*.spec.ts'],

  capabilities: [],

  framework: 'mocha',
  mochaOpts: { timeout: 120_000 },
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

  waitforTimeout: 15_000,
  connectionRetryTimeout: 90_000,
  connectionRetryCount: 3,

};

export { bstackOptions };
