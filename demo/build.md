# OneSignal {{PLATFORM}} Sample App - Build Guide

Prompts and requirements to build the OneSignal {{PLATFORM}} Sample App from scratch.

---

## Phase 1: Initial Setup

### Prompt 1.1 - Project Foundation

Create a new {{PLATFORM}} project at `examples/demo/` (relative to the SDK repo root).

- Clean architecture: repository pattern with platform-idiomatic state management
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

### Prompt 1.3 - OneSignal Repository

Plain class (not tied to UI framework) injected into the state management layer. Centralizes all OneSignal SDK calls:

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
- **Location**: setLocationShared(bool), requestLocationPermission()
- **Privacy consent**: setConsentRequired(bool), setConsentGiven(bool)
- **User IDs**: getExternalId() -> nullable, getOnesignalId() -> nullable
- **REST API** (delegated to OneSignalApiService): sendNotification(type) -> async bool, sendCustomNotification(title, body) -> async bool, fetchUser(onesignalId) -> async nullable UserData

### Prompt 1.4 - OneSignalApiService (REST API Client)

Properties: \_appId (set during initialization)

Methods: setAppId(), getAppId(), sendNotification(type, subscriptionId), sendCustomNotification(title, body, subscriptionId), fetchUser(onesignalId)

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

### Prompt 1.5 - SDK Observers

Initialize before UI renders:

```
OneSignal.Debug.setLogLevel(verbose)
OneSignal.consentRequired(cachedConsentRequired)
OneSignal.consentGiven(cachedPrivacyConsent)
OneSignal.initialize(appId)
```

Register listeners:

- InAppMessages: willDisplay, didDisplay, willDismiss, didDismiss, click
- Notifications: click, foregroundWillDisplay

Restore cached SDK states: IAM paused status, location shared status.

Register observers in state management layer:

- Push subscription change
- Notification permission change
- User state change -> call fetchUserDataFromApi()

Clean up listeners on teardown (if platform requires it).

---

## Phase 2: UI Sections

### Section Order (top to bottom)

1. **App Section** (App ID, Guidance Banner, Consent Toggle)
2. **User Section** (Status, External ID, Login/Logout)
3. **Push Section** (Push ID, Enabled Toggle, Auto-prompts on load)
4. **Send Push Notification Section** (Simple, With Image, Custom, Clear All)
5. **In-App Messaging Section** (Pause toggle)
6. **Send In-App Message Section** (Top Banner, Bottom Banner, Center Modal, Full Screen)
7. **Aliases Section** (Add/Add Multiple, read-only list)
8. **Emails Section** (Collapsible list >5)
9. **SMS Section** (Collapsible list >5)
10. **Tags Section** (Add/Add Multiple/Remove Selected)
11. **Outcome Events Section** (Send Outcome with type selection)
12. **Triggers Section** (Add/Add Multiple/Remove Selected/Clear All - IN MEMORY ONLY)
13. **Track Event Section** (JSON validation)
14. **Location Section** (Shared toggle, Prompt button)
15. **Next Page Button**

### Prompt 2.1a - App Section

1. App ID display (readonly text)
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
3. LOGOUT USER button (only when logged in, destructive/outlined style)

### Prompt 2.2 - Push Section

- Title: "Push" with info icon
- Push Subscription ID (readonly)
- Enabled toggle (optIn/optOut), disabled when permission NOT granted
- Auto-request permission when home screen loads
- PROMPT PUSH button: only visible when permission NOT granted, hidden once granted

### Prompt 2.3 - Send Push Notification Section

- Title: "Send Push Notification" with info icon
- Four buttons:
  1. SIMPLE - title: "Simple Notification", body: "This is a simple push notification"
  2. WITH IMAGE - title: "Image Notification", body: "This notification includes an image"
     big_picture/ios_attachments: `https://media.onesignal.com/automated_push_templates/ratings_template.png`
  3. CUSTOM - dialog for custom title and body
  4. CLEAR ALL - destructive/outlined style, calls OneSignal.Notifications.clearAll()

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
- "No Aliases Added" when empty
- ADD -> PairInputDialog (Label + ID on same row)
- ADD MULTIPLE -> MultiPairInputDialog
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
- "No Tags Added" when empty
- ADD -> PairInputDialog (Key + Value)
- ADD MULTIPLE -> MultiPairInputDialog
- REMOVE SELECTED (only when tags exist) -> MultiSelectRemoveDialog

### Prompt 2.10 - Outcome Events Section

- Title: "Outcome Events" with info icon
- SEND OUTCOME -> dialog with 3 radio options:
  1. Normal Outcome -> name field
  2. Unique Outcome -> name field
  3. Outcome with Value -> name + value (number) fields

### Prompt 2.11 - Triggers Section (IN MEMORY ONLY)

- Title: "Triggers" with info icon
- Same list/button pattern as Tags, plus:
  - CLEAR ALL button (only when triggers exist)
- Triggers are IN MEMORY ONLY: not persisted, cleared on restart
- Sending an IAM also upserts `iam_type` in this list
- Transient test data for IAM testing

### Prompt 2.12 - Track Event Section

- Title: "Track Event" with info icon
- TRACK EVENT -> TrackEventDialog:
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

### Prompt 2.14 - Secondary Screen

Launched by "Next Activity" button at bottom of main screen:

- Title: "Secondary Activity"
- Centered large headline text "Secondary Activity"

---

## Phase 3: View User API Integration

### Prompt 3.1 - Data Loading Flow

Loading overlay: full-screen semi-transparent with centered spinner, driven by isLoading state.
Add 100ms delay after populating data before hiding loader (ensures UI renders).

- **Cold start**: if onesignalId exists, show loading -> fetchUserDataFromApi() -> delay 100ms -> hide. If null, show empty state.
- **Login**: show loading -> OneSignal.login() -> clear old data -> wait for onUserStateChange -> fetchUserDataFromApi() -> delay -> hide
- **Logout**: show loading -> OneSignal.logout() -> clear lists -> hide
- **onUserStateChange**: call fetchUserDataFromApi() to sync

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

PreferencesService: App ID, consent required, privacy consent, external user ID, location shared, IAM paused.

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

---

## Phase 7: Implementation Details

### Alias Management

Hybrid approach: fetched from API on start/login, local adds are immediate (SDK syncs async), fresh data from API on next launch.

### Notification Permission

Auto-request in home screen's init/mount lifecycle. PROMPT PUSH button as fallback if denied. Hidden once granted. Push "Enabled" toggle disabled until permission granted.

---

## Phase 8: Architecture

### Prompt 8.1 - State Management

Single state container at app root. Holds all UI state with public getters. Exposes action methods that update state and notify UI. Receives OneSignalRepository + PreferencesService via injection. Initialize SDK before rendering. Fetch tooltips in background.

### Prompt 8.2 - Reusable Components

- **SectionCard**: card with title, optional info icon, content slot, onInfoTap callback
- **ToggleRow**: label, optional description, toggle control
- **ActionButton**: PrimaryButton (filled) and DestructiveButton (outlined), full-width, per styles.md
- **ListWidgets**: PairItem (key-value + optional delete), SingleItem (value + delete), EmptyState, CollapsibleList (5 items then expandable), PairList
- **LoadingOverlay**: full-screen spinner overlay per styles.md
- **Dialogs**: all full-width with consistent padding
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

Shared by Tags and Triggers REMOVE SELECTED buttons.

- Checkbox per item, label shows key only
- "Remove (N)" button shows selected count, disabled when none
- Returns selected keys list

### Prompt 8.5 - Theme

All styling defined in: `https://raw.githubusercontent.com/OneSignal/sdk-shared/refs/heads/main/demo/styles.md`

Implement theme constants/tokens mapping style reference to the platform's theming system.

### Prompt 8.6 - Log View (Appium-Ready)

Collapsible log view at top of screen.

LogManager: singleton with reactive updates, API: d(tag, message), i(), w(), e(), also prints to console.

LogView: layout per styles.md Logs View section, 100dp list height, newest first, trash icon when entries exist.

Appium IDs: `log_view_container`, `log_view_header`, `log_view_count`, `log_view_clear_button`, `log_view_list`, `log_view_empty`, `log_entry_{N}`, `log_entry_{N}_timestamp`, `log_entry_{N}_level`, `log_entry_{N}_message`

Use the platform's accessibility/test ID mechanism.

### Prompt 8.7 - Feedback Messages

All actions show brief feedback via platform's transient message (SnackBar/Toast):

- Login/Logout: "Logged in as: {userId}" / "Logged out"
- Add/remove items: "Alias added: {label}", "{count} alias(es) added", etc.
- Notifications: "Notification sent: {type}" / "Failed to send notification"
- IAM: "Sent In-App Message: {type}"
- Outcomes: "Outcome sent: {name}"
- Events: "Event tracked: {name}"

Clear previous message before showing new. All messages also logged via LogManager.i().

---

## Configuration

Default app id: `77e32082-ea27-42e3-a898-c72e141824ef`

REST API key is NOT required for the fetchUser endpoint.

Identifiers MUST be `com.onesignal.example` to work with existing `google-services.json` and `agconnect-services.json`.
