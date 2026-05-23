import { SuiteStats, TestStats } from '@wdio/reporter';
import SpecReporter from '@wdio/spec-reporter';
import { globSync } from 'glob';

import { deleteUser } from './tests/helpers/selectors.js';

// Override `realtimeReporting`'s default output to mirror the final printReport format:
// per-spec `» path` + describe title + `   ✓ test` (instead of `Suite started ---` dividers,
// `Hook executed:` lines, and the noisy `✓ test » [ file ]` suffix on every test line).
const lastRealtimeSpec = new WeakMap<SpecReporter, string>();
const ansi: Record<TestStats['state'], (s: string) => string> = {
  passed: (s) => `\x1b[32m${s}\x1b[0m`,
  failed: (s) => `\x1b[31m${s}\x1b[0m`,
  pending: (s) => `\x1b[36m${s}\x1b[0m`,
  skipped: (s) => `\x1b[36m${s}\x1b[0m`,
};
SpecReporter.prototype.printCurrentStats = function (stat) {
  const send = (content: string) => {
    if (process.send && !process.env.WDIO_UNIT_TESTS) {
      process.send({ name: 'reporterRealTime', content });
    }
  };
  const runner = this.runnerStat;
  if (!runner) return;
  const preface = `[${this.getEnviromentCombo(runner.capabilities, false, runner.isMultiremote).trim()} #${runner.cid}]`;

  if (stat instanceof TestStats && stat.state) {
    const symbol = ansi[stat.state](this.getSymbol(stat.state));
    send(`${preface}    ${symbol} ${stat.title}`);
    return;
  }

  if (stat instanceof SuiteStats) {
    if (stat.file) {
      const spec = stat.file.replace(process.cwd(), '');
      if (lastRealtimeSpec.get(this) !== spec) {
        lastRealtimeSpec.set(this, spec);
        send(preface);
        send(`${preface} » ${spec}`);
      }
    }
    if (stat.title) send(`${preface} ${stat.title}`);
  }
  // HookStats: skipped (no `Hook executed: ...` noise)
};

// Skip the per-spec breakdown in the final summary since printCurrentStats already
// streamed it; emit just divider + Running/Session ID + counts + failures.
const formatDuration = (ms: number) => {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
};
SpecReporter.prototype.printReport = function (runner) {
  const counts = this.getCountDisplay(`(${formatDuration(runner.duration)})`);
  const failures = this.getFailureDisplay();
  if (counts.length === 0 && failures.length === 0 && !runner.error) return;

  const preface = `[${this.getEnviromentCombo(runner.capabilities, false, runner.isMultiremote).trim()} #${runner.cid}]`;
  const divider = '------------------------------------------------------------------';
  const output: string[] = [...this.getHeaderDisplay(runner), ''];
  if (runner.error) {
    output.push(`${this.getSymbol('failed')} Failed to create a session:`, runner.error, '');
  }
  output.push(...counts, ...failures);

  const prefacedOutput = output.map((value) => (value ? `${preface} ${value}` : preface));
  this.write(`${divider}\n${prefacedOutput.join('\n')}\n`);
};

const SHARED_CONF_DIR = import.meta.dirname ?? process.cwd();

const isLocal = !process.env.BROWSERSTACK_USERNAME;

// Don't register @wdio/browserstack-service: its mocha CLI bootstrap can stall 25m+ with no log and can't be disabled.
const browserstackConnection = {
  user: process.env.BROWSERSTACK_USERNAME,
  key: process.env.BROWSERSTACK_ACCESS_KEY,
  hostname: 'hub.browserstack.com',
  services: ['shared-store'] satisfies WebdriverIO.Config['services'],
};

const localConnection = {
  hostname: 'localhost',
  port: Number(process.env.APPIUM_PORT) || 4723,
  services: ['shared-store'] satisfies WebdriverIO.Config['services'],
};

const bstackOptions = {
  projectName: 'OneSignal SDK E2E',
  buildName: process.env.BUILD_NAME || 'local',
  sessionName: process.env.SDK_TYPE || 'unknown',
  debug: true,
  networkLogs: true,
  appiumVersion: '3.2.0',
  idleTimeout: 300,
};

export const sharedConfig: WebdriverIO.Config = {
  ...(isLocal ? localConnection : browserstackConnection),
  maxInstances: 1,
  logLevel: 'warn',

  // Pre-expand the glob so WDIO groups all specs into one runner and reuses a single Appium session (a raw glob or `--spec` flag spawns one runner per file, costing ~10-30s of iOS session setup each).
  specs: [globSync('tests/specs/**/*.spec.ts', { cwd: SHARED_CONF_DIR, absolute: true }).sort()],

  capabilities: [],

  framework: 'mocha',
  mochaOpts: { timeout: 120_000, bail: isLocal },
  reporters: [
    ['spec', { realtimeReporting: true }],
    [
      'junit',
      {
        outputDir: './results',
        outputFileFormat: ({ cid }: { cid: string }) => `results-${cid}.xml`,
      },
    ],
  ],

  waitforTimeout: isLocal ? 3_000 : 15_000,
  // BrowserStack can hold POST /session open while waiting for a free
  // parallel slot (up to its 15-min queue cap). Keep the HTTP client
  // alive long enough that we don't bail before the queue clears.
  connectionRetryTimeout: 900_000,
  connectionRetryCount: 2,

  // cleans up test data once before all specs run
  onPrepare: async () => {
    const sdkType = process.env.SDK_TYPE;
    const platform = process.env.PLATFORM;
    if (!sdkType || !platform) return;
    const externalId = sdkType === platform ? `appium-${sdkType}` : `appium-${sdkType}-${platform}`;
    await deleteUser(externalId);
  },

  // Flip BrowserStack's session status pill to passed/failed (replaces what @wdio/browserstack-service did).
  after: async (result) => {
    if (isLocal) return;
    const status = result === 0 ? 'passed' : 'failed';
    const reason = status === 'failed' ? `${result} failed test(s)` : '';
    await driver.execute(
      `browserstack_executor: ${JSON.stringify({
        action: 'setSessionStatus',
        arguments: { status, reason },
      })}`,
    );
  },
};

export { bstackOptions };
