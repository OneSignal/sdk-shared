# OneSignal {{PLATFORM}} Sample App - Build Guide

Prompts and requirements to build the OneSignal {{PLATFORM}} Sample App from scratch.

---

## Phase 1: Initial Setup

### Prompt 1.1 - Project Foundation

Create a new {{PLATFORM}} project at `examples/demo/` (relative to the SDK repo root).

- Clean architecture: platform-idiomatic state container that calls the OneSignal SDK directly — a `useOneSignal` hook for React (react-native, react), Cordova, and Capacitor; an `AppViewModel` for .NET MAUI (C#) and Flutter. No repository wrapper layer.
- App name: "OneSignal Demo"
- Top app bar: centered title with OneSignal logo SVG + "{{PLATFORM}}" text
- Android package name / iOS bundle identifier: `com.onesignal.example`
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

Call the OneSignal SDK directly from the state container — a `useOneSignal` hook for React (react-native, react), Cordova, and Capacitor; an `AppViewModel` for .NET MAUI (C#) and Flutter. Do not introduce a repository/wrapper layer. The state container should expose the operations below as actions/methods:

- **User**: loginUser(externalUserId) -> async, logoutUser() -> async
- **Aliases**: addAlias(label, id), addAliases(map)
- **Email**: addEmail(email), removeEmail(email)
- **SMS**: addSms(number), removeSms(number)
- **Tags**: addTag(key, value), addTags(map), removeTag(key) if SDK supports, removeTags(keys), getTags() -> async map if SDK supports
- **Triggers** (via OneSignal.InAppMessages): addTrigger(key, value), addTriggers(map), removeTrigger(key) if SDK supports, removeTriggers(keys), clearTriggers()
- **Outcomes** (via OneSignal.Session): sendOutcome(name), sendUniqueOutcome(name), sendOutcomeWithValue(name, value)
- **Track Event**: trackEvent(name, properties?: map)
- **Push subscription**: getPushSubscriptionId() -> nullable, isPushOptedIn() -> nullable bool, optInPush(), optOutPush()
- **Notifications**: hasPermission() -> bool, requestPermission(fallbackToSettings) -> async bool, clearAll()
- **In-App Messages**: setPaused(bool)
- **Location**: setLocationShared(bool), isLocationShared() -> async bool, requestLocationPermission()
- **Privacy consent**: setConsentRequired(bool), setConsentGiven(bool)
- **User IDs**: getExternalId() -> nullable, getOnesignalId() -> nullable
- **Live Activities** (iOS only): startDefaultLiveActivity(activityId, attributes, content)
- **REST API** (delegated to OneSignalApiService): sendNotification(type) -> async bool, sendCustomNotification(title, body) -> async bool, fetchUser(onesignalId) -> async nullable UserData, updateLiveActivity(activityId, event, eventUpdates?) -> async bool

### Prompt 1.4 - OneSignalApiService (REST API Client)

Properties: \_appId (set during initialization)

Methods: setAppId(), getAppId(), hasApiKey(), sendNotification(type, subscriptionId), sendCustomNotification(title, body, subscriptionId), fetchUser(onesignalId), updateLiveActivity(activityId, event, eventUpdates?)

sendNotification:

- POST `https://onesignal.com/api/v1/notifications`
- Accept: `application/vnd.onesignal.v1+json`
- Uses `include_subscription_ids` (not include_player_ids)
- `big_picture` for Android image notifications
- `ios_attachments` for iOS image notifications

fetchUser:

- GET `https://api.onesignal.com/apps/{app_id}/users/by/onesignal_id/{onesignal_id}`
- NO Authorization header (public endpoint)
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

Initialize before UI renders:

```
OneSignal.Debug.setLogLevel(verbose)
OneSignal.consentRequired(cachedConsentRequired)
OneSignal.consentGiven(cachedPrivacyConsent)
OneSignal.initialize(appId)

// iOS only
OneSignal.LiveActivities.setupDefault({
  enablePushToStart: true,
  enablePushToUpdate: true,
})
```

Register listeners:

- InAppMessages: willDisplay, didDisplay, willDismiss, didDismiss, click
- Notifications: click, foregroundWillDisplay

Restore cached SDK states: IAM paused status, location shared status.

Register observers in state management layer:

- Push subscription change
- Notification permission change
- User state change -> log the new onesignalId/externalId, and when `onesignalId` is non-null, trigger `fetchUserDataFromApi()` so the post-login fetch runs once the SDK has actually assigned an id (see Phase 3.1). When `onesignalId` is null (logout), skip the fetch — the logout path already clears local lists.

Clean up listeners on teardown (if platform requires it).

---

## Phase 2: UI Sections

### Section Order (top to bottom)

1. **App Section** (App ID, Guidance Banner, Consent Toggle)
2. **User Section** (Status, External ID, Login/Logout)
3. **Push Section** (Push ID, Enabled Toggle, Auto-prompts on load)
4. **Send Push Notification Section** (Simple, With Image, With Sound, Custom, Clear All)
5. **In-App Messaging Section** (Pause toggle)
6. **Send In-App Message Section** (Top Banner, Bottom Banner, Center Modal, Full Screen)
7. **Aliases Section** (Add/Add Multiple, read-only list)
8. **Emails Section** (Collapsible list >5)
9. **SMS Section** (Collapsible list >5)
10. **Tags Section** (Add Tag/Add Multiple Tags/Remove Tags)
11. **Outcomes Section** (Send Outcome with type selection)
12. **Triggers Section** (Add Trigger/Add Multiple Triggers/Remove Triggers/Clear All Triggers - IN MEMORY ONLY)
13. **Custom Events Section** (JSON validation)
14. **Location Section** (Shared toggle, Prompt button, Check button)
15. **Live Activities Section** (iOS only - Start, Update, End)
16. **Next Screen Button**

### Prompt 2.1a - App Section

1. App ID display (readonly text). When `E2E_MODE=true`, mask the value with bullet characters for deterministic screenshots.
2. Sticky guidance banner:
   - "Add your own App ID, then rebuild to fully test all functionality."
   - Link: "Get your keys at onesignal.com" (opens browser)
   - Warning banner styling per styles.md
3. Consent card with up to two toggles:
   - "Consent Required" (always visible) -> OneSignal.consentRequired(value)
     Description: "Require consent before SDK processes data"
   - "Privacy Consent" (only visible when Consent Required is ON) -> OneSignal.consentGiven(value)
     Description: "Consent given for data collection"
     Separated by horizontal divider. NOT a blocking overlay.

### Prompt 2.1b - User Section

Separate SectionCard titled "User":

1. Status card (always visible, ABOVE buttons):
   - Two rows separated by a divider: "Status" and "External ID"
   - Logged out: Status = "Anonymous", External ID = "–"
   - Logged in: Status = "Logged In" (success/green), External ID = actual value
2. LOGIN USER button ("SWITCH USER" when logged in) -> dialog with empty "External User Id" field
3. LOGOUT USER button (only when logged in, outlined style)

### Prompt 2.2 - Push Section

- Title: "Push" with info icon
- Push Subscription ID (readonly). When `E2E_MODE=true`, mask the value with bullet characters.
- Enabled toggle (optIn/optOut), disabled when permission NOT granted
- Auto-request permission when home screen loads
- PROMPT PUSH button: only visible when permission NOT granted, hidden once granted

### Prompt 2.3 - Send Push Notification Section

- Title: "Send Push Notification" with info icon
- Five buttons:
  1. SIMPLE - title: "Simple Notification", body: "This is a simple push notification"
  2. WITH IMAGE - title: "Image Notification", body: "This notification includes an image"
     big_picture/ios_attachments: `https://media.onesignal.com/automated_push_templates/ratings_template.png`
  3. WITH SOUND - title: "Sound Notification", body: "This notification plays a custom sound"
     ios_sound: "vine_boom.wav", android_channel_id: optional `ONESIGNAL_ANDROID_CHANNEL_ID` env var, falling back to "b3b015d9-c050-4042-8548-dcc34aa44aa4" when empty or missing
     Sound file: copy `vine_boom.wav` from https://github.com/OneSignal/sdk-shared/tree/main/assets and add to each platform's native sound/resource directory (e.g. iOS app bundle, Android `res/raw/`)
  4. CUSTOM - dialog for custom title and body
  5. CLEAR ALL - outlined style, calls OneSignal.Notifications.clearAll()

### Prompt 2.4 - In-App Messaging Section

- Title: "In-App Messaging" with info icon
- Toggle: "Pause In-App Messages" / "Toggle in-app message display"

### Prompt 2.5 - Send In-App Message Section

- Title: "Send In-App Message" with info icon
- Four FULL-WIDTH buttons (not a grid):
  1. TOP BANNER - vertical-align-top icon, trigger: "iam_type" = "top_banner"
  2. BOTTOM BANNER - vertical-align-bottom icon, trigger: "iam_type" = "bottom_banner"
  3. CENTER MODAL - crop-square icon, trigger: "iam_type" = "center_modal"
  4. FULL SCREEN - fullscreen icon, trigger: "iam_type" = "full_screen"
- Styling: primary (red) background, white text, icon on LEFT, full width, left-aligned, UPPERCASE
- On tap: adds trigger, shows "Sent In-App Message: {type}", upserts `iam_type` in Triggers list

### Prompt 2.6 - Aliases Section

- Title: "Aliases" with info icon
- Stacked key-value list (read-only, no delete icons, see styles.md "Stacked" layout)
- Filter out "external_id" and "onesignal_id" from display
- "No aliases added" when empty
- ADD ALIAS -> PairInputDialog (Label + ID on same row)
- ADD MULTIPLE ALIASES -> MultiPairInputDialog
- No remove functionality (aliases are add-only)

### Prompt 2.7 - Emails Section

- Title: "Emails" with info icon
- List with X icon per item (remove action)
- "No Emails Added" when empty
- ADD EMAIL -> dialog with empty email field
- Collapse when >5 items: show first 5, "X more" tappable to expand

### Prompt 2.8 - SMS Section

- Title: "SMS" with info icon
- Same pattern as Emails but for phone numbers
- "No SMS Added" when empty
- ADD SMS -> dialog with empty SMS field

### Prompt 2.9 - Tags Section

- Title: "Tags" with info icon
- Stacked key-value list with X icon (remove action)
- "No tags added" when empty
- ADD TAG -> PairInputDialog (Key + Value)
- ADD MULTIPLE TAGS -> MultiPairInputDialog
- REMOVE TAGS (only when tags exist) -> MultiSelectRemoveDialog

### Prompt 2.10 - Outcomes Section

- Title: "Outcomes" with info icon
- SEND OUTCOME -> dialog with 3 radio options:
  1. Normal Outcome -> name field
  2. Unique Outcome -> name field
  3. Outcome with Value -> name + value (number) fields

### Prompt 2.11 - Triggers Section (IN MEMORY ONLY)

- Title: "Triggers" with info icon
- Same list/button pattern as Tags (ADD TRIGGER, ADD MULTIPLE TRIGGERS, REMOVE TRIGGERS), plus:
  - CLEAR ALL TRIGGERS button (only when triggers exist)
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
- PROMPT LOCATION button
- CHECK LOCATION SHARED button -> queries SDK and shows snackbar "Location shared: {bool}"

### Prompt 2.14 - Live Activities Section (iOS Only)

Only shown on iOS. Requires an iOS Widget Extension target with a Live Activity using `DefaultLiveActivityAttributes` from the OneSignal SDK.

- Title: "Live Activities" with info icon
- Input card with two editable fields (pre-filled, not empty), using Inline Input Row styling per styles.md:
  - "Activity ID" (default: "order-1") — identifies the Live Activity for all operations
  - "Order #" (default: "ORD-1234") — attribute set at start, immutable after
- Three buttons:
  1. START LIVE ACTIVITY — calls `OneSignal.LiveActivities.startDefault(activityId, attributes, content)` with initial order status. Disabled when Activity ID is empty.
  2. UPDATE → {NEXT STATUS} — cycles through order statuses via REST API (`event: "update"`). Label dynamically shows the next status (e.g. "UPDATE → ON THE WAY"). Disabled when Activity ID is empty, while updating, or when no API key is configured.
  3. END LIVE ACTIVITY — ends the activity via REST API (`event: "end"`) with `dismissal_date`. Destructive style. Disabled when Activity ID is empty or when no API key is configured.

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

Environment / API key setup:

- `.env` file with two variables:
  - `ONESIGNAL_APP_ID=your-onesignal-app-id` (overrides default app ID; falls back to default if empty or missing)
  - `ONESIGNAL_API_KEY=your-onesignal-api-key` (required for Live Activity update/end)
  - `E2E_MODE=true` (optional, masks sensitive IDs in the UI for deterministic Appium screenshots)
- Provide `.env.example` with placeholder values and a comment noting the default app ID
- Add `.env` to `.gitignore`
- `hasApiKey()` on the API service checks that the key is present and not the placeholder

### Prompt 2.15 - Secondary Screen

Launched by "NEXT SCREEN" button at bottom of main screen:

- Title: "Secondary Screen"
- Centered large headline text "Secondary Screen"

---

## Phase 3: View User API Integration

### Prompt 3.1 - Data Loading Flow

Single boolean `isLoading` on the state container drives a per-section inline spinner (see styles.md "Loading State"). The spinner is rendered by the four list sections that depend on the API fetch (Aliases, Tags, Emails, SMS) in the same slot as their empty state, so non-loading sections (push, IAM, location, live activities, etc.) stay fully interactive. Do NOT use a full-screen blocking overlay.

`fetchUserDataFromApi` is the single source of truth for refreshing user data and owns the `isLoading` toggle. On entry it bumps a monotonically-increasing `requestSequence` counter, sets `isLoading=true`, and notifies. In a try/finally it reads `getOnesignalId()` (returns early if null), calls `fetchUser`, and then writes the lists/externalId — but only if `requestSequence` still matches its captured value, so a stale fetch can't overwrite a newer one. The finally clears `isLoading` only when `requestSequence` still matches, so an in-flight call doesn't prematurely clear the spinner for a newer one.

Merge, don't replace. When the fetch returns, write each remote list into local state via merge helpers rather than wholesale assignment:

- `mergePairs(prev, next)` for key/value lists (aliases, tags): upsert each remote key into the existing list. Existing keys keep their position; remote values overwrite local ones for the same key; keys present locally but missing remotely are kept (so an optimistic add issued during the in-flight fetch is not dropped before the SDK has flushed it).
- `mergeUnique(prev, next)` for flat string lists (emails, smsNumbers): union of `prev` and `next` preserving order and de-duplicating.

This keeps the UI stable: rows don't flicker/re-order when the fetch completes, and an item added locally a moment before the response arrives stays visible. The same `mergePairs`/`mergeUnique` helpers are reused by the per-action add handlers (addAlias, addTag, addEmail, ...) so optimistic updates and remote refreshes share one code path.

State transitions:

- **Cold start**: if `onesignalId` exists, await `fetchUserDataFromApi()` (which manages its own `isLoading`). If `onesignalId` is null, leave `isLoading=false`; sections show their normal empty state. The `OneSignal.login(storedExternalUserId)` call inside cold start may also trigger the user-state observer, which fires its own fetch; the request-sequence guard collapses the race.
- **Login**: clear aliases/tags/emails/sms/triggers lists immediately, set the optimistic external user id, and set `isLoading=true` so the four sections show the spinner without delay. Then call `OneSignal.login()` and persist the external user id. Do NOT call `fetchUserDataFromApi` from `loginUser` — the user-state observer drives it once the SDK assigns a new `onesignalId`, and the fetch's finally block clears `isLoading`. If `OneSignal.login()` itself throws synchronously, clear `isLoading` in the catch so the UI doesn't get stuck.
- **Logout**: clear aliases/tags/emails/sms/triggers lists synchronously -> `OneSignal.logout()` -> clear persisted external user id. Do NOT toggle `isLoading`; logout is local-only. The user-state observer will fire with `onesignalId=null` and is a no-op in that case.
- **onUserStateChange**: log the new `onesignalId`/`externalId`. When `onesignalId` is non-null, call `fetchUserDataFromApi()` — this is what drives the post-login refresh (the SDK only assigns the new `onesignalId` after `OneSignal.login()` queues its identify operation, so a synchronous fetch right after `login()` would race the assignment and return null). When `onesignalId` is null (logout), do not fetch — `logoutUser` has already cleared local lists.

Caveat: if `OneSignal.login(sameExternalId)` does not emit a change event (e.g., logging in with the already-active external id), `isLoading` will stay true. Acceptable for the demo; per-action handlers still work via optimistic updates.

REST API key is NOT required for fetchUser.

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

PreferencesService: consent required, privacy consent, external user ID, location shared, IAM paused. App ID is read from `.env` (not persisted in preferences).

### Initialization Flow

Two-layer restore on startup:

1. BEFORE initialize: set consentRequired + consentGiven from cache, then initialize.
   AFTER initialize: restore IAM paused + location shared from cache.
2. State layer reads UI state from SDK (not cache): IAM paused from SDK getter or cache, location shared from SDK getter or cache, externalUserId from SDK, consent values from cache (no SDK getter).

This ensures SDK is configured before init, and UI reflects SDK's actual state.

### Not Persisted (In-Memory Only)

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
| Add Alias           | Key = "Test", Value = "Value"                        |
| Add Email           | Email = "test@onesignal.com"                         |
| Add SMS             | SMS = "123-456-5678"                                 |
| Add Tag             | Key = "Test", Value = "Value"                        |
| Add Trigger         | Key = "trigger_key", Value = "trigger_value"         |
| Outcome             | Name = "test_outcome", Value = "1.5"                 |
| Track Event         | Name = "test_event", Properties = `{"key": "value"}` |
| Custom Notification | Title = "Test Title", Body = "Test Body"             |

Add Multiple dialogs use the same values for the first row and support multiple rows.

### Prompt 6.2 - Accessibility Identifiers (Appium)

Use the platform's accessibility/test ID mechanism (e.g. `Semantics(identifier:)` in Flutter, `accessibilityIdentifier` in iOS, `testID` in React Native, `data-testid` in Cordova/Capacitor web, `AutomationId` in .NET MAUI). These identifiers allow Appium to locate elements reliably and MUST match exactly across platforms — the shared Appium suite under `sdk-shared/appium/tests/` selects elements by these ids.

**Scroll view**: `main_scroll_view`

**Section containers**: Each section has `{sectionKey}_section` wrapping it. Info icons have `{sectionKey}_info_icon`.

Section keys: `app`, `user`, `push`, `send_push`, `iam`, `send_iam`, `aliases`, `emails`, `sms`, `tags`, `outcomes`, `triggers`, `custom_events`, `location`, `live_activities`

**Value displays**:

| Identifier               | Element                           |
| ------------------------ | --------------------------------- |
| `app_id_value`           | App ID text                       |
| `push_id_value`          | Push Subscription ID text         |
| `user_status_value`      | User status (Anonymous/Logged In) |
| `user_external_id_value` | External ID text                  |

**Buttons**:

| Identifier                                                                                                                  | Button                                                                     |
| --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `login_user_button`                                                                                                         | Login / Switch User                                                        |
| `logout_user_button`                                                                                                        | Logout User                                                                |
| `prompt_push_button`                                                                                                        | Prompt Push (only when permission not granted)                             |
| `send_simple_button`                                                                                                        | Send Simple notification                                                   |
| `send_image_button`                                                                                                         | Send Image notification                                                    |
| `send_sound_button`                                                                                                         | Send Sound notification                                                    |
| `send_custom_button`                                                                                                        | Send Custom notification (opens dialog)                                    |
| `clear_all_button`                                                                                                          | Clear all notifications                                                    |
| `send_iam_top_banner_button`, `send_iam_bottom_banner_button`, `send_iam_center_modal_button`, `send_iam_full_screen_button` | Send In-App Message (one per IAM type — pattern: `send_iam_{type}_button`) |
| `add_alias_button`, `add_multiple_aliases_button`                                                                           | Aliases section actions                                                    |
| `add_email_button`                                                                                                          | Add Email (opens dialog)                                                   |
| `add_sms_button`                                                                                                            | Add SMS (opens dialog)                                                     |
| `add_tag_button`, `add_multiple_tags_button`, `remove_tags_button`                                                          | Tags section actions                                                       |
| `add_trigger_button`, `add_multiple_triggers_button`, `remove_triggers_button`, `clear_triggers_button`                     | Triggers section actions                                                   |
| `send_outcome_button`                                                                                                       | Send Outcome (opens dialog)                                                |
| `track_event_button`                                                                                                        | Track Event (opens dialog)                                                 |
| `prompt_location_button`, `check_location_button`                                                                           | Location section actions                                                   |
| `start_live_activity_button`, `update_live_activity_button`, `end_live_activity_button`                                     | Live Activities section actions (iOS only)                                 |
| `next_screen_button`                                                                                                        | Bottom NEXT SCREEN navigation button                                       |

**Toggles**:

| Identifier                | Toggle                                                  |
| ------------------------- | ------------------------------------------------------- |
| `consent_required_toggle` | Consent Required (App section)                          |
| `privacy_consent_toggle`  | Privacy Consent (only visible when consent required on) |
| `push_enabled_toggle`     | Push Enabled (Push section)                             |
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

## Phase 7: Implementation Details

### Alias Management

Hybrid approach: fetched from API on start/login, local adds are immediate (SDK syncs async), fresh data from API on next launch.

### Notification Permission

Auto-request in home screen's init/mount lifecycle. PROMPT PUSH button as fallback if denied. Hidden once granted. Push "Enabled" toggle disabled until permission granted.

---

## Phase 8: Architecture

### Prompt 8.1 - State Management

Single state container at app root. Holds all UI state with public getters. Exposes action methods that update state and notify UI. Implementation is platform-idiomatic: a `useOneSignal` hook for React (react-native, react), Cordova, and Capacitor; an `AppViewModel` for .NET MAUI (C#) and Flutter. The state container calls the OneSignal SDK directly (no repository wrapper) and depends only on `PreferencesService` and `OneSignalApiService`. Initialize SDK before rendering. Fetch tooltips in background.

### Prompt 8.2 - Reusable Components

- **SectionCard**: card with title, optional info icon, content slot, onInfoTap callback, optional `sectionKey` for accessibility identifiers (generates `{sectionKey}_section` on the container and `{sectionKey}_info_icon` on the info button)
- **ToggleRow**: label, optional description, toggle control, optional `semanticsLabel` for accessibility identifier
- **ActionButton**: PrimaryButton (filled) and DestructiveButton (outlined, for secondary/destructive actions), full-width, per styles.md. Both accept optional `semanticsLabel` for accessibility identifier.
- **ListWidgets**: PairItem (key-value + optional delete), SingleItem (value + delete), EmptyState, LoadingState (inline spinner shown in the empty-state slot while a fetch is in flight, per styles.md), CollapsibleList (5 items then expandable; accepts an optional `loading` flag that swaps EmptyState for LoadingState when items is empty), PairList. All list widgets accept a required `sectionKey` for generating accessibility identifiers (e.g. `{sectionKey}_pair_key_{keyText}`, `{sectionKey}_remove_{keyText}`, `{sectionKey}_loading`).
- **Dialogs**: all full-width with consistent padding. Dialogs accept optional semantics label parameters for key inputs and confirm buttons (e.g. `keySemanticsLabel`, `valueSemanticsLabel`, `confirmSemanticsLabel`).
  - SingleInputDialog, PairInputDialog (same row), MultiPairInputDialog (dynamic rows, dividers, X to delete, batch submit), MultiSelectRemoveDialog (checkboxes, batch remove)
  - LoginDialog, OutcomeDialog, TrackEventDialog, CustomNotificationDialog, TooltipDialog

### Prompt 8.3 - MultiPairInputDialog

Shared by Aliases, Tags, and Triggers ADD MULTIPLE buttons.

- Starts with one empty key-value row (side by side)
- "Add Row" adds another row, dividers between rows
- X delete button per row (hidden when only one row)
- "Add All" disabled until all fields filled, validates on every change
- Submits as batch via SDK bulk APIs

### Prompt 8.4 - MultiSelectRemoveDialog

Shared by Tags and Triggers REMOVE buttons.

- Checkbox per item, label shows key only
- "Remove (N)" button shows selected count, disabled when none
- Returns selected keys list

### Prompt 8.5 - Theme

All styling defined in: `https://raw.githubusercontent.com/OneSignal/sdk-shared/refs/heads/main/demo/styles.md`

Implement theme constants/tokens mapping style reference to the platform's theming system.

### Prompt 8.6 - Feedback Messages (SnackBar/Toast)

Feedback messages are shown directly from the UI layer (not centralized in the state management layer). Use a `BuildContext` extension or helper that calls the platform's transient message API (SnackBar/Toast). The extension should hide the current message before showing a new one. Show snackbars from UI widget callbacks after awaiting the action, using a context-mounted check before displaying.

Only the following actions show snackbar feedback from the UI:

- Login/Logout: "Logged in as {userId}" / "User logged out"
- Outcomes: "Outcome sent: {name}" / "Unique outcome sent: {name}" / "Outcome sent: {name} = {value}"
- Custom Events: "Event tracked: {name}"
- Location check: "Location shared: {bool}"

All other actions (add/remove items, notifications, IAM, live activities, etc.) use the platform's standard logging primitive only -- no snackbar. The state management layer should NOT hold snackbar state or expose snackbar messages.

Logging:

- Use the platform's built-in logging primitive directly (`console.log`/`console.error` for JS/TS, `debugPrint` for Dart, `System.Diagnostics.Debug.WriteLine` for C#, `print`/`NSLog` for Swift, `Log.d`/`Log.e` for Kotlin/Java).

---

## Configuration

Default app id: `77e32082-ea27-42e3-a898-c72e141824ef` (used when `ONESIGNAL_APP_ID` env var is empty or missing)

App ID is loaded from the `.env` file's `ONESIGNAL_APP_ID` variable at startup, NOT from local preferences. If the env var is empty or absent, fall back to the default app ID above.

REST API key is NOT required for the fetchUser endpoint.

REST API key IS required for Live Activity update/end operations. Store in `.env` as `ONESIGNAL_API_KEY`. Disable update/end buttons when not configured.

Android channel ID is optional for the WITH SOUND notification. Load from `.env` as `ONESIGNAL_ANDROID_CHANNEL_ID`; if empty or absent, fall back to `b3b015d9-c050-4042-8548-dcc34aa44aa4`.

Identifiers MUST be `com.onesignal.example` to work with existing `google-services.json` and `agconnect-services.json`.
