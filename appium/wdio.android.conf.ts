import { sharedConfig, bstackOptions } from './wdio.shared.conf.js';

const isLocal = !process.env.BROWSERSTACK_USERNAME;

export const config: WebdriverIO.Config = {
  ...sharedConfig,
  capabilities: [
    {
      platformName: 'Android',
      'appium:app': isLocal ? process.env.APP_PATH : process.env.BROWSERSTACK_APP_URL,
      'appium:deviceName': process.env.DEVICE || 'Samsung Galaxy S26',
      'appium:platformVersion': process.env.OS_VERSION || '16',
      'appium:automationName': 'UiAutomator2',
      ...(process.env.BUNDLE_ID ? { 'appium:appPackage': process.env.BUNDLE_ID } : {}),
      'appium:autoGrantPermissions': false,
      'appium:noReset': true,
      ...(isLocal ? {} : { 'bstack:options': bstackOptions }),

      // Disable ID locator autocompletion to avoid Flutter's Semantics(container:true) wrapping inputs in a View.
      // @ts-expect-error - Appium types are not fully compatible with WebdriverIO types
      'appium:settings[disableIdLocatorAutocompletion]': true,
    },
  ],
};
