import { sharedConfig, bstackOptions } from './wdio.shared.conf.js';

const isLocal = !process.env.BROWSERSTACK_USERNAME;
const isDotNet = process.env.SDK_TYPE === 'dotnet';

// .NET MAUI compiles Android activities with CRC-hashed Java class names (e.g.
// `crc64126b3a41c71c5f27.MainActivity`) instead of the C# namespace path, so
// Appium's launchable-activity wait check can't validate the launch and times
// out. Skip that check (`appWaitForLaunch: false`) and rely on the per-test
// `waitForAppReady` element wait to confirm the app is up. MAUI's cold install
// also takes longer than the defaults, so widen the install/launch budgets.
const dotnetAndroidCaps = isDotNet
  ? {
      'appium:appWaitForLaunch': false,
      'appium:appWaitDuration': 120_000,
      'appium:androidInstallTimeout': 180_000,
    }
  : {};

// Per-session UiAutomator2 ports. Required when running 2+ Android sessions
// in parallel on one host so the instrumentation/chromedriver sockets don't
// collide on the defaults (8200 / random). Single-session runs can leave both
// unset and let Appium pick the defaults.
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
      // Pin to the emulator the runner script resolved (matches AVD_NAME).
      // Without this, multi-emulator hosts let Appium pick non-deterministically.
      ...(process.env.APPIUM_UDID ? { 'appium:udid': process.env.APPIUM_UDID } : {}),
      ...(process.env.BUNDLE_ID ? { 'appium:appPackage': process.env.BUNDLE_ID } : {}),
      'appium:autoGrantPermissions': false,
      'appium:noReset': true,
      'appium:disableWindowAnimation': true,

      ...dotnetAndroidCaps,
      ...parallelPortCaps,

      ...(isLocal ? {} : { 'bstack:options': bstackOptions }),

      // Disable ID locator autocompletion to avoid Flutter's Semantics(container:true) wrapping inputs in a View.
      // .NET MAUI exposes AutomationId as the Android resource-id but namespaced
      // (e.g. `com.onesignal.example:id/main_scroll_view`); the test suite
      // queries by short id, so leave autocompletion ON for dotnet so Appium
      // prepends the package automatically.
      // @ts-expect-error - Appium types are not fully compatible with WebdriverIO types
      'appium:settings[disableIdLocatorAutocompletion]': !isDotNet,

      // Hide keyboard during session
      'appium:hideKeyboard': true,
    },
  ],
};
