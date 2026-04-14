# Appium E2E Tests

End-to-end tests for OneSignal mobile SDKs using [Appium](https://appium.io/) and [WebdriverIO](https://webdriver.io/).

## Prerequisites

- [Node.js](https://nodejs.org/) (or [Bun](https://bun.sh/))
- [Appium](https://appium.io/docs/en/latest/quickstart/install/) (`npm i -g appium`)
- Appium drivers:
  - iOS: `appium driver install xcuitest`
  - Android: `appium driver install uiautomator2`
- [Flutter SDK](https://flutter.dev/docs/get-started/install) (for Flutter tests)
- Xcode with iOS simulators (for iOS)
- Android SDK with an AVD configured (for Android)

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
cp .env.example .env   # add your OneSignal credentials
./run-local.sh --platform=ios --sdk=flutter
```

## Test Specs

Tests are numbered to run in dependency order (user login happens before push/email/SMS tests that require a logged-in user):

| File | Description |
|---|---|
| `1_user.spec.ts` | Login, logout, anonymous state |
| `2_push.spec.ts` | Push subscription |
| `3_iam.spec.ts` | In-app messaging |
| `4_alias.spec.ts` | Alias operations |
| `5_email.spec.ts` | Email subscription |
| `6_sms.spec.ts` | SMS subscription |
| `7_tag.spec.ts` | Tag operations |
