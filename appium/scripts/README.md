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

   At minimum, set your OneSignal credentials:

   ```
   ONESIGNAL_APP_ID=your-app-id
   ONESIGNAL_API_KEY=your-api-key
   ```

3. **Install Appium and drivers** (if not already):

   ```bash
   npm i -g appium
   appium driver install xcuitest
   ```

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
./run-local.sh --platform=ios --sdk=flutter --spec="01"
```

Run multiple spec files:

```bash
./run-local.sh --platform=ios --sdk=flutter --spec="tests/specs/{01_user,08_outcome}.spec.ts"

# partial
./run-local.sh --platform=ios --sdk=flutter --spec="tests/specs/{01,08}*"
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

- **Simulator not found**: Check available simulators with `xcrun simctl list devices available` and update `IOS_SIMULATOR` / `IOS_RUNTIME` in your `.env`.

- **Appium fails to start**: Make sure Appium and the required drivers are installed (`appium driver list --installed`).
