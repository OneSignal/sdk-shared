type SdkType =
  | 'react-native'
  | 'flutter'
  | 'capacitor'
  | 'ios-native'
  | 'android-native';

const VALID_SDK_TYPES = new Set<string>([
  'react-native',
  'flutter',
  'capacitor',
  'ios-native',
  'android-native',
]);

function getSdkType(): SdkType {
  const sdkType = process.env.SDK_TYPE;
  if (sdkType && VALID_SDK_TYPES.has(sdkType)) {
    return sdkType as SdkType;
  }
  throw new Error(
    `SDK_TYPE env var must be one of: ${[...VALID_SDK_TYPES].join(', ')}. Got: ${sdkType}`,
  );
}

/**
 * Select an element by its cross-platform test ID.
 *
 * Native iOS uses `accessibilityIdentifier`, native Android Compose uses
 * `testTag`, RN uses `testID`, and Flutter uses `Semantics(label:)` — all
 * map to Appium accessibility id. Capacitor uses `data-testid` as a CSS
 * attribute inside a WebView.
 */
export async function byTestId(id: string) {
  const sdkType = getSdkType();
  switch (sdkType) {
    case 'react-native':
    case 'flutter':
    case 'ios-native':
    case 'android-native':
      return $(`~${id}`);
    case 'capacitor':
      return $(`[data-testid="${id}"]`);
  }
}

/**
 * Select an element by visible text content.
 * Useful for buttons/labels without explicit test IDs.
 */
export async function byText(text: string) {
  const sdkType = getSdkType();
  switch (sdkType) {
    case 'react-native':
    case 'flutter':
    case 'ios-native':
    case 'android-native':
      return $(`~${text}`);
    case 'capacitor':
      return $(`//*[contains(text(), "${text}")]`);
  }
}
