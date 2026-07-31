# Local Test Runner

`run-local.sh` builds the app, boots a simulator/emulator, starts Appium, resets app state, and runs the E2E test suite.

## Setup

**Quick start:** run `./bootstrap.sh` — it idempotently installs Appium + drivers,
Vite+ (and the `vpx` symlink), test deps, and creates `.env` from the example.
Then fill in your OneSignal credentials in `.env` and open a new shell so `vpx`
is on `PATH`. The manual steps below are the same thing, broken out.

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

4. **Install [Vite+](https://vite.plus)** (if not already) — it provides the `vpx` command the script uses to run WebdriverIO:

   ```bash
   curl -fsSL https://vite.plus | bash
   ```

   `vpx` is the `vp` binary under an argv[0] alias. If the installer doesn't create the symlink (seen on some versions), add it manually and open a new shell:

   ```bash
   ln -sf ../current/bin/vp ~/.vite-plus/bin/vpx
   ```

   > Note: the npm package `vite-plus` ships only `vp`/`oxfmt`/`oxlint` (no `vpx`). Use the official installer above; `./bootstrap.sh` handles the symlink for you.

The script checks all of these up front and prints the exact install command for anything missing; `node_modules` in `appium/` is installed automatically on first run.

> **CI vs local:** CI runs on BrowserStack (Node 24) without this script. Notification-dependent tests (in `02_push.spec.ts` and `12_activity.spec.ts`) are skipped on BrowserStack iOS via `isBrowserStackIos()` because BrowserStack requires an Enterprise Signing Certificate for those notification flows, which we don't have yet (temporary — they'll be re-enabled once signing support is available), so for now they only run locally. If your local Node is 26+, the script sets `WDIO_USE_NATIVE_FETCH=1` automatically.

### Per-SDK prerequisites

`bootstrap.sh` handles the shared tooling. Individual SDKs need a bit more the first time:

- **All wrapper SDKs:** install the SDK repo's own deps once (`bun install` in the repo root). `build.sh` packs the SDK from source but does not install its deps.
- **flutter:** enable Swift Package Manager once — `flutter config --enable-swift-package-manager`. Without it, `flutter build ios` falls back to CocoaPods, which fails on the prebuilt OneSignal XCFramework with `Multiple commands produce …/XCFrameworkIntermediates/…`.
- **dotnet:** the demo targets **.NET 10**, so use the **official .NET 10 SDK** (Homebrew's `dotnet` can't install workloads), then `dotnet workload install maui`. iOS builds require **Xcode 26.6 / iOS 26.5 SDK** — run `xcodebuild -downloadPlatform iOS` to get the matching simulator runtime. On Apple Silicon, if the tarball SDK is killed with "Code Signature Invalid", ad-hoc re-sign it (`codesign --force --sign - …`).
- **unity:** install the exact editor the demo pins — see `examples/demo/ProjectSettings/ProjectVersion.txt` (e.g. `6000.4.11f1`) — **with the iOS Build Support module**, and activate a Unity license (Unity Hub → Preferences → Licenses). On recent macOS, `brew install rsync`: Apple's bundled `openrsync` fails the Unity XCFramework dSYM copy during the Xcode build.

## Usage

```bash
./run-local.sh --platform=ios --sdk=flutter
```

If `--platform` or `--sdk` are not provided, the script prompts interactively.

### Options

| Flag            | Description                                                 |
| --------------- | ----------------------------------------------------------- |
| `--platform=P`  | `ios` or `android`                                          |
| `--sdk=S`       | `flutter`, `react-native`, `cordova`, `capacitor`, `expo`, `dotnet`, `unity`, `android`, `ios` |
| `--spec=GLOB`   | Spec file glob (default: `tests/specs/**/*.spec.ts`)        |
| `--skip`        | Skip build, device launch, and app reset (rerun tests only) |
| `--skip-build`  | Skip app build (reuse existing `.app`/`.apk`)               |
| `--skip-device` | Skip simulator/emulator launch                              |
| `--skip-reset`  | Keep existing app data between runs                         |
| `--pods`        | Use `examples/demo-pods` for Flutter, Cordova, and Capacitor |
| `--release`     | Check out the latest release point in each SDK repo first    |
| `-h, --help`    | Show help                                                   |

### Examples

Run all tests (full build + fresh install):

```bash
./run-local.sh --platform=ios --sdk=flutter
```

Run against the latest SDK release points:

```bash
./run-local.sh --platform=ios --sdk=flutter --release
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

## Running all combos (`run-all.sh`)

`run-all.sh` loops `run-local.sh` over every SDK/platform combo and prints a PASS/FAIL summary.

```bash
./run-all.sh                              # every combo, both platforms
./run-all.sh --platform=ios               # iOS only
./run-all.sh --sdks=flutter,react-native  # subset of SDKs
./run-all.sh --release                    # check out the latest release point per repo first
./run-all.sh --bail                       # stop after the first failing combo
```

`--release` is available on both `run-all.sh` and `run-local.sh`. It runs `checkout-releases.sh`, which checks out the newest stable `rel/X.Y.Z` branch (or newest semver tag for expo/ios) in each SDK repo, honoring the `*_DIR` overrides from `.env`. Repos with uncommitted changes are skipped, never clobbered.

> Within each combo the specs still **bail on the first failing test** locally (`mochaOpts.bail = isLocal`), so one early failure hides the specs after it.

### Environment Variables

All env vars can be set in `.env` or exported in your shell. See [`.env.example`](.env.example) for the full list.

| Variable            | Default                            | Description                                   |
| ------------------- | ---------------------------------- | --------------------------------------------- |
| `ONESIGNAL_APP_ID`  | --                                 | OneSignal app ID (written to demo app `.env`) |
| `ONESIGNAL_API_KEY` | --                                 | OneSignal REST API key                        |
| `FLUTTER_DIR`       | `../../OneSignal-Flutter-SDK`      | Path to the Flutter SDK repo                  |
| `RN_DIR`            | `../../react-native-onesignal`    | React Native SDK repo                         |
| `CORDOVA_DIR`       | `../../OneSignal-Cordova-SDK`      | Cordova SDK repo                              |
| `CAPACITOR_DIR`     | `../../OneSignal-Capacitor-SDK`    | Capacitor SDK repo                           |
| `EXPO_DIR`          | `../../onesignal-expo-plugin`      | Expo plugin repo                             |
| `DOTNET_DIR`        | `../../DotNet/OneSignal-DotNet-SDK`| .NET MAUI SDK repo                           |
| `UNITY_DIR`         | `../../OneSignal-Unity-SDK`        | Unity SDK repo                               |
| `ANDROID_DIR`       | `../../OneSignal-Android-SDK`      | Native Android SDK repo                      |
| `IOS_DIR`           | `../../OneSignal-iOS-SDK`          | Native iOS SDK repo                          |
| `UNITY_PATH`        | Unity Hub editor path             | Unity Editor binary (unity builds)           |
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

- **`vpx: command not found`**: Run `./bootstrap.sh` (installs Vite+ and creates the `vpx` symlink), or install manually with `curl -fsSL https://vite.plus | bash`. The installer sometimes omits the `vpx` symlink — if `vp` exists but `vpx` doesn't, create it and open a new shell: `ln -sf ../current/bin/vp ~/.vite-plus/bin/vpx`. (The npm `vite-plus` package ships no `vpx`.)

- **`UND_ERR_INVALID_ARG` / fetch errors on Node 26+**: webdriverio's undici dispatcher is rejected by Node 26+'s `fetch`. The script exports `WDIO_USE_NATIVE_FETCH=1` automatically when it detects Node 26+; if you invoke `vpx wdio run` manually, export it yourself.

- **Test waiting for the notification permission alert fails**: A reused simulator remembers a previously-decided notification permission, and `simctl privacy` can't reset it. The script's app reset uninstalls the app, which restores the prompt — avoid `--skip`/`--skip-reset` when running the push specs.

- **Misleading "element not displayed" failures**: Live in-app marketing campaigns on the configured app can cover the UI. Use the OneSignal app dedicated to Appium tests (set `ONESIGNAL_APP_ID`/`ONESIGNAL_API_KEY` in `.env`) rather than a general or shared app.

- **Only a few specs ran before the suite stopped**: Local runs bail on the first failing test (`mochaOpts.bail = isLocal`), so one early failure masks the specs after it. Use `--spec` to isolate a spec, or fix the first failure and re-run.

- **Image-notification / Live-Activity tests fail locally**: The `02_push` image test and `12_activity` are skipped on BrowserStack and only run locally, so they need manual attention. The image test's attachment check can be too short for the simulator (rich media downloads slower than the wait), so it may flake — confirm manually by sending the notification and long-pressing the banner to see the attached image.
