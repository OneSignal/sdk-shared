import { sharedConfig, bstackOptions } from './wdio.shared.conf.js';

const isLocal = !process.env.BROWSERSTACK_USERNAME;
const isDotNet = process.env.SDK_TYPE === 'dotnet';
const appPackage = process.env.BUNDLE_ID || 'com.onesignal.example';
const appWaitPackages = [
  appPackage,
  'com.android.permissioncontroller',
  'com.google.android.permissioncontroller',
  'com.android.packageinstaller',
].join(',');

// Accept app or permission UI at session start; waitForAppReady owns readiness.
// .NET needs longer install/startup time.
const androidCaps = {
  'appium:appWaitForLaunch': false,
  'appium:appWaitPackage': appWaitPackages,
  'appium:appWaitActivity': '*',
  ...(isDotNet
    ? {
        'appium:appWaitDuration': 120_000,
        'appium:androidInstallTimeout': 180_000,
      }
    : {}),
};

// Optional per-session ports for parallel Android runs.
const parallelPortCaps = {
  ...(process.env.SYSTEM_PORT ? { 'appium:systemPort': Number(process.env.SYSTEM_PORT) } : {}),
  ...(process.env.CHROMEDRIVER_PORT
    ? { 'appium:chromedriverPort': Number(process.env.CHROMEDRIVER_PORT) }
    : {}),
};

export const config: WebdriverIO.Config = {
  ...sharedConfig,
  capabilities: [
    {
      platformName: 'Android',
      'appium:app': isLocal ? process.env.APP_PATH : process.env.BROWSERSTACK_APP_URL,
      'appium:deviceName': process.env.DEVICE || 'Samsung Galaxy S24',
      'appium:platformVersion': process.env.OS_VERSION || '16.0',
      'appium:automationName': 'UiAutomator2',
      // Pin runner-selected emulator.
      ...(process.env.APPIUM_UDID ? { 'appium:udid': process.env.APPIUM_UDID } : {}),
      ...(process.env.BUNDLE_ID ? { 'appium:appPackage': process.env.BUNDLE_ID } : {}),
      'appium:autoGrantPermissions': false,
      'appium:noReset': true,
      'appium:disableWindowAnimation': true,
      // Android 16's cached app freezer can stall uiautomator2 commands; default 60s
      // newCommandTimeout fires and tears down the session mid-test. Extend it so a
      // brief freeze does not kill the run.
      'appium:newCommandTimeout': 300,

      ...androidCaps,
      ...parallelPortCaps,

      ...(isLocal ? {} : { 'bstack:options': bstackOptions }),

      // Flutter needs raw ids; .NET needs Appium package-prefixing.
      // @ts-expect-error - Appium settings cap is not in WDIO types.
      'appium:settings[disableIdLocatorAutocompletion]': !isDotNet,

      // Hide keyboard during session.
      'appium:hideKeyboard': true,
    },
  ],
};
