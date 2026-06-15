# Appium E2E Tests

End-to-end tests for OneSignal mobile SDKs using [Appium](https://appium.io/) and [WebdriverIO](https://webdriver.io/).

## Prerequisites

- [Node.js](https://nodejs.org/) (or [Bun](https://bun.sh/)) — CI runs Node 24. Node 26+ works locally: `scripts/run-local.sh` sets `WDIO_USE_NATIVE_FETCH=1` automatically to work around webdriverio's undici dispatcher being rejected by Node 26+'s `fetch` (`UND_ERR_INVALID_ARG`).
- [Vite+](https://vite.plus) (`curl -fsSL https://vite.plus | bash`) — provides the `vpx` command used to run WebdriverIO here (the `vpx` symlink is created on `vp`'s first run).
- [Appium](https://appium.io/docs/en/latest/quickstart/install/) (`npm i -g appium`)
- Appium drivers:
  - iOS: `appium driver install xcuitest`
  - Android: `appium driver install uiautomator2`
- [Flutter SDK](https://flutter.dev/docs/get-started/install) (for Flutter tests)
- Xcode with iOS simulators (for iOS)
- Android SDK with an AVD configured (for Android)

## CI vs Local

CI (`.github/workflows/appium-e2e.yml`) runs these tests on BrowserStack devices with Node 24 and does **not** use `scripts/run-local.sh` — it calls `vpx wdio run "wdio.<platform>.conf.ts"` directly.

Notification-dependent tests currently only run locally: `02_push.spec.ts` and `12_activity.spec.ts` mark them with `itSkipBsIos` (`isBrowserStackIos()` from `tests/helpers/app.ts`, true when `BROWSERSTACK_USERNAME` is set and the platform is iOS). BrowserStack requires the app to be built with an Enterprise Signing Certificate for these notification flows, which we don't have yet — a temporary signing limitation, not an inherent device capability limit. The skip helper exists so these tests can be re-enabled once signing support is available. Until then, run `scripts/run-local.sh` on iOS to cover them.

## Directory Structure

```
appium/
├── scripts/
│   ├── run-local.sh       # Local test runner — builds, launches, and runs tests
│   └── .env.example       # Template for local env vars (copy to .env)
├── tests/
│   ├── helpers/            # Shared utilities (selectors, app helpers, logger)
│   └── specs/              # Test files (numbered for execution order)
├── wdio.shared.conf.ts     # Shared WebdriverIO config
├── wdio.ios.conf.ts        # iOS-specific config
└── wdio.android.conf.ts    # Android-specific config
```

## Running Tests Locally

See [`scripts/README.md`](scripts/README.md) for setup and usage instructions.

Quick start:

```bash
cd scripts
cp .env.example .env   # add the OneSignal app dedicated to Appium tests
./run-local.sh --platform=ios --sdk=flutter
```

## Test Specs

Tests are numbered to run in dependency order (user login happens before push/email/SMS tests that require a logged-in user):

| File                  | Description                    |
| --------------------- | ------------------------------ |
| `01_user.spec.ts`     | Login, logout, anonymous state |
| `02_push.spec.ts`     | Push subscription              |
| `03_iam.spec.ts`      | In-app messaging               |
| `04_alias.spec.ts`    | Alias operations               |
| `05_email.spec.ts`    | Email subscription             |
| `06_sms.spec.ts`      | SMS subscription               |
| `07_tag.spec.ts`      | Tag operations                 |
| `08_outcome.spec.ts`  | Outcome sending                |
| `09_trigger.spec.ts`  | Trigger add/remove/clear       |
| `10_event.spec.ts`    | Custom event tracking          |
| `11_location.spec.ts` | Location prompting and sharing |
| `12_activity.spec.ts` | iOS Live Activity lifecycle    |
