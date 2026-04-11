import { sharedConfig, bstackOptions } from './wdio.shared.conf.js';

const isLocal = !process.env.BROWSERSTACK_USERNAME;

export const config: WebdriverIO.Config = {
  ...sharedConfig,
  capabilities: [
    {
      platformName: 'Android',
      'appium:app': isLocal ? process.env.APP_PATH : process.env.BROWSERSTACK_APP_URL,
      'appium:deviceName': process.env.DEVICE || 'Google Pixel 8',
      'appium:platformVersion': process.env.OS_VERSION || '14',
      'appium:automationName': 'UiAutomator2',
      ...(process.env.BUNDLE_ID ? { 'appium:appPackage': process.env.BUNDLE_ID } : {}),
      'appium:autoGrantPermissions': true,
      'appium:noReset': true,
      ...(isLocal ? {} : { 'bstack:options': bstackOptions }),
    },
  ],
};
