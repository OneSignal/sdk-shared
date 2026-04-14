import { sharedConfig, bstackOptions } from './wdio.shared.conf.js';

const isLocal = !process.env.BROWSERSTACK_USERNAME;

export const config: WebdriverIO.Config = {
  ...sharedConfig,
  capabilities: [
    {
      platformName: 'iOS',
      'appium:app': isLocal ? process.env.APP_PATH : process.env.BROWSERSTACK_APP_URL,
      'appium:deviceName': process.env.DEVICE || 'iPhone 16',
      'appium:platformVersion': process.env.OS_VERSION || '18',
      'appium:automationName': 'XCUITest',
      ...(process.env.BUNDLE_ID ? { 'appium:bundleId': process.env.BUNDLE_ID } : {}),
      'appium:autoAcceptAlerts': false,
      'appium:noReset': true,
      ...(isLocal ? {} : { 'bstack:options': bstackOptions }),
    },
  ],
};
