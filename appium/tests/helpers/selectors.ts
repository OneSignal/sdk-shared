type SdkType =
  | 'android'
  | 'capacitor'
  | 'cordova'
  | 'dotnet'
  | 'flutter'
  | 'ios'
  | 'react-native'
  | 'unity';

const VALID_SDK_TYPES = new Set<string>([
  'android',
  'capacitor',
  'cordova',
  'dotnet',
  'flutter',
  'ios',
  'react-native',
  'unity',
]);

type Platform = 'ios' | 'android';

export function getPlatform(): Platform {
  const name = (driver.capabilities.platformName ?? '').toLowerCase();
  if (name === 'ios') return 'ios';
  if (name === 'android') return 'android';
  throw new Error(`Unexpected platformName: ${name}`);
}

export function getTestExternalId(): string {
  const sdk = getSdkType();
  const platform = getPlatform();
  if (sdk === platform) return `appium-${sdk}`;
  return `appium-${sdk}-${platform}`;
}

const TEST_DATA: Record<string, { sms: string; email: string; customEvent: string }> = {
  'appium-flutter-ios': {
    sms: '+12003004000',
    email: 'flutter-ios@test.com',
    customEvent: 'flutter_ios',
  },
  'appium-flutter-android': {
    sms: '+12003004001',
    email: 'flutter-android@test.com',
    customEvent: 'flutter_android',
  },
  'appium-react-native-ios': {
    sms: '+12003004002',
    email: 'rn-ios@test.com',
    customEvent: 'rn_ios',
  },
  'appium-react-native-android': {
    sms: '+12003004003',
    email: 'rn-android@test.com',
    customEvent: 'rn_android',
  },
  'appium-capacitor-ios': {
    sms: '+12003004004',
    email: 'capacitor-ios@test.com',
    customEvent: 'capacitor_ios',
  },
  'appium-capacitor-android': {
    sms: '+12003004005',
    email: 'capacitor-android@test.com',
    customEvent: 'capacitor_android',
  },
  'appium-cordova-ios': {
    sms: '+12003004006',
    email: 'cordova-ios@test.com',
    customEvent: 'cordova_ios',
  },
  'appium-cordova-android': {
    sms: '+12003004007',
    email: 'cordova-android@test.com',
    customEvent: 'cordova_android',
  },
  'appium-unity-ios': {
    sms: '+12003004008',
    email: 'unity-ios@test.com',
    customEvent: 'unity_ios',
  },
  'appium-unity-android': {
    sms: '+12003004009',
    email: 'unity-android@test.com',
    customEvent: 'unity_android',
  },
  'appium-dotnet-ios': {
    sms: '+12003004010',
    email: 'dotnet-ios@test.com',
    customEvent: 'dotnet_ios',
  },
  'appium-dotnet-android': {
    sms: '+12003004011',
    email: 'dotnet-android@test.com',
    customEvent: 'dotnet_android',
  },
  'appium-ios': { sms: '+12003004012', email: 'ios@test.com', customEvent: 'ios' },
  'appium-android': {
    sms: '+12003004013',
    email: 'android@test.com',
    customEvent: 'android',
  },
};

export function getTestData() {
  const id = getTestExternalId();
  const data = TEST_DATA[id];
  if (!data) throw new Error(`No test data for ${id}`);
  return data;
}

export async function deleteUser(externalId: string) {
  console.log(`Deleting user: ${externalId}`);
  try {
    const response = await fetch(
      `https://api.onesignal.com/apps/${process.env.ONESIGNAL_APP_ID}/users/by/external_id/${externalId}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Key ${process.env.ONESIGNAL_API_KEY}`,
        },
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to delete user: ${response.statusText}`);
    }
    console.log(`User deleted successfully`);
  } catch (error) {
    console.error(`Failed to delete user: ${error}`);
  }
}

export function getSdkType(): SdkType {
  const sdkType = process.env.SDK_TYPE;
  if (sdkType && VALID_SDK_TYPES.has(sdkType)) {
    return sdkType as SdkType;
  }
  throw new Error(
    `SDK_TYPE env var must be one of: ${[...VALID_SDK_TYPES].join(', ')}. Got: ${sdkType}`,
  );
}

type TextReadableElement = {
  getText(): Promise<string>;
  getAttribute(name: string): Promise<string | null>;
};

function withTextFallback<T extends TextReadableElement>(el: T): T {
  if (!(getPlatform() === 'android' && getSdkType() === 'flutter')) {
    return el;
  }

  return new Proxy(el, {
    get(target, prop, receiver) {
      if (prop === 'getText') {
        return async () => readElementText(target);
      }

      const value = Reflect.get(target, prop, receiver);
      if (typeof value === 'function') {
        return value.bind(target);
      }

      return value;
    },
  });
}

/**
 * Select an element by its cross-platform test ID.
 *
 * Native iOS uses `accessibilityIdentifier`, native Android Compose uses
 * `testTag`, RN uses `testID` — all map to Appium accessibility id (`~`).
 * Flutter uses `Semantics(identifier:)` which maps to `accessibilityIdentifier`
 * on iOS (`~`) but to `resource-id` on Android (UiAutomator selector).
 * Capacitor uses `data-testid` as a CSS attribute inside a WebView.
 */
export async function byTestId(id: string) {
  const sdkType = getSdkType();
  const platform = getPlatform();

  if (sdkType === 'capacitor') return withTextFallback(await $(`[data-testid="${id}"]`));
  if (sdkType === 'flutter' && platform === 'android') return withTextFallback(await $(`id=${id}`));

  return withTextFallback(await $(`~${id}`));
}

/**
 * Select an element by visible text content.
 * Use partial: true to match elements that contain the text.
 */
export async function byText(text: string, partial = false) {
  const platform = getPlatform();
  const sdkType = getSdkType();

  if (sdkType === 'capacitor') {
    return withTextFallback(await $(`//*[contains(text(), "${text}")]`));
  }

  if (platform === 'ios') {
    const op = partial ? 'CONTAINS' : '==';
    return withTextFallback(await $(`-ios predicate string:label ${op} "${text}"`));
  }

  if (partial) {
    return withTextFallback(
      await $(`//*[contains(@content-desc, "${text}") or contains(@text, "${text}")]`),
    );
  }

  return withTextFallback(await $(`//*[@content-desc="${text}" or @text="${text}"]`));
}

export async function readElementText(
  el: {
    getText(): Promise<string>;
    getAttribute(name: string): Promise<string | null>;
  },
): Promise<string> {
  const text = (await el.getText()).trim();
  if (text) return text;

  const attributeNames =
    getPlatform() === 'ios'
      ? ['label', 'name', 'value']
      : ['content-desc', 'contentDescription', 'text', 'name'];

  for (const attributeName of attributeNames) {
    try {
      const value = (await el.getAttribute(attributeName))?.trim();
      if (value) return value;
    } catch {
      /* best-effort */
    }
  }

  return '';
}
