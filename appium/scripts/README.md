# Local Test Runner

`run-local.sh` builds the app, boots a simulator/emulator, starts Appium, resets app state, and runs the E2E test suite.

## Setup

1. **Clone the SDK repo** next to `sdk-shared` (or set `FLUTTER_DIR`):

   ```
   Code/SDK/
   ├── sdk-shared/           # this repo
   └── OneSignal-Flutter-SDK/ # Flutter SDK (auto-detected at ../../OneSignal-Flutter-SDK)
   ```

2. **Create your `.env`** file:

   ```bash
   cp .env.example .env
   ```

   At minimum, set your OneSignal credentials (the script fails fast without them). Use the OneSignal app **dedicated to Appium tests** — not a general or shared app, whose live in-app marketing campaigns can cover the UI and cause misleading "element not displayed" failures:

   ```
   ONESIGNAL_APP_ID=your-appium-test-app-id
   ONESIGNAL_API_KEY=your-appium-test-api-key
   ```

3. **Install Appium and drivers** (if not already):

   ```bash
   npm i -g appium
   appium driver install xcuitest      # iOS
   appium driver install uiautomator2  # Android
   ```

4. **Install [Vite+](https://vite.plus)** (if not already) — it provides the `vpx` command the script uses to run WebdriverIO (the `vpx` symlink is created on `vp`'s first run):

   ```bash
   curl -fsSL https://vite.plus | bash
   ```

The script checks all of these up front and prints the exact install command for anything missing; `node_modules` in `appium/` is installed automatically on first run.

> **CI vs local:** CI runs on BrowserStack (Node 24) without this script. Notification-dependent tests (in `02_push.spec.ts` and `12_activity.spec.ts`) are skipped on BrowserStack iOS via `isBrowserStackIos()` because BrowserStack requires an Enterprise Signing Certificate for those notification flows, which we don't have yet (temporary — they'll be re-enabled once signing support is available), so for now they only run locally. If your local Node is 26+, the script sets `WDIO_USE_NATIVE_FETCH=1` automatically.

## Usage

```bash
./run-local.sh --platform=ios --sdk=flutter
```

If `--platform` or `--sdk` are not provided, the script prompts interactively.

### Options

| Flag            | Description                                                 |
| --------------- | ----------------------------------------------------------- |
| `--platform=P`  | `ios` or `android`                                          |
| `--sdk=S`       | `flutter` or `react-native`                                 |
| `--spec=GLOB`   | Spec file glob (default: `tests/specs/**/*.spec.ts`)        |
| `--skip`        | Skip build, device launch, and app reset (rerun tests only) |
| `--skip-build`  | Skip app build (reuse existing `.app`/`.apk`)               |
| `--skip-device` | Skip simulator/emulator launch                              |
| `--skip-reset`  | Keep existing app data between runs                         |
| `-h, --help`    | Show help                                                   |

### Examples

Run all tests (full build + fresh install):

```bash
./run-local.sh --platform=ios --sdk=flutter
```

Run a single spec file:

```bash
./run-local.sh --platform=ios --sdk=flutter --spec="tests/specs/01_user.spec.ts"

# partial
./run-local.sh --platform=ios --sdk=flutter --spec="01_"
```

Run multiple spec files:

```bash
./run-local.sh --platform=ios --sdk=flutter --spec="tests/specs/{01_user,08_outcome}.spec.ts"

# partial
./run-local.sh --platform=ios --sdk=flutter --spec="tests/specs/{01_,08_}*"
```

Re-run tests without rebuilding or relaunching the simulator:

```bash
./run-local.sh --platform=ios --sdk=flutter --skip
```

Skip only the build (simulator + reset still happen):

```bash
./run-local.sh --platform=ios --sdk=flutter --skip-build
```

### Environment Variables

All env vars can be set in `.env` or exported in your shell. See [`.env.example`](.env.example) for the full list.

| Variable            | Default                            | Description                                   |
| ------------------- | ---------------------------------- | --------------------------------------------- |
| `ONESIGNAL_APP_ID`  | --                                 | OneSignal app ID (written to demo app `.env`) |
| `ONESIGNAL_API_KEY` | --                                 | OneSignal REST API key                        |
| `FLUTTER_DIR`       | `../../OneSignal-Flutter-SDK`      | Path to the Flutter SDK repo                  |
| `APP_PATH`          | auto-detected from build           | Path to `.app` or `.apk`                      |
| `BUNDLE_ID`         | `com.onesignal.example`            | App bundle/package ID                         |
| `DEVICE`            | `iPhone 17` / `Samsung Galaxy S26` | Device name for WebdriverIO                   |
| `OS_VERSION`        | `26.2` / `16`                      | Platform version                              |
| `IOS_SIMULATOR`     | same as `DEVICE`                   | Simulator name for `simctl`                   |
| `IOS_RUNTIME`       | `iOS-26-2`                         | simctl runtime identifier                     |
| `AVD_NAME`          | `Samsung_Galaxy_S26`               | Android AVD name                              |
| `APPIUM_PORT`       | `4723`                             | Appium server port                            |

## Troubleshooting

- **Test fails with "element not displayed"**: The app may not have been rebuilt after code changes. The script rebuilds by default, but if you used `--skip-build`, delete the existing build and re-run:

  ```bash
  rm -rf /path/to/OneSignal-Flutter-SDK/examples/demo/build/ios/iphonesimulator/Runner.app
  ./run-local.sh --platform=ios --sdk=flutter
  ```

- **Simulator not found**: The script falls back automatically to the booted simulator, or to the newest installed iOS runtime, when the requested device/runtime isn't on your machine. To pin a specific one, check `xcrun simctl list devices available` and set `DEVICE` / `OS_VERSION` / `IOS_RUNTIME` in your `.env`.

- **Appium fails to start**: Make sure Appium and the required drivers are installed (`appium driver list --installed`). The script checks both up front and prints the install command for anything missing.

- **`vpx: command not found`**: Install [Vite+](https://vite.plus) with `curl -fsSL https://vite.plus | bash`. If `vp` is installed but `vpx` is missing, run `vp --version` once — `vp` creates the `vpx` symlink on its first run.

- **`UND_ERR_INVALID_ARG` / fetch errors on Node 26+**: webdriverio's undici dispatcher is rejected by Node 26+'s `fetch`. The script exports `WDIO_USE_NATIVE_FETCH=1` automatically when it detects Node 26+; if you invoke `vpx wdio run` manually, export it yourself.

- **Test waiting for the notification permission alert fails**: A reused simulator remembers a previously-decided notification permission, and `simctl privacy` can't reset it. The script's app reset uninstalls the app, which restores the prompt — avoid `--skip`/`--skip-reset` when running the push specs.

- **Misleading "element not displayed" failures**: Live in-app marketing campaigns on the configured app can cover the UI. Use the OneSignal app dedicated to Appium tests (set `ONESIGNAL_APP_ID`/`ONESIGNAL_API_KEY` in `.env`) rather than a general or shared app.
