import { sharedConfig, bstackOptions } from './wdio.shared.conf.js';

const isLocal = !process.env.BROWSERSTACK_USERNAME;
const isDotNet = process.env.SDK_TYPE === 'dotnet';

// .NET MAUI compiles Android activities with CRC-hashed Java class names (e.g.
// `crc64126b3a41c71c5f27.MainActivity`) instead of the C# namespace path, so
// Appium's launchable-activity wait check fails and the session times out.
// Wildcard the wait-activity match and give MAUI's slower startup more headroom.
const dotnetAndroidCaps = isDotNet
  ? {
      'appium:appWaitActivity': '*',
      'appium:appWaitForLaunch': true,
      'appium:appWaitDuration': 120_000,
      'appium:androidInstallTimeout': 180_000,
    }
  : {};

export const config: WebdriverIO.Config = {
  ...sharedConfig,
  capabilities: [
    {
      platformName: 'Android',
      'appium:app': isLocal ? process.env.APP_PATH : process.env.BROWSERSTACK_APP_URL,
      'appium:deviceName': process.env.DEVICE || 'Samsung Galaxy S24',
      'appium:platformVersion': process.env.OS_VERSION || '16.0',
      'appium:automationName': 'UiAutomator2',
      ...(process.env.BUNDLE_ID ? { 'appium:appPackage': process.env.BUNDLE_ID } : {}),
      'appium:autoGrantPermissions': false,
      'appium:noReset': true,

      ...dotnetAndroidCaps,

      ...(isLocal ? {} : { 'bstack:options': bstackOptions }),

      // Disable ID locator autocompletion to avoid Flutter's Semantics(container:true) wrapping inputs in a View.
      // @ts-expect-error - Appium types are not fully compatible with WebdriverIO types
      'appium:settings[disableIdLocatorAutocompletion]': true,

      // Hide keyboard during session
      'appium:hideKeyboard': true,
    },
  ],
};
