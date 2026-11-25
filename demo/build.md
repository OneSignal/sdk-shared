# OneSignal {{PLATFORM}} Sample App - Build Guide

Prompts and requirements to build the OneSignal {{PLATFORM}} Sample App from scratch.

> `{{PLATFORM}}` is a placeholder. Each wrapper SDK's `examples/build.md`
> extends this document and instructs readers to substitute the platform
> name (`Android`, `iOS`, `Flutter`, `Capacitor`, `React Native`,
> `Cordova`, `.NET MAUI`) before use.

---

## Phase 1: Initial Setup

### Prompt 1.1 - Project Foundation

Create a new {{PLATFORM}} project at `examples/demo/` (relative to the SDK repo root).

- Clean architecture: a platform-idiomatic state container that calls the
  OneSignal SDK directly. No repository wrapper layer.
  - `useOneSignal` hook for React, React Native, Cordova, Capacitor
  - `AppViewModel` for .NET MAUI (C#) and Flutter
- App name: "OneSignal Demo"
- Top app bar: centered title with OneSignal logo SVG + "{{PLATFORM}}" text
- Android package name / iOS bundle identifier: `com.onesignal.sdkdemo`
- All dialogs should have EMPTY input fields (for Appium testing)
- Separate widget/component files per section

App bar logo SVG: `https://raw.githubusercontent.com/OneSignal/sdk-shared/refs/heads/main/assets/onesignal_logo.svg`
Save to assets and render in the app bar.

App icon PNG: `https://raw.githubusercontent.com/OneSignal/sdk-shared/refs/heads/main/assets/onesignal_logo_icon_padded.png`
Save to assets, generate all platform app icons, then delete the downloaded file.

Reference the OneSignal SDK from the parent repo using a local path/file dependency.

### Prompt 1.2 - Dependencies

- OneSignal SDK (local path reference)
- State management (platform-idiomatic)
- Local persistence (SharedPreferences / AsyncStorage / localStorage)
- HTTP client (for REST API calls)
- SVG rendering (for AppBar logo)
- Navigation (if needed)
- Icon library (Material icons)

### Prompt 1.3 - OneSignal SDK Operations

The state container (see Prompt 1.1) calls the OneSignal SDK directly and exposes the operations below as actions/methods:

- **User**: loginUser(externalUserId, jwt?) -> async, loginUserWithProfile(externalUserId, profile, jwt?) -> async result (Android only), updateUserJwt(externalUserId, token), logoutUser() -> async, setLanguage(code)
- **Aliases**: addAlias(label, id), addAliases(map)
- **Email**: addEmail(email), removeEmail(email)
- **SMS**: addSms(number), removeSms(number)
- **Tags**: addTag(key, value), addTags(map), removeTag(key) if SDK supports, removeTags(keys), getTags() -> async map if SDK supports
- **Triggers** (via OneSignal.InAppMessages): addTrigger(key, value), addTriggers(map), removeTrigger(key) if SDK supports, removeTriggers(keys), clearTriggers()
- **Outcomes** (via OneSignal.Session): sendOutcome(name), sendUniqueOutcome(name), sendOutcomeWithValue(name, value)
- **Track Event**: trackEvent(name, properties?: map)
- **Push subscription**: getPushSubscriptionId() -> nullable, getPushSubscriptionToken() -> nullable, isPushOptedIn() -> nullable bool, optInPush(), optOutPush()
- **Notifications**: hasPermission() -> bool, requestPermission(fallbackToSettings) -> async bool, clearAll()
- **In-App Messages**: setPaused(bool)
- **Location**: setLocationShared(bool), isLocationShared() -> async bool, requestLocationPermission()
- **Privacy consent**: setConsentRequired(bool), setConsentGiven(bool)
- **User IDs**: getExternalId() -> nullable, getOnesignalId() -> nullable
- **Live Activities** (iOS only): startDefaultLiveActivity(activityId, attributes, content)
- **REST API** (delegated to OneSignalApiService): sendNotification(type) -> async bool, sendCustomNotification(title, body) -> async bool, fetchUser(onesignalId, externalId?, jwt?) -> async nullable UserData, updateLiveActivity(activityId, event, eventUpdates?) -> async bool

### Prompt 1.4 - OneSignalApiService (REST API Client)

Properties: \_appId (set during initialization)

Methods: setAppId(), getAppId(), hasApiKey(), sendNotification(type, subscriptionId), sendCustomNotification(title, body, subscriptionId), fetchUser(onesignalId, externalId?, jwt?), updateLiveActivity(activityId, event, eventUpdates?)

sendNotification:

- POST `https://onesignal.com/api/v1/notifications`
- Accept: `application/vnd.onesignal.v1+json`
- Uses `include_subscription_ids` (not include_player_ids)
- `big_picture` for Android image notifications
- `ios_attachments` for iOS image notifications

fetchUser:

- Logged in with a cached JWT: GET `https://api.onesignal.com/apps/{app_id}/users/by/external_id/{external_id}` with `Authorization: Bearer {jwt}`
- Otherwise: GET `https://api.onesignal.com/apps/{app_id}/users/by/onesignal_id/{onesignal_id}` with NO Authorization header
- Apps with Identity Verification (set per app in the dashboard) reject unauthenticated lookups. A logged-in user on those apps always has a JWT, and logged out there is no anonymous user to fetch, so the `onesignal_id` branch only runs on apps without it. No toggle: the cached JWT picks the branch
- Never use the REST API key here. It only works by `external_id`, and it must not ship in a client app
- Cache the JWT passed to login, Login With Profile, and Update User JWT. Clear it on logout. Refetch after Update User JWT succeeds
- Returns UserData with aliases, tags, emails, smsNumbers, externalId

updateLiveActivity (iOS only):

- POST `https://api.onesignal.com/apps/{app_id}/live_activities/{activity_id}/notifications`
- Authorization: `Key {ONESIGNAL_API_KEY}` (requires REST API key)
- Body: `{ event: "update"|"end", event_updates, name, priority: 10 }`
- For update events: wrap content state in `{ data: { status, message, estimatedTime } }` as `event_updates`
- For end events: add `dismissal_date` (current unix timestamp), send `{ message: "Ended" }` as `event_updates`
- Check `response.ok` (2xx) for success, not just 200 (API returns 201)

hasApiKey:

- Returns true if `ONESIGNAL_API_KEY` is set and not the placeholder default value
- Used to disable update/end buttons when no API key is configured

### Prompt 1.5 - SDK Observers

**1. Initialize before UI renders.** Cached consent flags must be applied before `initialize`; IAM/location flags must be restored after:

```
OneSignal.Debug.setLogLevel(verbose)
OneSignal.consentRequired(cachedConsentRequired)
OneSignal.consentGiven(cachedPrivacyConsent)
OneSignal.initialize(appId)

OneSignal.InAppMessages.setPaused(cachedIamPaused)
OneSignal.Location.setShared(cachedLocationShared)

// iOS only
OneSignal.LiveActivities.setupDefault({
  enablePushToStart: true,
  enablePushToUpdate: true,
})
```

**2. Register SDK lifecycle/click listeners.** These belong with the SDK init, not the state container:

- InAppMessages: willDisplay, didDisplay, willDismiss, didDismiss, click
- Notifications: click, foregroundWillDisplay

Every listener in steps 2 and 3 writes one entry to the Log View (Prompt 2.0) and the console. Use these messages exactly; the shared Appium suite matches on them:

| Event                           | Log message                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------ |
| Notification click              | `Notif click: {notificationId} {title}`                                              |
| Notification foregroundWillDisplay | `Notif willDisplay: {notificationId} {title}`                                     |
| IAM willDisplay / didDisplay / willDismiss / didDismiss / click | `IAM {event}: {messageId}` (e.g. `IAM didDisplay: {messageId}`)  |
| Push subscription change        | `Push subscription changed: id={prev} → {curr}, optedIn={prev} → {curr}, token={prev8}… → {curr8}…` |
| Notification permission change  | `Permission changed: {granted}`                                                      |
| User state change               | `User changed: onesignalId={id}, externalId={externalId}`                            |

Use `null` for missing ids and an empty string for a missing title. Truncate push tokens to their first 8 characters.

**3. Register state-layer observers.** Wire these in the state container so they can mutate UI state:

- Push subscription change
- Notification permission change
- User state change — log the new `onesignalId`/`externalId`. When `onesignalId` is non-null, call `fetchUserDataFromApi()` so the post-login fetch runs once the SDK has actually assigned an id (see Phase 3.1). When `onesignalId` is null (logout), skip the fetch — the logout path already cleared local lists.

Clean up listeners on teardown if the platform requires it.

---

## Phase 2: UI Sections

### Section Order (top to bottom)

0. **Log View** (sticky under the app bar, outside the scroll view; see Prompt 2.0)
1. **App Section** (Guidance Banner, App ID with copy button, Consent Toggle)
2. **User Section** (External ID with copy button, Language, Login/Logout, Login With Profile on Android, Update User JWT)
3. **Push Section** (Push ID with copy button, Status, Opted In Toggle, Auto-prompts on load)
4. **Send Push Notification Section** (Simple, With Image, With Sound, Custom, Clear All)
5. **In-App Messaging Section** (Pause toggle)
6. **Send In-App Message Section** (Top, Center, Bottom, Full, Carousel, HTML, Full Bleed, Carousel Bleed)
7. **Aliases Section** (Add Alias/Add Aliases, read-only list)
8. **Emails Section** (Collapsible list >5)
9. **SMS Section** (Collapsible list >5)
10. **Tags Section** (Add Tag/Add Tags/Remove Tags)
11. **Outcomes Section** (Send Outcome with type selection)
12. **Triggers Section** (Add Trigger/Add Triggers/Remove Triggers/Clear All - IN MEMORY ONLY)
13. **Custom Events Section** (JSON validation)
14. **Location Section** (Shared toggle, Prompt button, Check button)
15. **Live Activities Section** (iOS only - Start, Update, End)
16. **Next Screen Button**

The scroll view draws behind the navigation bar / home indicator rather than stopping above it, and ends with the styles.md "Scroll bottom" inset so the Next Screen button scrolls clear of the bar.

### Button Styles

Buttons are Primary or Secondary (styles.md "Buttons"); there is no destructive style. Primary marks a section's main action and the common choices in a send grid. Everything else, including removal and reset actions, is Secondary.

| Section                | Primary                    | Secondary                                              |
| ---------------------- | -------------------------- | ------------------------------------------------------ |
| User                   | LOGIN USER / SWITCH USER   | LOGOUT USER, LOGIN WITH PROFILE, UPDATE USER JWT       |
| Push                   | PROMPT PUSH                |                                                        |
| Send Push Notification | SIMPLE, WITH IMAGE         | WITH SOUND, CUSTOM, CLEAR ALL                          |
| Send In-App Message    | TOP, CENTER, BOTTOM, FULL  | CAROUSEL, HTML, FULL BLEED, CAROUSEL BLEED             |
| Aliases                | ADD ALIAS                  | ADD ALIASES                                            |
| Emails / SMS           | ADD EMAIL / ADD SMS        |                                                        |
| Tags                   | ADD TAG                    | ADD TAGS, REMOVE TAGS                                  |
| Outcomes               | SEND OUTCOME               |                                                        |
| Triggers               | ADD TRIGGER                | ADD TRIGGERS, REMOVE TRIGGERS, CLEAR ALL               |
| Custom Events          | TRACK EVENT                |                                                        |
| Location               | PROMPT LOCATION            | CHECK LOCATION                                         |
| Live Activities        | START ACTIVITY, UPDATE     | END ACTIVITY                                           |
| Next Screen            |                            | NEXT SCREEN                                            |

### Prompt 2.0 - Log View

A logcat-style panel pinned directly below the app bar. It stays visible while the main scroll view scrolls underneath it.

1. Header row: `LOGS` with the entry count in a badge on the left; trash icon (clear) and chevron (collapse/expand) on the right.
2. Body: fixed-height list of entries, oldest first, each `{HH:mm:ss} {message}` with the time de-emphasized and in fixed-width digits so messages line up. Auto-scroll to the newest entry when one is added or the panel is expanded. Long entries wrap.
3. Empty state: `No logs yet`.
4. Collapse hides the body only; the header row stays. Starts expanded on every launch. Entries stay in the view hierarchy while collapsed.
5. Clear removes all entries.
6. Keep at most 100 entries in memory (drop the oldest). Never persist them: every launch, including a cold start from a notification tap, starts empty so the suite can assert per-launch event counts.
7. Expose a single `log(message)` helper that appends an entry and writes `[OneSignal] {message}` to the console. All SDK listeners (Prompt 1.5) go through it.

Styling in styles.md (Log View).

### Prompt 2.1a - App Section

1. Guidance banner, between the section header and the App card, shown only when the demo uses the shared default App ID (`1154c350-e715-4b71-a58b-1b84b6745baa`). A build configured with its own App ID, including Appium runs, hides it:
   - "Set your App ID and rebuild to test all features." (short enough to fit on one line on a typical phone)
   - Link: "Create an app at onesignal.com" (opens browser)
   - Styling per styles.md "Guidance Banner"
2. App card: the App ID row (readonly, with a copy button per styles.md "Card Rows"), then up to two consent toggles, each separated by a divider:
   - "Consent Required" (always visible) -> OneSignal.consentRequired(value)
     Description: "Require consent before SDK processes data"
   - "Privacy Consent" (only visible when Consent Required is ON) -> OneSignal.consentGiven(value)
     Description: "Consent given for data collection"
     Separated by horizontal divider. NOT a blocking overlay.

### Prompt 2.1b - User Section

Separate SectionCard titled "User":

1. User card (always visible, ABOVE buttons):
   - Two rows separated by a divider: "External ID" and "Language"
   - Logged out: External ID = "—"
   - Logged in: External ID = actual value, with a copy button (styles.md "Card Rows")
   - Language: picker showing the selected language name. Options are "Device Default" (code `""`) followed by the language list below, in this order. Selecting an option calls `OneSignal.User.setLanguage(code)`. `""` tells the native SDK to use the device language.
   - Use the platform's dropdown/picker where it is Appium-friendly; otherwise a single-select list dialog. Cap the open list's height at 320 so it doesn't cover the screen. Right-align the selected value so it sits next to the dropdown arrow, like the other value rows.
Buttons 2-5 use one Button Grid (styles.md), in this order. Hidden buttons drop out and the rest reflow; an odd last button spans both columns.

2. LOGIN USER button ("SWITCH USER" when logged in, primary style) -> "Login User" dialog with stacked fields: "External User Id" (required, empty) and "JWT Token (optional)" (multi-line, see JWT inputs below). Login stays disabled until External User Id is filled. Calls `OneSignal.login(externalId, jwt)`, passing a blank token as null. Login resets the Language picker to Device Default locally (clear the cached value only). Do NOT call `setLanguage` on login: `""` resolves to the device language and would overwrite the new user's language on the backend.
3. LOGOUT USER button (only when logged in, secondary style). Logout also resets the Language picker to Device Default locally, without calling `setLanguage`. The SDK starts the new anonymous user with no language override, and `logout()` isn't awaited, so a `setLanguage('')` could land on the logged-out user.
4. LOGIN WITH PROFILE button (secondary style, Android only) -> "Login With Profile" dialog. Native iOS doesn't show it (the iOS SDK has no composite login yet). Wrappers show it only when running on Android.
   - Fields, in order, each its own full-width form field: "External User Id" (required), "JWT Token (optional)" (multi-line), "Email (optional)", "Email status", "SMS (optional)" (placeholder `+14155552671`; the SDK requires E.164), "SMS status", then a "Tag (optional)" row and an "Alias (optional)" row. Each row is a small caption (styles.md "Field Group Caption") above two fields side by side: "Key" | "Value" for the tag, "Label" | "ID" for the alias. The caption carries "(optional)" because it would be cut off in half-width field labels
   - Each status field is a select (platform picker / dropdown / `<select>`), always shown, with options "Default" (selected initially, sends no status: an address that already exists keeps its status, a new one gets the backend default), "Subscribed" (true), "Unsubscribed" (false). Only send a status when its address is filled; the SDK ignores it otherwise
   - A tag or alias row must be fully filled or left empty (the SDK rejects empty keys and values). While one field of a row is filled and the other isn't, mark the empty field as an error with "Fill both or leave both empty" and disable Login. One tag and one alias cover the profile's tags/aliases maps; an alias that already belongs to another user fails the whole login
   - Login stays disabled until External User Id is filled. Calls `OneSignal.login(externalId, profile, jwt)` with the email, SMS, their statuses, the tag and the alias in the profile. The External ID row shows the result; failures go to the log (a backend failure still leaves the new external ID set locally)
5. UPDATE USER JWT button (secondary style, only when logged in; there is no identified user to refresh a token for until login) -> "Update User JWT" dialog with stacked fields: "External User Id" (prefilled with the current external ID) and "JWT Token" (multi-line). Actions: Cancel and Update; Update stays disabled until both are filled. Calls `OneSignal.updateUserJwt(externalId, token)`, caches the token, and refetches the user (see fetchUser).

JWT inputs: every JWT field above is full width and multi-line, 3 lines tall and growing to 5 before it scrolls. Tokens run to hundreds of characters, and a single-line field hides most of the pasted value.

Resulting grid: logged out, LOGIN USER | LOGIN WITH PROFILE (on iOS: LOGIN USER spans full width). Logged in, SWITCH USER | LOGOUT USER, then LOGIN WITH PROFILE | UPDATE USER JWT (on iOS: UPDATE USER JWT spans).

Language list, after Device Default, in this order: English (`en`), Arabic (`ar`), Azerbaijani (`az`), Bosnian (`bs`), Catalan (`ca`), Chinese (Simplified) (`zh-Hans`), Chinese (Traditional) (`zh-Hant`), Croatian (`hr`), Czech (`cs`), Danish (`da`), Dutch (`nl`), Estonian (`et`), Finnish (`fi`), French (`fr`), Georgian (`ka`), Bulgarian (`bg`), German (`de`), Greek (`el`), Hindi (`hi`), Hebrew (`he`), Hungarian (`hu`), Indonesian (`id`), Italian (`it`), Japanese (`ja`), Korean (`ko`), Latvian (`lv`), Lithuanian (`lt`), Malay (`ms`), Norwegian (`nb`), Persian (`fa`), Polish (`pl`), Portuguese (`pt`), Punjabi (`pa`), Romanian (`ro`), Russian (`ru`), Serbian (`sr`), Slovak (`sk`), Spanish (`es`), Swedish (`sv`), Thai (`th`), Turkish (`tr`), Ukrainian (`uk`), Vietnamese (`vi`).

### Prompt 2.2 - Push Section

- Title: "Push" with info icon
- Push Subscription ID (readonly, with a copy button per styles.md "Card Rows").
- Status (readonly), directly above the toggle: "Subscribed" when opted in AND notification permission is granted AND the push token is non-empty; otherwise "Unsubscribed". Recompute on push subscription and permission changes.
- "Opted In" toggle (optIn/optOut), disabled when permission NOT granted
- Auto-request permission when home screen loads
- PROMPT PUSH button: only visible when permission NOT granted, hidden once granted

### Prompt 2.3 - Send Push Notification Section

- Title: "Send Push Notification" with info icon
- Five buttons in a Button Grid (styles.md); CLEAR ALL spans the last row. SIMPLE and WITH IMAGE are primary; the rest are secondary:
  1. SIMPLE - title: "Simple Notification", body: "This is a simple push notification"
  2. WITH IMAGE - title: "Image Notification", body: "This notification includes an image"
     big_picture/ios_attachments: `https://media.onesignal.com/automated_push_templates/ratings_template.png`
  3. WITH SOUND - title: "Sound Notification", body: "This notification plays a custom sound"
     ios_sound: "vine_boom.wav", android_channel_id: optional `ONESIGNAL_ANDROID_CHANNEL_ID` env var, falling back to "b3b015d9-c050-4042-8548-dcc34aa44aa4" when empty or missing
     Sound file: copy `vine_boom.wav` from https://github.com/OneSignal/sdk-shared/tree/main/assets and add to each platform's native sound/resource directory (e.g. iOS app bundle, Android `res/raw/`)
  4. CUSTOM - dialog for custom title and body
  5. CLEAR ALL - calls OneSignal.Notifications.clearAll()

### Prompt 2.4 - In-App Messaging Section

- Title: "In-App Messaging" with info icon
- Toggle: "Pause In-App Messages" / "Toggle in-app message display"

### Prompt 2.5 - Send In-App Message Section

- Title: "Send In-App Message" with info icon
- Eight buttons in a Button Grid (styles.md, 4 rows), in this order (left, right):
  1. TOP - trigger: "iam_type" = "top_banner"
  2. CENTER - trigger: "iam_type" = "center_modal"
  3. BOTTOM - trigger: "iam_type" = "bottom_banner"
  4. FULL - trigger: "iam_type" = "full_screen"
  5. CAROUSEL - trigger: "iam_type" = "carousel"
  6. HTML - trigger: "iam_type" = "html"
  7. FULL BLEED - trigger: "iam_type" = "full_bleed"
  8. CAROUSEL BLEED - trigger: "iam_type" = "carousel_bleed"
- Styling: TOP, CENTER, BOTTOM and FULL are primary; the other four are secondary. Centered, no icons, UPPERCASE
- On tap: upserts `iam_type` in Triggers list. No snackbar (silent action — see Prompt 7.6)

### Prompt 2.6 - Aliases Section

- Title: "Aliases" with info icon
- Stacked key-value list (read-only, no delete icons, see styles.md "Stacked" layout)
- Filter out "external_id" and "onesignal_id" from display
- "No aliases added" when empty
- Buttons in a Button Grid (styles.md):
- ADD ALIAS -> PairInputDialog (Label + ID on same row)
- ADD ALIASES -> MultiPairInputDialog
- No remove functionality (aliases are add-only)

### Prompt 2.7 - Emails Section

- Title: "Emails" with info icon
- List with X icon per item (remove action)
- "No emails added" when empty
- ADD EMAIL -> dialog with empty email field
- Collapse when >5 items: show first 5, "X more" tappable to expand

### Prompt 2.8 - SMS Section

- Title: "SMS" with info icon
- Same pattern as Emails but for phone numbers
- "No SMS added" when empty
- ADD SMS -> dialog with empty SMS field

### Prompt 2.9 - Tags Section

- Title: "Tags" with info icon
- Stacked key-value list with X icon (remove action)
- "No tags added" when empty
- Buttons in a Button Grid (styles.md); REMOVE TAGS spans the second row when shown:
- ADD TAG -> PairInputDialog (Key + Value)
- ADD TAGS -> MultiPairInputDialog
- REMOVE TAGS (only when tags exist) -> MultiSelectRemoveDialog

### Prompt 2.10 - Outcomes Section

- Title: "Outcomes" with info icon
- SEND OUTCOME -> dialog with 3 radio options (compact rows, whole row tappable; styles.md "Radio and Checkbox Rows"):
  1. Normal Outcome -> name field
  2. Unique Outcome -> name field
  3. Outcome with Value -> name + value (number) fields

### Prompt 2.11 - Triggers Section (IN MEMORY ONLY)

- Title: "Triggers" with info icon
- Same list/Button Grid pattern as Tags (ADD TRIGGER, ADD TRIGGERS, REMOVE TRIGGERS — hidden when the list is empty), plus:
  - CLEAR ALL button (only when triggers exist)
- "No triggers added" when empty
- Triggers are IN MEMORY ONLY: not persisted, cleared on restart
- Sending an IAM also upserts `iam_type` in this list
- Transient test data for IAM testing

### Prompt 2.12 - Custom Events Section

- Title: "Custom Events" with info icon
- TRACK EVENT -> TrackEventDialog (dialog title: "Custom Event"):
  - "Event Name" (required, error if empty)
  - "Properties (optional, JSON)" with placeholder `{"key": "value"}`
    - Invalid JSON shows "Invalid JSON format" error
    - Valid JSON parsed to map, empty passes null
  - TRACK button disabled until name filled AND JSON valid (or empty)
- Calls OneSignal.User.trackEvent(name, properties)

### Prompt 2.13 - Location Section

- Title: "Location" with info icon
- Toggle: "Location Shared" / "Share device location with OneSignal"
- Buttons in a Button Grid (styles.md):
- PROMPT LOCATION button
- CHECK LOCATION button -> queries SDK and shows snackbar "Location shared: {bool}"

### Prompt 2.14 - Live Activities Section (iOS Only)

Only shown on iOS. Requires an iOS Widget Extension target with a Live Activity using `DefaultLiveActivityAttributes` from the OneSignal SDK.

- Title: "Live Activities" with info icon
- Input card with two editable fields (pre-filled, not empty), using Inline Input Row styling per styles.md:
  - "Activity ID" (default: "order-1") — identifies the Live Activity for all operations
  - "Order #" (default: "ORD-1234") — attribute set at start, immutable after
- Three buttons in a Button Grid (styles.md); END ACTIVITY spans the second row:
  1. START ACTIVITY — calls `OneSignal.LiveActivities.startDefault(activityId, attributes, content)` with initial order status. Disabled when Activity ID is empty.
  2. UPDATE → {NEXT STATUS} — cycles through order statuses via REST API (`event: "update"`). Label dynamically shows the next status (e.g. "UPDATE → ON THE WAY"). Disabled when Activity ID is empty, while updating, or when no API key is configured.
  3. END ACTIVITY — ends the activity via REST API (`event: "end"`) with `dismissal_date`. Secondary style. Disabled when Activity ID is empty or when no API key is configured.

Order status cycle (content state fields: `status`, `message`, `estimatedTime`):

| Status     | Message                      | ETA    |
| ---------- | ---------------------------- | ------ |
| preparing  | Your order is being prepared | 15 min |
| on_the_way | Driver is heading your way   | 10 min |
| delivered  | Order delivered!             |        |

Widget extension requirements:

- Uses `DefaultLiveActivityAttributes` from `OneSignalLiveActivities`
- Lock Screen banner: order number (from attributes), status icon, status label, message, ETA, progress bar
- Dynamic Island: expanded (icon, status, ETA, message), compact (icon + status label), minimal (icon)
- Status-based theming: preparing (orange), on_the_way (blue), delivered (green)
- If the file `examples/demo/ios/OneSignalWidget/OneSignalWidgetLiveActivity.swift` already exists, replace its contents with the shared reference implementation at `https://raw.githubusercontent.com/OneSignal/sdk-shared/main/demo/LiveActivity.swift`

For `.env` setup and `hasApiKey()` semantics see the Configuration section at the bottom of this guide.

### Prompt 2.15 - Secondary Screen

Launched by the "NEXT SCREEN" button at the bottom of the main screen. It uses the secondary style because it navigates rather than calling the SDK. Keep it a pushed screen (a separate Activity on Android), not a tab:

- Title: "Secondary Screen"
- Centered large headline text "Secondary Screen"

---

## Phase 3: View User API Integration

### Prompt 3.1 - Data Loading Flow

Single boolean `isLoading` on the state container drives a per-section inline spinner (see styles.md "Loading State"). The spinner is rendered by the four list sections that depend on the API fetch (Aliases, Tags, Emails, SMS) in the same slot as their empty state, so non-loading sections (push, IAM, location, live activities, etc.) stay fully interactive. Do NOT use a full-screen blocking overlay.

`fetchUserDataFromApi` is the single source of truth for refreshing user data and owns the `isLoading` toggle. On entry it bumps a monotonically-increasing `requestSequence` counter, sets `isLoading=true`, and notifies. In a try/finally it picks the lookup per fetchUser above (returns early when neither a cached JWT with an external ID nor an `onesignalId` is available), calls `fetchUser`, and then writes the lists/externalId — but only if `requestSequence` still matches its captured value, so a stale fetch can't overwrite a newer one. The finally clears `isLoading` only when `requestSequence` still matches, so an in-flight call doesn't prematurely clear the spinner for a newer one.

Merge, don't replace. When the fetch returns, write each remote list into local state via merge helpers rather than wholesale assignment:

- `mergePairs(prev, next)` for key/value lists (aliases, tags): upsert each remote key into the existing list. Existing keys keep their position; remote values overwrite local ones for the same key; keys present locally but missing remotely are kept (so an optimistic add issued during the in-flight fetch is not dropped before the SDK has flushed it).
- `mergeUnique(prev, next)` for flat string lists (emails, smsNumbers): union of `prev` and `next` preserving order and de-duplicating.

This keeps the UI stable: rows don't flicker/re-order when the fetch completes, and an item added locally a moment before the response arrives stays visible. The same `mergePairs`/`mergeUnique` helpers are reused by the per-action add handlers (addAlias, addTag, addEmail, ...) so optimistic updates and remote refreshes share one code path.

State transitions:

- **Cold start**: if `onesignalId` exists, await `fetchUserDataFromApi()` (which manages its own `isLoading`). If `onesignalId` is null, leave `isLoading=false`; sections show their normal empty state. The `OneSignal.login(storedExternalUserId)` call inside cold start may also trigger the user-state observer, which fires its own fetch; the request-sequence guard collapses the race.
- **Login**: clear aliases/tags/emails/sms/triggers lists immediately, set the optimistic external user id, and set `isLoading=true` so the four sections show the spinner without delay. Then call `OneSignal.login()`, persist the external user id, and clear the cached language (no `setLanguage` call). Do NOT call `fetchUserDataFromApi` from `loginUser` — the user-state observer drives it once the SDK assigns a new `onesignalId`, and the fetch's finally block clears `isLoading`. If `OneSignal.login()` itself throws synchronously, clear `isLoading` in the catch so the UI doesn't get stuck.
- **Logout**: clear aliases/tags/emails/sms/triggers lists synchronously -> `OneSignal.logout()` -> clear persisted external user id -> clear the cached language (no `setLanguage` call). Do NOT toggle `isLoading`; logout is local-only. The user-state observer will fire with `onesignalId=null` and is a no-op in that case.
- **onUserStateChange**: log the new `onesignalId`/`externalId`. When `onesignalId` is non-null, call `fetchUserDataFromApi()` — this is what drives the post-login refresh (the SDK only assigns the new `onesignalId` after `OneSignal.login()` queues its identify operation, so a synchronous fetch right after `login()` would race the assignment and return null). When `onesignalId` is null (logout), do not fetch — `logoutUser` has already cleared local lists.

Caveat: if `OneSignal.login(sameExternalId)` does not emit a change event (e.g., logging in with the already-active external id), `isLoading` will stay true. Acceptable for the demo; per-action handlers still work via optimistic updates.

REST API key is NOT used for fetchUser.

### Prompt 3.2 - UserData Model

```
aliases: map string->string   // From identity (filter out external_id, onesignal_id)
tags: map string->string      // From properties.tags
emails: list of strings       // From subscriptions where type=="Email" -> token
smsNumbers: list of strings   // From subscriptions where type=="SMS" -> token
externalId: nullable string   // From identity.external_id
fromJson(json) -> UserData
```

---

## Phase 4: Info Tooltips

### Prompt 4.1 - Tooltip Content (Remote)

Fetched at runtime, do NOT bundle locally:
`https://raw.githubusercontent.com/OneSignal/sdk-shared/main/demo/tooltip_content.json`

### Prompt 4.2 - Tooltip Helper

Singleton, holds map of key -> TooltipData. Fetches on init, fails silently (non-critical).

```
TooltipData { title, description, options?: list of TooltipOption }
TooltipOption { name, description }
```

### Prompt 4.3 - Tooltip UI Integration

SectionCard has optional info icon -> onInfoTap callback -> shows TooltipDialog with title, description, options.

---

## Phase 5: Data Persistence & Initialization

### Persisted (local storage)

PreferencesService: consent required, privacy consent, external user ID, location shared, IAM paused, language. The language is cached only so the picker shows the selection after a restart; don't re-send it on launch, since the native SDK persists its own value and there is no SDK getter. App ID is read from `.env` (not persisted in preferences).

### Initialization Flow

Two-layer restore on startup:

1. BEFORE initialize: set consentRequired + consentGiven from cache, then initialize.
   AFTER initialize: restore IAM paused + location shared from cache.
2. State layer reads UI state from SDK (not cache): IAM paused from SDK getter or cache, location shared from SDK getter or cache, externalUserId from SDK, consent values from cache (no SDK getter).

This ensures SDK is configured before init, and UI reflects SDK's actual state.

### Not Persisted (In-Memory Only)

- **Log View entries**: session-only, cleared on restart
- **triggersList**: session-only, cleared on restart
- **aliasesList**: fetched from API on start/login, local adds are immediate (SDK syncs async)
- **emailsList, smsNumbersList**: fetched from API each session
- **tagsList**: from SDK getTags() if available, also from API

---

## Phase 6: Testing Values (Appium)

All dialog fields EMPTY by default. Appium enters:

| Dialog              | Fields                                               |
| ------------------- | ---------------------------------------------------- |
| Login               | External User Id = "test"                            |
| Add Alias           | Label = "Test", ID = "Value"                         |
| Add Email           | Email = "test@onesignal.com"                         |
| Add SMS             | SMS = "123-456-5678"                                 |
| Add Tag             | Key = "Test", Value = "Value"                        |
| Add Trigger         | Key = "trigger_key", Value = "trigger_value"         |
| Outcome             | Name = "test_outcome", Value = "1.5"                 |
| Track Event         | Name = "test_event", Properties = `{"key": "value"}` |
| Custom Notification | Title = "Test Title", Body = "Test Body"             |

Add Multiple dialogs use the same values for the first row and support multiple rows.

### Prompt 6.2 - Accessibility Identifiers (Appium)

Use the platform's native accessibility/test ID mechanism. The ids MUST match exactly across platforms — the shared Appium suite under `sdk-shared/appium/tests/` selects elements by these ids.

| Platform                | Mechanism                |
| ----------------------- | ------------------------ |
| Android (native Kotlin) | `Modifier.testTag(...)` with `testTagsAsResourceId = true` |
| iOS (native Swift)      | `accessibilityIdentifier`|
| Flutter                 | `Semantics(identifier:)` |
| React Native            | `testID`                 |
| Capacitor / Cordova     | `data-testid`            |
| .NET MAUI               | `AutomationId`           |

**Scroll view**: `main_scroll_view`

**Section containers**: Each section has `{sectionKey}_section` wrapping it. Info icons have `{sectionKey}_info_icon`.

Section keys: `app`, `user`, `push`, `send_push`, `iam`, `send_iam`, `aliases`, `emails`, `sms`, `tags`, `outcomes`, `triggers`, `custom_events`, `location`, `live_activities`

**Log View**:

| Identifier          | Element                                                     |
| ------------------- | ----------------------------------------------------------- |
| `log_view`          | Log View container                                          |
| `log_entry_{index}` | Log entry text, 0-based, oldest first                       |
| `log_clear_button`  | Trash (clear) button; accessibility label `Clear logs`      |
| `log_toggle_button` | Collapse/expand chevron; label `Collapse logs` / `Expand logs` |

**Value displays**:

| Identifier                 | Element                               |
| -------------------------- | ------------------------------------- |
| `app_id_value`             | App ID text                           |
| `push_id_value`            | Push Subscription ID text             |
| `push_subscription_status` | Push Status (Subscribed/Unsubscribed) |
| `user_language_dropdown`   | Language picker (User section)        |
| `user_external_id_value`   | External ID text                      |

**Copy buttons**: the copy-to-clipboard icon buttons on the App ID, External ID and Push ID rows have no test tag. Expose them as buttons with the accessibility label `Copy App ID`, `Copy External ID` and `Copy Push ID` (iOS `accessibilityLabel`, Android content description, web `aria-label`), shown only while the value is set.

**Buttons**:

| Identifier                                                                                                                  | Button                                                                     |
| --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `login_user_button`                                                                                                         | Login / Switch User                                                        |
| `logout_user_button`                                                                                                        | Logout User                                                                |
| `composite_login_button`                                                                                                    | Login With Profile (Android only)                                          |
| `update_user_jwt_button`                                                                                                    | Update User JWT                                                            |
| `prompt_push_button`                                                                                                        | Prompt Push (only when permission not granted)                             |
| `send_simple_button`                                                                                                        | Send Simple notification                                                   |
| `send_image_button`                                                                                                         | Send Image notification                                                    |
| `send_sound_button`                                                                                                         | Send Sound notification                                                    |
| `send_custom_button`                                                                                                        | Send Custom notification (opens dialog)                                    |
| `clear_all_button`                                                                                                          | Clear all notifications                                                    |
| `send_iam_top_banner_button`, `send_iam_bottom_banner_button`, `send_iam_center_modal_button`, `send_iam_html_button`, `send_iam_full_screen_button`, `send_iam_full_bleed_button`, `send_iam_carousel_button`, `send_iam_carousel_bleed_button` | Send In-App Message (one per IAM type — pattern: `send_iam_{type}_button`) |
| `add_alias_button`, `add_multiple_aliases_button`                                                                           | Aliases section actions                                                    |
| `add_email_button`                                                                                                          | Add Email (opens dialog)                                                   |
| `add_sms_button`                                                                                                            | Add SMS (opens dialog)                                                     |
| `add_tag_button`, `add_multiple_tags_button`, `remove_tags_button`                                                          | Tags section actions                                                       |
| `add_trigger_button`, `add_multiple_triggers_button`, `remove_triggers_button`, `clear_triggers_button`                     | Triggers section actions                                                   |
| `send_outcome_button`                                                                                                       | Send Outcome (opens dialog)                                                |
| `track_event_button`                                                                                                        | Custom Events / Track Event action (opens dialog)                          |
| `prompt_location_button`, `check_location_button`                                                                           | Location section actions                                                   |
| `start_live_activity_button`, `update_live_activity_button`, `end_live_activity_button`                                     | Live Activities section actions (iOS only)                                 |
| `next_screen_button`                                                                                                        | Bottom NEXT SCREEN navigation button                                       |

**Toggles**:

| Identifier                | Toggle                                                  |
| ------------------------- | ------------------------------------------------------- |
| `consent_required_toggle` | Consent Required (App section)                          |
| `privacy_consent_toggle`  | Privacy Consent (only visible when consent required on) |
| `push_enabled_toggle`     | Opted In (Push section)                                 |
| `pause_iam_toggle`        | Pause In-App Messages                                   |
| `location_shared_toggle`  | Location Shared                                         |

**Dialog inputs and confirm buttons** (passed as parameters to reusable dialog components):

Confirm buttons on the shared SingleInput, SinglePair, MultiPair and MultiSelectRemove dialog components are generic; descriptive ids name only what's _inside_ the dialog (the input fields).

| Identifier                         | Dialog field / control                                      |
| ---------------------------------- | ----------------------------------------------------------- |
| `singleinput_confirm_button`       | Confirm on any SingleInput dialog (login, email, sms, ...)  |
| `singlepair_confirm_button`        | Confirm on any SinglePair dialog (alias, tag, trigger, ...) |
| `multipair_confirm_button`         | Confirm on any MultiPair dialog                             |
| `multipair_add_row_button`         | Add row inside any MultiPair dialog                         |
| `multipair_key_{idx}`              | Key field of MultiPair row N (0-indexed)                    |
| `multipair_value_{idx}`            | Value field of MultiPair row N (0-indexed)                  |
| `multiselect_confirm_button`       | Confirm on the MultiSelectRemove dialog                     |
| `remove_checkbox_{key}`            | Checkbox in MultiSelectRemove dialog (one per item)         |
| `login_user_id_input`              | Login External User Id field                                |
| `login_user_jwt_input`             | Login JWT field                                             |
| `composite_login_user_id_input`    | Login With Profile External User Id field                   |
| `composite_login_jwt_input`        | Login With Profile JWT field                                |
| `composite_login_email_input`      | Login With Profile Email field                              |
| `composite_login_email_enabled_input` | Login With Profile Email status select                   |
| `composite_login_sms_input`        | Login With Profile SMS field                                |
| `composite_login_sms_enabled_input` | Login With Profile SMS status select                       |
| `composite_login_tag_key_input`    | Login With Profile tag key field                            |
| `composite_login_tag_value_input`  | Login With Profile tag value field                          |
| `composite_login_alias_label_input` | Login With Profile alias label field                       |
| `composite_login_alias_id_input`   | Login With Profile alias ID field                           |
| `composite_login_confirm_button`   | Login With Profile confirm                                  |
| `update_jwt_external_id_input`     | Update User JWT External User Id field                      |
| `update_jwt_token_input`           | Update User JWT token field                                 |
| `update_jwt_confirm_button`        | Update User JWT confirm                                     |
| `alias_label_input`                | Add Alias label field                                       |
| `alias_id_input`                   | Add Alias ID field                                          |
| `email_input`                      | Add Email field                                             |
| `sms_input`                        | Add SMS field                                               |
| `tag_key_input`                    | Add Tag key field                                           |
| `tag_value_input`                  | Add Tag value field                                         |
| `trigger_key_input`                | Add Trigger key field                                       |
| `trigger_value_input`              | Add Trigger value field                                     |
| `outcome_name_input`               | Outcome name field                                          |
| `outcome_value_input`              | Outcome value field                                         |
| `outcome_type_normal_radio`        | Outcome dialog: Normal radio option                         |
| `outcome_type_unique_radio`        | Outcome dialog: Unique radio option                         |
| `outcome_type_value_radio`         | Outcome dialog: With Value radio option                     |
| `outcome_send_button`              | Outcome send/confirm button                                 |
| `event_name_input`                 | Custom Event name field                                     |
| `event_properties_input`           | Custom Event properties field                               |
| `event_track_button`               | Custom Event track/confirm button                           |
| `custom_notification_title_input`  | Custom Notification title field                             |
| `custom_notification_body_input`   | Custom Notification body field                              |
| `live_activity_id_input`           | Live Activity ID input (iOS only)                           |
| `live_activity_order_number_input` | Live Activity Order # input (iOS only)                      |
| `tooltip_title`                    | Tooltip dialog title                                        |
| `tooltip_description`              | Tooltip dialog description                                  |
| `tooltip_ok_button`                | Tooltip dialog OK/confirm button                            |

**List items and per-section list state**: Generated from each section's `sectionKey`. The four list sections that depend on the API fetch (Aliases, Tags, Emails, SMS) render either a loading spinner or an empty state in the same slot, so both must be addressable.

| Identifier pattern                                              | Element                                                                               |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `{sectionKey}_loading`                                          | Inline loading spinner in the list slot (Aliases, Tags, Emails, SMS)                  |
| `{sectionKey}_empty`                                            | Empty-state text in the list slot (e.g. `aliases_empty`, `tags_empty`)                |
| `{sectionKey}_pair_key_{keyText}`                               | Key cell of a key-value list row (Aliases, Tags, Triggers)                            |
| `{sectionKey}_pair_value_{keyText}`                             | Value cell of a key-value list row                                                    |
| `{sectionKey}_value_{value}`                                    | Single-value list row (Emails -> `emails_value_{email}`, SMS -> `sms_value_{number}`) |
| `{sectionKey}_remove_{keyText}` / `{sectionKey}_remove_{value}` | Per-row remove (X) button                                                             |

---

## Phase 7: Architecture

### Prompt 7.1 - State Management

Single state container at app root. Holds all UI state with public getters. Exposes action methods that update state and notify UI. Implementation is platform-idiomatic: a `useOneSignal` hook for React (react-native, react), Cordova, and Capacitor; an `AppViewModel` for .NET MAUI (C#) and Flutter. The state container calls the OneSignal SDK directly (no repository wrapper) and depends only on `PreferencesService` and `OneSignalApiService`. Initialize SDK before rendering. Fetch tooltips in background.

### Prompt 7.2 - Reusable Components

- **SectionCard**: card with title, optional info icon, content slot, onInfoTap callback, optional `sectionKey` for accessibility identifiers (generates `{sectionKey}_section` on the container and `{sectionKey}_info_icon` on the info button)
- **ToggleRow**: label, optional description, toggle control, optional `semanticsLabel` for accessibility identifier
- **CardKvRow**: label + read-only value ("—" when unset), optional value identifier, and an optional copy-to-clipboard icon button (App ID, External ID, Push ID) per styles.md "Card Rows". Only the icon copies; it writes the full value to the clipboard and shows the Prompt 7.6 feedback
- **ActionButton**: PrimaryButton (filled) and SecondaryButton (outlined, also used for removal and reset actions), full-width, per styles.md "Buttons". Both accept optional `semanticsLabel` for accessibility identifier.
- **ButtonGrid**: lays out a section's ActionButtons per styles.md "Button Grid" (two columns, odd last button spans, hidden buttons reflow). Used by every section with two or more buttons.
- **ListWidgets**: PairItem (key-value + optional delete), SingleItem (value + delete), EmptyState, LoadingState (inline spinner shown in the empty-state slot while a fetch is in flight, per styles.md), CollapsibleList (5 items then expandable; accepts an optional `loading` flag that swaps EmptyState for LoadingState when items is empty), PairList. All list widgets accept a required `sectionKey` for generating accessibility identifiers (e.g. `{sectionKey}_pair_key_{keyText}`, `{sectionKey}_remove_{keyText}`, `{sectionKey}_loading`). Empty list copy uses `"No <items> added"` with lowercase item names and lowercase `added` (exception: `"No SMS added"` keeps `SMS` uppercase).
- **Dialogs**: all full-width with consistent padding, top-anchored and keyboard-fixed, with a backdrop that covers the status and navigation bars and dismisses on tap, per styles.md "Dialogs". Dialogs accept optional semantics label parameters for key inputs and confirm buttons (e.g. `keySemanticsLabel`, `valueSemanticsLabel`, `confirmSemanticsLabel`).
  - SingleInputDialog, PairInputDialog (same row), MultiPairInputDialog (dynamic rows, dividers, X to delete, batch submit), MultiSelectRemoveDialog (checkboxes, batch remove)
  - LoginDialog, LoginWithProfileDialog (Android only), UpdateUserJwtDialog, OutcomeDialog, TrackEventDialog, CustomNotificationDialog, TooltipDialog

### Prompt 7.3 - MultiPairInputDialog

Shared by the Aliases, Tags, and Triggers ADD ALIASES / ADD TAGS / ADD TRIGGERS buttons.

- Starts with one empty key-value row (side by side)
- "Add Row" adds another row, dividers between rows
- X delete button per row (hidden when only one row)
- "Add All" disabled until all fields filled, validates on every change
- Submits as batch via SDK bulk APIs

### Prompt 7.4 - MultiSelectRemoveDialog

Shared by Tags and Triggers REMOVE buttons.

- The section button that opens this dialog (`remove_tags_button`, `remove_triggers_button`) is **hidden entirely** when the list is empty. Do not show it disabled.
- Checkbox per item, label shows key only. Compact rows, whole row tappable (styles.md "Radio and Checkbox Rows"). The test tag stays on the checkbox itself
- "Remove (N)" button shows selected count, disabled when none
- Returns selected keys list

### Prompt 7.5 - Theme

All styling defined in: `https://raw.githubusercontent.com/OneSignal/sdk-shared/refs/heads/main/demo/styles.md`

Implement theme constants/tokens mapping style reference to the platform's theming system.

### Prompt 7.6 - Feedback Messages (SnackBar/Toast)

Feedback messages are shown directly from the UI layer (not centralized in the state management layer). Wrap the platform's transient message API (SnackBar/Toast) in a single UI-layer helper -- a `BuildContext` extension, a hook returned by a provider, an injected controller, a static helper, etc. -- and call it from widget/section callbacks after the SDK action runs. See each SDK's `examples/build.md` for the concrete helper name, file location, and wiring.

**Replace on show:** when a new snackbar/toast is triggered while one is already visible, dismiss the current message immediately and show the new one (do not queue). Reset the 3s timer from when the new message appears. The helper must perform the dismiss-then-show internally so callers can fire `showSnackbar(...)` repeatedly without coordinating timers themselves.

**Duration:** show every snackbar/toast for **3000ms (3 seconds)**. Use an explicit named constant (e.g. `TOAST_DURATION_MS = 3000`) rather than platform defaults, so all demos behave the same in manual use and Appium runs.

Only the following actions show snackbar feedback from the UI:

- Outcomes: "Outcome sent: {name}" / "Unique outcome sent: {name}" / "Outcome sent: {name} = {value}"
- Custom Events: "Event tracked: {name}"
- Location check: "Location shared: {bool}"
- Copy to clipboard (App ID, External ID, Push ID copy buttons): "Copied {label}", but only where the OS doesn't confirm clipboard writes itself. Android 13+ shows its own clipboard preview, which a snackbar would overlap, so skip it there (and in wrappers running on Android 13+); iOS shows nothing, so show it

All other actions (login/logout, add/remove items, notifications, IAM, live activities, etc.) use the platform's standard logging primitive only -- no snackbar. The state management layer (ViewModel / Context / Store / etc.) MUST NOT hold snackbar state, expose snackbar messages (e.g. via `@Published`, `Flow`, `Channel`, observable events), or call the snackbar helper directly.

Logging:

- Use the platform's built-in logging primitive directly (`console.log`/`console.error` for JS/TS, `debugPrint` for Dart, `System.Diagnostics.Debug.WriteLine` for C#, `print`/`NSLog` for Swift, `Log.d`/`Log.e` for Kotlin/Java).

### Prompt 7.7 - Dialog Placement

Each section owns the dialogs for its actions (login, add/remove, outcomes, track event, custom push). The main screen/page owns tooltip dialogs only.

**Main screen/page pattern:**

- Layout + the tooltip dialog only. Hold a single piece of tooltip state (active key or open boolean) on the main screen.
- Pass `onInfoTap` / `onInfoClick` callbacks keyed by section so the main screen can show the matching tooltip when a section's info icon is tapped.
- Do not centralize action dialog visibility on the main screen.
- Do not store action dialog visibility, dialog input drafts, or "is dialog open" flags on the ViewModel / state container.

**Section pattern:**

1. Section declares local UI state for each of its action dialogs (`*Open` booleans, `@State` properties, `remember { mutableStateOf(false) }`, code-behind handlers, or an imperative `showDialog(...)` call -- whichever is idiomatic).
2. Button handler triggers the matching dialog.
3. Dialog confirm handler calls the SDK action via the ViewModel / repository, closes the dialog, and emits a snackbar (per Prompt 7.6) when the action is in the allowed-snackbar list.

**Shared dialog primitives** (single-input dialog, pair input, multi-pair, multi-select remove, login, outcome, track event, custom notification, tooltip) live in a platform-appropriate components folder; sections import and compose them locally rather than redeclaring per-section dialog markup.

See each SDK's `examples/build.md` for the platform-specific helper APIs, the exact shared-dialog folder, and any platform-idiomatic wiring (UI-tree injection mechanism, dialog presentation API, code-behind vs. declarative state, etc.).

---

## Configuration

### Environment variables (`.env`)

| Variable                      | Required                  | Default                                          | Purpose                                                                                                |
| ----------------------------- | ------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `ONESIGNAL_APP_ID`            | No                        | `77e32082-ea27-42e3-a898-c72e141824ef`           | OneSignal App ID. Loaded at startup from `.env`, NOT from local preferences. Falls back to default when empty or missing. |
| `ONESIGNAL_API_KEY`           | Live Activities only      | —                                                | REST API key. Required for Live Activity update/end. `hasApiKey()` returns true when set and not the placeholder; UPDATE / END buttons disable when false. |
| `ONESIGNAL_ANDROID_CHANNEL_ID`| No (Send-Sound only)      | `b3b015d9-c050-4042-8548-dcc34aa44aa4`           | Notification channel for the WITH SOUND payload.                                                       |

- Provide `.env.example` with placeholder values and a comment noting the default app ID.
- Add `.env` to `.gitignore`.

### Identifiers

Android package name / iOS bundle identifier MUST be `com.onesignal.sdkdemo` so the shared `google-services.json` (CI: `APPIUM_GOOGLE_SERVICES_JSON` via `setup-google-services`), the registered Apple App IDs and provisioning profiles match. iOS extensions use `com.onesignal.sdkdemo.NSE` and `com.onesignal.sdkdemo.LA`, and the App Group is `group.com.onesignal.sdkdemo.onesignal`. The native Android SDK's `huawei` flavor stays on `com.onesignal.example` to match its `agconnect-services.json`.

### REST API authentication

The `fetchUser` endpoint never uses the API key (no auth, or a Bearer JWT on Identity Verification apps). All other authenticated endpoints (currently just Live Activity update/end) use `Authorization: Key {ONESIGNAL_API_KEY}`.
