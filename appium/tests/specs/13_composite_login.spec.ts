import { loginUser, openModal, scrollToEl, waitForAppReady } from '../helpers/app.js';
import { byTestId, getSdkType, getTestExternalId } from '../helpers/selectors.js';

// Add an SDK here in the same change that ships login(externalId, profile) in its demo.
const SUPPORTED_SDKS: readonly ReturnType<typeof getSdkType>[] = ['android'];
const isSupported = () => SUPPORTED_SDKS.includes(getSdkType());

// Reserved for this spec so it never collides with the email/sms specs.
const PROFILE_EMAIL = 'and-p@os.co';
const PROFILE_EMAIL_2 = 'and-p2@os.co';
const PROFILE_SMS = '+12003004016';

// Composite login waits on the Create User round trip, which includes the op repo debounce.
const LOGIN_TIMEOUT = 30_000;

async function loginWithProfile(externalId: string, email?: string, sms?: string) {
  const idInput = await openModal('composite_login_button', 'composite_login_user_id_input');
  await idInput.setValue(externalId);
  if (email) await (await byTestId('composite_login_email_input')).setValue(email);
  if (sms) await (await byTestId('composite_login_sms_input')).setValue(sms);
  await (await byTestId('composite_login_confirm_button')).click();
}

async function expectExternalId(externalId: string) {
  const el = await scrollToEl('user_external_id_value', { direction: 'up' });
  await el.waitUntil(async () => (await el.getText()) === externalId, {
    timeout: LOGIN_TIMEOUT,
    timeoutMsg: `Expected external id "${externalId}"`,
  });
}

async function expectListed(sectionId: string, testId: string) {
  await scrollToEl(sectionId);
  const el = await byTestId(testId);
  await el.waitForDisplayed({
    timeout: LOGIN_TIMEOUT,
    timeoutMsg: `Expected "${testId}" to be listed`,
  });
}

describe('Composite login', () => {
  const externalId = `${getTestExternalId()}-profile`;

  before(async function () {
    await waitForAppReady({ skipLogin: true });
    if (!isSupported()) {
      return this.skip();
    }
    await scrollToEl('user_section');
  });

  after(async function () {
    if (!isSupported()) return;
    await loginUser(getTestExternalId());
    await expectExternalId(getTestExternalId());
  });

  it('logs in with email and sms in one call', async () => {
    await loginWithProfile(externalId, PROFILE_EMAIL, PROFILE_SMS);

    await expectExternalId(externalId);
    const statusEl = await scrollToEl('user_status_value', { direction: 'up' });
    expect(await statusEl.getText()).toBe('Logged In');

    await expectListed('emails_section', `emails_value_${PROFILE_EMAIL}`);
    await expectListed('sms_section', `sms_value_${PROFILE_SMS}`);
  });

  it('adds profile fields when logging in again as the same user', async () => {
    await scrollToEl('user_section', { direction: 'up' });
    await loginWithProfile(externalId, PROFILE_EMAIL_2);

    await expectExternalId(externalId);
    await expectListed('emails_section', `emails_value_${PROFILE_EMAIL}`);
    await expectListed('emails_section', `emails_value_${PROFILE_EMAIL_2}`);
    await expectListed('sms_section', `sms_value_${PROFILE_SMS}`);
  });
});
