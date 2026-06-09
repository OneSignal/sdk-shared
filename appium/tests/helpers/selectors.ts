const VALID_SDK_TYPES = [
  'android',
  'capacitor',
  'cordova',
  'dotnet',
  'expo',
  'flutter',
  'ios',
  'react-native',
  'unity',
] as const;

type SdkType = (typeof VALID_SDK_TYPES)[number];
const VALID_SDK_TYPE_SET = new Set<string>(VALID_SDK_TYPES);

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
  if (sdk === platform) return sdk;
  return `${sdk}-${platform}`;
}

export const TEST_DATA: Record<
  string,
  { sms: string; email: string; customEvent: string; alias: string }
> = {
  'flutter-ios': {
    sms: '+12003004000',
    email: 'fl-i@os.co',
    customEvent: 'flutter-ios',
    alias: 'fl-i',
  },
  'flutter-android': {
    sms: '+12003004001',
    email: 'fl-a@os.co',
    customEvent: 'flutter_android',
    alias: 'fl-a',
  },
  'react-native-ios': {
    sms: '+12003004002',
    email: 'rn-i@os.co',
    customEvent: 'rn_ios',
    alias: 'rn-i',
  },
  'react-native-android': {
    sms: '+12003004003',
    email: 'rn-a@os.co',
    customEvent: 'rn_android',
    alias: 'rn-a',
  },
  'capacitor-ios': {
    sms: '+12003004004',
    email: 'cap-i@os.co',
    customEvent: 'capacitor_ios',
    alias: 'cap-i',
  },
  'capacitor-android': {
    sms: '+12003004005',
    email: 'cap-a@os.co',
    customEvent: 'capacitor_android',
    alias: 'cap-a',
  },
  'cordova-ios': {
    sms: '+12003004006',
    email: 'co-i@os.co',
    customEvent: 'cordova_ios',
    alias: 'co-i',
  },
  'cordova-android': {
    sms: '+12003004007',
    email: 'co-a@os.co',
    customEvent: 'cordova_android',
    alias: 'co-a',
  },
  'unity-ios': {
    sms: '+12003004008',
    email: 'un-i@os.co',
    customEvent: 'unity_ios',
    alias: 'un-i',
  },
  'unity-android': {
    sms: '+12003004009',
    email: 'un-a@os.co',
    customEvent: 'unity_android',
    alias: 'un-a',
  },
  'dotnet-ios': {
    sms: '+12003004010',
    email: 'dn-i@os.co',
    customEvent: 'dotnet_ios',
    alias: 'dn-i',
  },
  'dotnet-android': {
    sms: '+12003004011',
    email: 'dn-a@os.co',
    customEvent: 'dotnet_android',
    alias: 'dn-a',
  },
  'expo-ios': {
    sms: '+12003004012',
    email: 'ex-i@os.co',
    customEvent: 'expo_ios',
    alias: 'ex-i',
  },
  'expo-android': {
    sms: '+12003004013',
    email: 'ex-a@os.co',
    customEvent: 'expo_android',
    alias: 'ex-a',
  },
  ios: { sms: '+12003004014', email: 'ios@os.co', customEvent: 'ios', alias: 'ios' },
  android: {
    sms: '+12003004015',
    email: 'and@os.co',
    customEvent: 'android',
    alias: 'and',
  },
};

export function getTestData() {
  const id = getTestExternalId();
  const data = TEST_DATA[id];
  if (!data) throw new Error(`No test data for ${id}`);
  return data;
}

export async function deleteUser(externalId: string) {
  console.info(`Deleting user: ${externalId}`);
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
    console.info(`User deleted successfully`);
  } catch (error) {
    console.error(`Failed to delete user: ${error}`);
  }
}

export async function getToggleState(el: {
  getAttribute(name: string): Promise<string | null>;
}): Promise<boolean> {
  const sdkType = getSdkType();

  // Ionic toggles expose state most reliably through ARIA.
  if (sdkType === 'capacitor' || sdkType === 'cordova') {
    const ariaChecked = await el.getAttribute('aria-checked');
    if (ariaChecked !== null) return ariaChecked === 'true';
    return (await el.getAttribute('checked')) !== null;
  }

  if (getPlatform() === 'ios') {
    return (await el.getAttribute('value')) === '1';
  }
  return (await el.getAttribute('checked')) === 'true';
}

/** Poll until a toggle reaches the expected state. */
export async function expectToggleState(
  el: { getAttribute(name: string): Promise<string | null> },
  expected: boolean,
  timeoutMs = 5_000,
): Promise<void> {
  await driver.waitUntil(async () => (await getToggleState(el)) === expected, {
    timeout: timeoutMs,
    interval: 100,
    timeoutMsg: `Expected toggle state to be ${expected}`,
  });
}

export function getSdkType(): SdkType {
  const sdkType = process.env.SDK_TYPE;
  if (isSdkType(sdkType)) {
    return sdkType;
  }
  throw new Error(
    `SDK_TYPE env var must be one of: ${VALID_SDK_TYPES.join(', ')}. Got: ${sdkType}`,
  );
}

function isSdkType(value: string | undefined): value is SdkType {
  return typeof value === 'string' && VALID_SDK_TYPE_SET.has(value);
}

type ElementWithInteractionMethods = {
  click(): Promise<void>;
  getAttribute(name: string): Promise<string | null>;
  getText(): Promise<string>;
  setValue(value: string): Promise<void>;
};

// Centralized SDK-specific element shims.
function withElementInteractionFixes<T extends ElementWithInteractionMethods>(el: T): T {
  const isFlutterAndroid = getPlatform() === 'android' && getSdkType() === 'flutter';

  return new Proxy(el, {
    get(target, prop, receiver) {
      if (prop === 'getText' && isFlutterAndroid) {
        return async () => {
          const text = (await target.getText()).trim();
          if (text) return text;

          const attrs = ['content-desc', 'contentDescription', 'text', 'name'];
          for (const attr of attrs) {
            try {
              const val = (await target.getAttribute(attr))?.trim();
              if (val) return val;
            } catch {
              /* best-effort */
            }
          }

          return '';
        };
      }

      if (prop === 'setValue') {
        return async (value: string) => {
          if (isFlutterAndroid) await target.click();
          await target.waitForDisplayed({ timeout: 5_000 });
          await target.setValue(value);
        };
      }

      const value = Reflect.get(target, prop, receiver);
      if (typeof value === 'function') {
        return value.bind(target);
      }

      return value;
    },
  });
}

/** Raw selector string for a shared test id; use with `$()` when you want WDIO to re-resolve on each retry. */
export function byTestIdSelector(id: string): string {
  const sdkType = getSdkType();
  const platform = getPlatform();
  if (sdkType === 'capacitor' || sdkType === 'cordova') return `[data-testid="${id}"]`;
  if (platform === 'android') return `id=${id}`;
  return `~${id}`;
}

/** Select by shared test id: WebView CSS, Android id, iOS accessibility id. */
export async function byTestId(id: string) {
  const el = await $(byTestIdSelector(id));
  return withElementInteractionFixes(el);
}

/** Select by visible text; partial=true allows contains matching. */
export async function byText(identifier: string, partial = false) {
  const platform = getPlatform();
  const sdkType = getSdkType();

  if (platform === 'android') {
    if (sdkType === 'flutter') {
      const xpath = partial
        ? `//*[contains(@content-desc, "${identifier}") or contains(@text, "${identifier}")]`
        : `//*[@content-desc="${identifier}" or @text="${identifier}"]`;
      const el = await $(xpath);
      return withElementInteractionFixes(el);
    }
    return partial
      ? $(`android=new UiSelector().textContains("${identifier}")`)
      : $(`android=new UiSelector().text("${identifier}")`);
  }

  return partial
    ? $(
        `-ios predicate string:label CONTAINS "${identifier}" OR name CONTAINS "${identifier}" OR value CONTAINS "${identifier}"`,
      )
    : $(
        `-ios predicate string:label == "${identifier}" OR name == "${identifier}" OR value == "${identifier}"`,
      );
}
