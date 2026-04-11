import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  waitForAppReady,
  togglePushEnabled,
  waitForNotification,
  checkNotification,
} from '../helpers/app.js';
import { waitForLog } from '../helpers/logger.js';
import { byTestId } from '../helpers/selectors.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const tooltipContent = JSON.parse(
  readFileSync(resolve(__dirname, '../../../demo/tooltip_content.json'), 'utf-8'),
);

describe('Push Subscription', () => {
  before(async () => {
    await waitForAppReady();
  });

  it('should have push ID and be enabled initially', async () => {
    const pushIdEl = await byTestId('push_id_value');
    const pushId = await pushIdEl.getText();
    expect(pushId).not.toBe('N/A');
    expect(pushId.length).toBeGreaterThan(0);

    const toggleEl = await byTestId('push_enabled_toggle');
    const value = await toggleEl.getAttribute('value');
    expect(value).toBe('1');
  });

  it('should show correct tooltip info', async () => {
    const infoIcon = await byTestId('push_info_icon');
    await infoIcon.waitForDisplayed({ timeout: 5_000 });
    console.log('infoIcon', infoIcon);
    await infoIcon.click();

    const titleEl = await byTestId('tooltip_title');
    await titleEl.waitForDisplayed({ timeout: 5_000 });
    const title = await titleEl.getText();
    expect(title).toBe(tooltipContent.push.title);

    const descEl = await byTestId('tooltip_description');
    const description = await descEl.getText();
    expect(description).toBe(tooltipContent.push.description);

    const okButton = await $('~OK');
    await okButton.click();
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
