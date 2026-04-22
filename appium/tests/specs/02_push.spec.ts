import { waitForAppReady, checkNotification, checkTooltip, scrollToEl } from '../helpers/app.js';
import { byTestId, getToggleState } from '../helpers/selectors.js';

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

  it('should have push ID and be enabled initially', async () => {
    const pushIdEl = await scrollToEl('push_id_value');
    const pushId = await pushIdEl.getText();
    expect(pushId).not.toBe('N/A');
    expect(pushId.length).toBeGreaterThan(0);

    await scrollToEl('push_enabled_toggle');
    const toggleEl = await byTestId('push_enabled_toggle');
    await driver.waitUntil(async () => (await getToggleState(toggleEl)) === true, {
      timeout: 5_000,
      timeoutMsg: 'Expected push enabled toggle to be true',
    });
  });

  it('can send an image notification', async () => {
    await checkNotification({
      buttonId: 'send_image_button',
      title: 'Image Notification',
      body: 'This notification includes an image',
      expectImage: true,
    });
  });
});
