import { getPlatform } from './selectors.js';

const BUNDLE_ID = process.env.BUNDLE_ID || 'com.onesignal.example';
const collectedLogs: string[] = [];

function drainLogs() {
  const logType = getPlatform() === 'ios' ? 'syslog' : 'logcat';
  return driver.getLogs(logType);
}

async function collectNewLogs(): Promise<void> {
  const entries = await drainLogs();
  for (const entry of entries) {
    const msg = String((entry as Record<string, unknown>).message ?? entry);
    if (msg.includes(BUNDLE_ID)) {
      collectedLogs.push(msg);
    }
  }
}

export function hasLogContaining(substring: string): boolean {
  return collectedLogs.some((msg) => msg.includes(substring));
}

// Avoid using this function and rely on snackbars instead
export async function waitForLog(
  substring: string,
  timeoutMs = 30_000,
  pollMs = 1_000,
): Promise<void> {
  collectedLogs.length = 0;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await collectNewLogs();
    if (hasLogContaining(substring)) {
      return;
    }
    await driver.pause(pollMs);
  }
  throw new Error(`Timed out waiting for log containing "${substring}" after ${timeoutMs}ms`);
}
