#!/usr/bin/env bun
/**
 * Create (or regenerate) iOS Development provisioning profiles for the OneSignal
 * demo app (main target, Notification Service Extension, Live Activity widget)
 * via the App Store Connect API.
 *
 * Idempotent: if a profile with the target name already exists, it is deleted
 * and recreated with all currently registered dev certs + enabled iOS devices.
 * Re-run whenever you register a new device or rotate a signing cert.
 *
 * Prerequisites
 * -------------
 * - The bundle IDs below must already be registered in the Apple Developer
 *   portal as Explicit App IDs with the required capabilities (App Groups for
 *   both, plus Live Activities on .LA). This script does not configure
 *   capabilities.
 * - An App Store Connect API key with role Developer or Admin.
 * - Bun (or `tsx`) to run the script.
 *
 * Environment variables
 * ---------------------
 *   ASC_KEY_ID      App Store Connect API Key ID (e.g., ABCD1234)
 *   ASC_ISSUER_ID   App Store Connect API Issuer ID (UUID)
 *   ASC_KEY_FILE    Path to the .p8 private key file
 *
 * Usage
 * -----
 *   ASC_KEY_ID=... ASC_ISSUER_ID=... ASC_KEY_FILE=~/Downloads/AuthKey_XXX.p8 \
 *     bun appium/scripts/generate_certs.ts
 *
 *   # or with tsx:
 *   ASC_KEY_ID=... ASC_ISSUER_ID=... ASC_KEY_FILE=... \
 *     npx tsx appium/scripts/generate_certs.ts
 */

import { createPrivateKey, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';

interface ProfileTarget {
  bundleId: string;
  profileName: string;
}

const TARGETS: ProfileTarget[] = [
  { bundleId: 'com.onesignal.example', profileName: 'Appium OneSignal Main' },
  { bundleId: 'com.onesignal.example.NSE', profileName: 'Appium OneSignal NSE' },
  { bundleId: 'com.onesignal.example.LA', profileName: 'Appium OneSignal LA' },
];

const API = 'https://api.appstoreconnect.apple.com/v1';

// ─── Env ───────────────────────────────────────────────────────────────────

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var: ${name} (run with --help for details)`);
    process.exit(1);
  }
  return v;
}

if (process.argv.includes('-h') || process.argv.includes('--help')) {
  const banner = readFileSync(new URL(import.meta.url)).toString();
  const match = banner.match(/\/\*\*([\s\S]*?)\*\//);
  console.log(match ? match[1].replace(/^\s*\* ?/gm, '') : banner);
  process.exit(0);
}

const ASC_KEY_ID = requireEnv('ASC_KEY_ID');
const ASC_ISSUER_ID = requireEnv('ASC_ISSUER_ID');
const ASC_KEY_FILE = requireEnv('ASC_KEY_FILE');
const keyPem = readFileSync(ASC_KEY_FILE, 'utf8');

// ─── JWT (ES256) ───────────────────────────────────────────────────────────

function buildJWT(): string {
  const header = { alg: 'ES256', kid: ASC_KEY_ID, typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: ASC_ISSUER_ID, exp: now + 600, aud: 'appstoreconnect-v1' };

  const b64 = (b: Buffer): string => b.toString('base64url');
  const headerB64 = b64(Buffer.from(JSON.stringify(header)));
  const payloadB64 = b64(Buffer.from(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const privateKey = createPrivateKey(keyPem);
  const signature = sign('sha256', Buffer.from(signingInput), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363',
  });
  return `${signingInput}.${b64(signature)}`;
}

const JWT = buildJWT();

// ─── API types & helpers ───────────────────────────────────────────────────

interface ApiError {
  title?: string;
  detail?: string;
  code?: string;
  status?: string;
}

interface ResourceRef {
  id: string;
  type: string;
}

interface BundleIdResource extends ResourceRef {
  type: 'bundleIds';
  attributes?: { identifier?: string; name?: string };
}

interface CertificateResource extends ResourceRef {
  type: 'certificates';
}

interface DeviceResource extends ResourceRef {
  type: 'devices';
}

interface ProfileResource extends ResourceRef {
  type: 'profiles';
  attributes?: { name?: string; profileState?: string };
}

interface ListResponse<T> {
  data: T[];
  errors?: ApiError[];
  links?: { next?: string };
}

interface SingleResponse<T> {
  data: T;
  errors?: ApiError[];
}

async function apiRequest<T>(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${JWT}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (method === 'DELETE' && res.status === 204) {
    const empty: unknown = {};
    return empty as T; // DELETE returns 204 No Content
  }

  const text = await res.text();
  const parsed: T & { errors?: ApiError[] } = text ? JSON.parse(text) : {};

  if (!res.ok || (parsed.errors && parsed.errors.length > 0)) {
    const detail = parsed.errors ? JSON.stringify(parsed.errors, null, 2) : text;
    throw new Error(`${method} ${path} → HTTP ${res.status}\n${detail}`);
  }
  return parsed;
}

const apiGet = <T>(path: string): Promise<T> => apiRequest<T>('GET', path);
const apiPost = <T>(path: string, body: unknown): Promise<T> => apiRequest<T>('POST', path, body);
const apiDelete = (path: string): Promise<unknown> => apiRequest<unknown>('DELETE', path);

// ─── Main ──────────────────────────────────────────────────────────────────

/**
 * Look up a bundle ID by its exact identifier.
 *
 * `filter[identifier]` on /bundleIds is a substring/prefix match (e.g.,
 * filtering by `com.onesignal.example` returns every bundle ID that starts
 * with that string). We paginate and filter client-side for an exact match.
 */
async function findBundleIdByExactIdentifier(
  identifier: string,
): Promise<BundleIdResource | undefined> {
  let path: string | null =
    `/bundleIds?filter%5Bidentifier%5D=${encodeURIComponent(identifier)}&limit=200`;
  while (path !== null) {
    const page: ListResponse<BundleIdResource> =
      await apiGet<ListResponse<BundleIdResource>>(path);
    const hit = page.data.find((b) => b.attributes?.identifier === identifier);
    if (hit) return hit;
    const next: string | undefined = page.links?.next;
    path = next !== undefined ? next.slice(API.length) : null;
  }
  return undefined;
}

async function main(): Promise<void> {
  console.log('Fetching development certificates...');
  const certs = await apiGet<ListResponse<CertificateResource>>(
    '/certificates?filter%5BcertificateType%5D=DEVELOPMENT&limit=200',
  );
  if (certs.data.length === 0) {
    throw new Error('No Development certificates found. Upload a dev cert first.');
  }
  const certIds = certs.data.map((c) => c.id);
  console.log(`  found ${certIds.length} cert(s)`);

  console.log('Fetching enabled iOS devices...');
  const devices = await apiGet<ListResponse<DeviceResource>>(
    '/devices?filter%5Bstatus%5D=ENABLED&filter%5Bplatform%5D=IOS&limit=200',
  );
  if (devices.data.length === 0) {
    throw new Error('No ENABLED iOS devices registered.');
  }
  const deviceIds = devices.data.map((d) => d.id);
  console.log(`  found ${deviceIds.length} device(s)`);

  for (const target of TARGETS) {
    console.log(`\n=== ${target.bundleId} ===`);

    const bundleIdRecord = await findBundleIdByExactIdentifier(target.bundleId);
    if (!bundleIdRecord) {
      throw new Error(
        `Bundle ID ${target.bundleId} is not registered in the Apple Developer portal. ` +
          `Register it (Explicit, with required capabilities) then re-run.`,
      );
    }
    console.log(`  bundleId record: ${bundleIdRecord.id}`);

    const existing = await apiGet<ListResponse<ProfileResource>>(
      `/profiles?filter%5Bname%5D=${encodeURIComponent(target.profileName)}`,
    );
    for (const p of existing.data) {
      console.log(`  deleting existing profile ${p.id}`);
      await apiDelete(`/profiles/${p.id}`);
    }

    const created = await apiPost<SingleResponse<ProfileResource>>('/profiles', {
      data: {
        type: 'profiles',
        attributes: { name: target.profileName, profileType: 'IOS_APP_DEVELOPMENT' },
        relationships: {
          bundleId: { data: { type: 'bundleIds', id: bundleIdRecord.id } },
          certificates: { data: certIds.map((id) => ({ type: 'certificates', id })) },
          devices: { data: deviceIds.map((id) => ({ type: 'devices', id })) },
        },
      },
    });

    const state = created.data.attributes?.profileState ?? 'unknown';
    console.log(`  created profile ${created.data.id} (${target.profileName}) [state: ${state}]`);
  }

  console.log('\nDone. The E2E workflow will download these automatically on the next run.');
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
