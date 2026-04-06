import { byTestId } from './selectors.js';

/**
 * Get the current log entry count shown in the header badge.
 */
export async function getLogCount(): Promise<number> {
  const countEl = await byTestId('log_view_count');
  const text = await countEl.getText();
  return parseInt(text, 10) || 0;
}

/**
 * Get the text of a specific log entry by index.
 */
export async function getLogMessage(index: number): Promise<string> {
  const messageEl = await byTestId(`log_entry_${index}_message`);
  return messageEl.getText();
}

/**
 * Get the level (info/warn/error) of a specific log entry.
 */
export async function getLogLevel(index: number): Promise<string> {
  const levelEl = await byTestId(`log_entry_${index}_level`);
  return levelEl.getText();
}

/**
 * Check whether any log entry contains the given substring.
 * Scans entries 0..count-1.
 */
export async function hasLogContaining(substring: string): Promise<boolean> {
  const count = await getLogCount();
  for (let i = 0; i < count; i++) {
    const msg = await getLogMessage(i);
    if (msg.includes(substring)) {
      return true;
    }
  }
  return false;
}

/**
 * Wait until a log entry containing the substring appears,
 * polling at the given interval.
 */
export async function waitForLog(
  substring: string,
  timeoutMs = 15_000,
  pollMs = 1_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await hasLogContaining(substring)) {
      return;
    }
    await browser.pause(pollMs);
  }
  throw new Error(
    `Timed out waiting for log containing "${substring}" after ${timeoutMs}ms`,
  );
}
