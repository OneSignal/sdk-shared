import {
  waitForAppReady,
  checkNotification,
  checkTooltip,
  scrollToEl,
  isWebViewSDK,
  isBrowserStackIos,
  withRetryDelay,
  isUnitySDK,
} from '../helpers/app.js';
import { byTestId, expectToggleState } from '../helpers/selectors.js';

describe('Push Subscription', () => {
  before(async () => {
    await waitForAppReady();
    await scrollToEl('push_section');
  });

  it('should show correct tooltip info', async () => {
    await checkTooltip('push_info_icon', 'push');
    await checkTooltip('send_push_info_icon', 'sendPushNotification');
    await scrollToEl('push_section', { direction: 'up' });
  });

  it('should have push ID and be enabled initially', async function () {
    if (isBrowserStackIos()) this.skip();

    const pushIdEl = await scrollToEl('push_id_value');
    const pushId = await pushIdEl.getText();
    expect(pushId).not.toBe('N/A');
    expect(pushId.length).toBeGreaterThan(0);

    await scrollToEl('push_enabled_toggle');
    const toggleEl = await byTestId('push_enabled_toggle');
    await expectToggleState(toggleEl, true);
  });

  it('can send an image notification', async function () {
    if (isBrowserStackIos()) this.skip();
    this.retries(2);
    await withRetryDelay(this, 5_000, () =>
      checkNotification({
        buttonId: 'send_image_button',
        title: 'Image Notification',
        body: 'This notification includes an image',
        expectImage: true,
      }),
    );
  });
});
