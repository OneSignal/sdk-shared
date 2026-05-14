import { sharedConfig, bstackOptions } from './wdio.shared.conf.js';

const isLocal = !process.env.BROWSERSTACK_USERNAME;

export const config: WebdriverIO.Config = {
  ...sharedConfig,
  capabilities: [
    {
      platformName: 'iOS',
      'appium:app': isLocal ? process.env.APP_PATH : process.env.BROWSERSTACK_APP_URL,
      'appium:reduceMotion': true,
      'appium:deviceName': process.env.DEVICE || 'iPhone 17',
      'appium:platformVersion': process.env.OS_VERSION || '26',
      'appium:automationName': 'XCUITest',
      ...(process.env.UDID ? { 'appium:udid': process.env.UDID } : {}),
      ...(process.env.WDA_LOCAL_PORT
        ? { 'appium:wdaLocalPort': Number(process.env.WDA_LOCAL_PORT) }
        : {}),
      ...(process.env.XCODE_TEAM_ID ? { 'appium:xcodeOrgId': process.env.XCODE_TEAM_ID } : {}),
      ...(process.env.XCODE_SIGNING_ID
        ? { 'appium:xcodeSigningId': process.env.XCODE_SIGNING_ID }
        : {}),
      ...(process.env.BUNDLE_ID ? { 'appium:bundleId': process.env.BUNDLE_ID } : {}),
      'appium:autoAcceptAlerts': false,
      'appium:noReset': true,
      ...(isLocal ? {} : { 'bstack:options': bstackOptions }),
    },
  ],
};
