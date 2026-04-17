#!/usr/bin/env bun
/**
 * Download ACTIVE iOS provisioning profiles for the given bundle IDs via the
 * App Store Connect API and install them into
 * `~/Library/MobileDevice/Provisioning Profiles/`.
 *
 * Drop-in replacement for `apple-actions/download-provisioning-profiles`.
 * That action doesn't paginate `/bundleIds?filter[identifier]=...`, and since
 * `filter[identifier]` is a substring/prefix match, a team with many sibling
 * bundle IDs can push the exact match past the default 20-item first page and
 * the action fails with "Unable to find 'ACTIVE' profiles for bundleId ...".
 *
 * Environment variables
 * ---------------------
 *   ASC_KEY_ID        App Store Connect API Key ID
 *   ASC_ISSUER_ID     App Store Connect API Issuer ID (UUID)
 *   ASC_KEY_FILE      Path to the .p8 private key file (use in local dev)
 *   ASC_KEY_CONTENT   Raw PEM contents of the .p8 (alternative to ASC_KEY_FILE;
 *                     use in CI to avoid writing a temp file)
 *   PROFILE_TYPE      (optional) IOS_APP_DEVELOPMENT | IOS_APP_ADHOC | IOS_APP_STORE
 *                     Default: IOS_APP_DEVELOPMENT
 *
 * Usage
 * -----
 *   ASC_KEY_ID=... ASC_ISSUER_ID=... ASC_KEY_FILE=~/keys/AuthKey_XXX.p8 \
 *     bun appium/scripts/download_profiles.ts com.onesignal.example com.onesignal.example.NSE
 */

import { createPrivateKey, sign } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const API = 'https://api.appstoreconnect.apple.com/v1';
const PROFILES_DIR = join(homedir(), 'Library/MobileDevice/Provisioning Profiles');

// ─── Env & args ────────────────────────────────────────────────────────────

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

const BUNDLE_IDS = process.argv.slice(2).filter((a) => !a.startsWith('-'));
if (BUNDLE_IDS.length === 0) {
  console.error('Usage: download_profiles.ts <bundle-id> [<bundle-id> ...]');
  process.exit(1);
}

const ASC_KEY_ID = requireEnv('ASC_KEY_ID');
const ASC_ISSUER_ID = requireEnv('ASC_ISSUER_ID');
const PROFILE_TYPE = process.env.PROFILE_TYPE ?? 'IOS_APP_DEVELOPMENT';
const keyPem = process.env.ASC_KEY_CONTENT ?? readFileSync(requireEnv('ASC_KEY_FILE'), 'utf8');

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

interface ProfileResource extends ResourceRef {
  type: 'profiles';
  attributes?: {
    name?: string;
    uuid?: string;
    profileContent?: string;
    profileState?: string;
    profileType?: string;
    expirationDate?: string;
  };
}

interface ListResponse<T> {
  data: T[];
  errors?: ApiError[];
  links?: { next?: string };
}

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${JWT}` } });
  const text = await res.text();
  const parsed: T & { errors?: ApiError[] } = text ? JSON.parse(text) : {};
  if (!res.ok || (parsed.errors && parsed.errors.length > 0)) {
    const detail = parsed.errors ? JSON.stringify(parsed.errors, null, 2) : text;
    throw new Error(`GET ${path} → HTTP ${res.status}\n${detail}`);
  }
  return parsed;
}

// ─── Core ──────────────────────────────────────────────────────────────────

/**
 * Look up a bundle ID by its exact identifier. `filter[identifier]` is a
 * prefix match, so we paginate and compare client-side.
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

/**
 * Pick the most recently expiring ACTIVE profile of the requested type that
 * belongs to the given bundle ID record. Uses the
 * `/bundleIds/{id}/profiles` relationship endpoint, which takes an internal
 * record ID (not the human-readable identifier) and so has no prefix-match
 * issue. Profile state/type aren't filterable there, so we fetch all and
 * filter client-side.
 */
async function findActiveProfile(
  bundleRecordId: string,
  profileType: string,
): Promise<ProfileResource | undefined> {
  const all: ProfileResource[] = [];
  let path: string | null =
    `/bundleIds/${bundleRecordId}/profiles` +
    `?fields%5Bprofiles%5D=name,uuid,profileContent,profileState,profileType,expirationDate` +
    `&limit=200`;
  while (path !== null) {
    const page: ListResponse<ProfileResource> =
      await apiGet<ListResponse<ProfileResource>>(path);
    all.push(...page.data);
    const next: string | undefined = page.links?.next;
    path = next !== undefined ? next.slice(API.length) : null;
  }

  const matches = all.filter(
    (p) =>
      p.attributes?.profileState === 'ACTIVE' && p.attributes?.profileType === profileType,
  );
  if (matches.length === 0) return undefined;
  matches.sort((a, b) => {
    const aExp = a.attributes?.expirationDate ?? '';
    const bExp = b.attributes?.expirationDate ?? '';
    return bExp.localeCompare(aExp);
  });
  return matches[0];
}

async function main(): Promise<void> {
  mkdirSync(PROFILES_DIR, { recursive: true });
  console.log(`Installing to: ${PROFILES_DIR}`);
  console.log(`Profile type:  ${PROFILE_TYPE}`);

  for (const bundleId of BUNDLE_IDS) {
    console.log(`\n=== ${bundleId} ===`);

    const bundle = await findBundleIdByExactIdentifier(bundleId);
    if (!bundle) {
      throw new Error(
        `Bundle ID ${bundleId} is not registered in the Apple Developer portal.`,
      );
    }
    console.log(`  bundle record: ${bundle.id}`);

    const profile = await findActiveProfile(bundle.id, PROFILE_TYPE);
    if (!profile) {
      throw new Error(
        `No ACTIVE ${PROFILE_TYPE} profile found for bundle ID ${bundleId}. ` +
          `Run generate_certs.ts (or create one in the developer portal) and retry.`,
      );
    }

    const uuid = profile.attributes?.uuid;
    const content = profile.attributes?.profileContent;
    if (!uuid || !content) {
      throw new Error(`Profile ${profile.id} response missing uuid or profileContent`);
    }

    const dest = join(PROFILES_DIR, `${uuid}.mobileprovision`);
    writeFileSync(dest, Buffer.from(content, 'base64'));
    console.log(`  installed: ${profile.attributes?.name} → ${uuid}.mobileprovision`);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
