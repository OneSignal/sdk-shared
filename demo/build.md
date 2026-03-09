# OneSignal {{PLATFORM}} Sample App - Build Guide

This document contains all the prompts and requirements needed to build the OneSignal {{PLATFORM}} Sample App from scratch. Give these prompts to an AI assistant or follow them manually to recreate the app.

---

## Phase 0: Reference Screenshots (REQUIRED)

### Prompt 0.1 - Capture Reference UI

Before building anything, an Android emulator MUST be running with the
reference OneSignal demo app installed. These screenshots are the source
of truth for the UI you are building. Do NOT proceed to Phase 1 without them.

Check for connected emulators:
adb devices

If no device is listed, stop and ask the user to start one.

Identify which emulator has com.onesignal.sdktest installed by checking each listed device, e.g.:
adb -s emulator-5554 shell pm list packages 2>/dev/null | grep -i onesignal
adb -s emulator-5556 shell pm list packages 2>/dev/null | grep -i onesignal

Use that emulator's serial (e.g. emulator-5556) for all subsequent adb commands via the -s flag.

Launch the reference app:
adb -s <emulator-serial> shell am start -n com.onesignal.sdktest/.ui.main.MainActivity

Dismiss any in-app messages that appear on launch. Tap the X or
click-through button on each IAM until the main UI is fully visible
with no overlays.

Create an output directory:
mkdir -p /tmp/onesignal_reference

Capture screenshots by scrolling through the full UI:

1. Take a screenshot from the top of the screen:
   adb shell screencap -p /sdcard/ref_01.png && adb pull /sdcard/ref_01.png /tmp/onesignal_reference/ref_01.png
2. Scroll down by roughly one viewport height:
   adb shell input swipe 500 1500 500 500
3. Take the next screenshot (ref_02.png, ref_03.png, etc.)
4. Repeat until you've reached the bottom of the scrollable content

You MUST read each captured screenshot image so you can see the actual UI.
These images define the visual target for every section you build later.
Pay close attention to:

- Section header style and casing
- Card vs non-card content grouping
- Button placement (inside vs outside cards)
- List item layout (stacked vs inline key-value)
- Icon choices (delete, close, info, etc.)
- Typography, spacing, and colors

You can also interact with the reference app to observe specific flows:

Dump the UI hierarchy to find elements by resource-id, text, or content-desc:
adb shell uiautomator dump /sdcard/ui.xml && adb pull /sdcard/ui.xml /tmp/onesignal_reference/ui.xml

Parse the XML to find an element's bounds, then tap it:
adb shell input tap <centerX> <centerY>

Type into a focused text field:
adb shell input text "test"

Example flow to observe "Add Tag" behavior:

1. Dump UI -> find the ADD button bounds -> tap it
2. Dump UI -> find the Key and Value fields -> tap and type into them
3. Tap the confirm button -> screenshot the result
4. Compare the tag list state before and after

Also capture screenshots of key dialogs to match their layout:

- Add Alias (single pair input)
- Add Multiple Aliases/Tags (dynamic rows with add/remove)
- Remove Selected Tags (checkbox multi-select)
- Login User
- Send Outcome (radio options)
- Track Event (with JSON properties field)
- Custom Notification (title + body)
  These dialog screenshots are important for matching field layout,
  button placement, spacing, and validation behavior.

Refer back to these screenshots throughout all remaining phases whenever
you need to decide on layout, spacing, section order, dialog flows, or
overall look and feel.

---

## Phase 1: Initial Setup

### Prompt 1.1 - Project Foundation

Create a new {{PLATFORM}} project at examples/demo/ (relative to the SDK repo root).

Build the app with:

- Clean architecture: repository pattern with platform-idiomatic state management
- App name: "OneSignal Demo"
- Top app bar: centered title with OneSignal logo SVG + "{{PLATFORM}}" text
- Support for both Android and iOS
- Android package name: com.onesignal.example
- iOS bundle identifier: com.onesignal.example
- All dialogs should have EMPTY input fields (for Appium testing - test framework enters values)
- Separate widget/component files per section to keep files focused and readable

Download the app bar logo SVG from:
https://raw.githubusercontent.com/OneSignal/sdk-shared/refs/heads/main/assets/onesignal_logo.svg
Save it to the demo project assets directory and render it in the app bar/header.

Download the padded app icon PNG from:
https://raw.githubusercontent.com/OneSignal/sdk-shared/refs/heads/main/assets/onesignal_logo_icon_padded.png
Save it to the project assets, generate all platform app icons, then delete the downloaded file.

Reference the OneSignal SDK from the parent repo using a local path/file dependency.

### Prompt 1.2 - Dependencies

Add appropriate dependencies for:

- OneSignal SDK (local path reference)
- State management (platform-idiomatic)
- Local persistence (SharedPreferences / AsyncStorage / localStorage)
- HTTP client (for REST API calls)
- SVG rendering (for AppBar logo)
- Navigation (if the platform needs a library)
- Icon library (Material icons)

### Prompt 1.3 - OneSignal Repository

Create a OneSignalRepository class that centralizes all OneSignal SDK calls.
This is a plain class (not tied to a UI framework) injected into the state management layer.

User operations:

- loginUser(externalUserId) -> async
- logoutUser() -> async

Alias operations:

- addAlias(label, id)
- addAliases(aliases: map of label->id)

Email operations:

- addEmail(email)
- removeEmail(email)

SMS operations:

- addSms(smsNumber)
- removeSms(smsNumber)

Tag operations:

- addTag(key, value)
- addTags(tags: map of key->value)
- removeTag(key) (if SDK supports single remove)
- removeTags(keys: list of strings)
- getTags() -> async map of key->value (if SDK supports)

Trigger operations (via OneSignal.InAppMessages):

- addTrigger(key, value)
- addTriggers(triggers: map of key->value)
- removeTrigger(key) (if SDK supports single remove)
- removeTriggers(keys: list of strings)
- clearTriggers()

Outcome operations (via OneSignal.Session):

- sendOutcome(name)
- sendUniqueOutcome(name)
- sendOutcomeWithValue(name, value: number)

Track Event:

- trackEvent(name, properties?: map)

Push subscription:

- getPushSubscriptionId() -> nullable string
- isPushOptedIn() -> nullable boolean
- optInPush()
- optOutPush()

Notifications:

- hasPermission() -> boolean
- requestPermission(fallbackToSettings: boolean) -> async boolean

In-App Messages:

- setPaused(paused: boolean)

Location:

- setLocationShared(shared: boolean)
- requestLocationPermission()

Privacy consent:

- setConsentRequired(required: boolean)
- setConsentGiven(granted: boolean)

User IDs:

- getExternalId() -> nullable string
- getOnesignalId() -> nullable string

Notification sending (via REST API, delegated to OneSignalApiService):

- sendNotification(type: NotificationType) -> async boolean
- sendCustomNotification(title, body) -> async boolean
- fetchUser(onesignalId) -> async nullable UserData

### Prompt 1.4 - OneSignalApiService (REST API Client)

Create OneSignalApiService class for REST API calls:

Properties:

- \_appId: string (set during initialization)

Methods:

- setAppId(appId)
- getAppId() -> string
- sendNotification(type: NotificationType, subscriptionId) -> async boolean
- sendCustomNotification(title, body, subscriptionId) -> async boolean
- fetchUser(onesignalId) -> async nullable UserData

sendNotification endpoint:

- POST https://onesignal.com/api/v1/notifications
- Accept header: "application/vnd.onesignal.v1+json"
- Uses include_subscription_ids (not include_player_ids)
- Includes big_picture for Android image notifications
- Includes ios_attachments for iOS image notifications (needed for the NSE to download and attach images)

fetchUser endpoint:

- GET https://api.onesignal.com/apps/{app_id}/users/by/onesignal_id/{onesignal_id}
- NO Authorization header needed (public endpoint)
- Returns UserData with aliases, tags, emails, smsNumbers, externalId

### Prompt 1.5 - SDK Observers

Set up OneSignal initialization and listeners before the UI renders:

OneSignal.Debug.setLogLevel(verbose)
OneSignal.consentRequired(cachedConsentRequired)
OneSignal.consentGiven(cachedPrivacyConsent)
OneSignal.initialize(appId)

Then register listeners:

- InAppMessages: willDisplay, didDisplay, willDismiss, didDismiss, click
- Notifications: click, foregroundWillDisplay

After initialization, restore cached SDK states from local persistence:

- InAppMessages paused status
- Location shared status

Register observers in the state management layer:

- Push subscription change -> react to push subscription changes
- Notification permission change -> react to permission changes
- User state change -> call fetchUserDataFromApi() when user changes

Clean up listeners on teardown (if the platform requires it).

---

## Phase 2: UI Sections

### Section Order (top to bottom)

1. **App Section** (App ID, Guidance Banner, Consent Toggle)
2. **User Section** (Status, External ID, Login/Logout)
3. **Push Section** (Push ID, Enabled Toggle, Auto-prompts permission on load)
4. **Send Push Notification Section** (Simple, With Image, Custom buttons)
5. **In-App Messaging Section** (Pause toggle)
6. **Send In-App Message Section** (Top Banner, Bottom Banner, Center Modal, Full Screen - with icons)
7. **Aliases Section** (Add/Add Multiple, read-only list)
8. **Emails Section** (Collapsible list >5 items)
9. **SMS Section** (Collapsible list >5 items)
10. **Tags Section** (Add/Add Multiple/Remove Selected)
11. **Outcome Events Section** (Send Outcome dialog with type selection)
12. **Triggers Section** (Add/Add Multiple/Remove Selected/Clear All - IN MEMORY ONLY)
13. **Track Event Section** (Track Event with JSON validation)
14. **Location Section** (Location Shared toggle, Prompt Location button)
15. **Next Page Button**

### Prompt 2.1a - App Section

App Section layout:

1. App ID display (readonly text showing the OneSignal App ID)

2. Sticky guidance banner below App ID:
   - Text: "Add your own App ID, then rebuild to fully test all functionality."
   - Link text: "Get your keys at onesignal.com" (clickable, opens browser)
   - Warning banner styling per styles.md

3. Consent card with up to two toggles:
   a. "Consent Required" toggle (always visible):
   - Label: "Consent Required"
   - Description: "Require consent before SDK processes data"
   - Calls OneSignal.consentRequired(value)
     b. "Privacy Consent" toggle (only visible when Consent Required is ON):
   - Label: "Privacy Consent"
   - Description: "Consent given for data collection"
   - Calls OneSignal.consentGiven(value)
   - Separated from the above toggle by a horizontal divider
   - NOT a blocking overlay - user can interact with app regardless of state

### Prompt 2.1b - User Section

User Section layout (separate SectionCard titled "User", placed after App Section):

1. User status card (always visible, ABOVE the login/logout buttons):
   - Card with two rows separated by a divider
   - Row 1: "Status" label on the left, value on the right
   - Row 2: "External ID" label on the left, value on the right
   - When logged out:
     - Status shows "Anonymous"
     - External ID shows "–" (dash)
   - When logged in:
     - Status shows "Logged In" with success/green styling
     - External ID shows the actual external user ID

2. LOGIN USER button:
   - Shows "LOGIN USER" when no user is logged in
   - Shows "SWITCH USER" when a user is logged in
   - Opens "Login User" dialog with empty "External User Id" field

3. LOGOUT USER button (only visible when a user is logged in)

### Prompt 2.2 - Push Section

Push Section:

- Section title: "Push" with info icon for tooltip
- Push Subscription ID display (readonly)
- Enabled toggle switch (controls optIn/optOut)
  - Disabled when notification permission is NOT granted
- Notification permission is automatically requested when home screen loads
- PROMPT PUSH button:
  - Only visible when notification permission is NOT granted (fallback if user denied)
  - Requests notification permission when clicked
  - Hidden once permission is granted

### Prompt 2.3 - Send Push Notification Section

Send Push Notification Section (placed right after Push Section):

- Section title: "Send Push Notification" with info icon for tooltip
- Four buttons:
  1. SIMPLE - title: "Simple Notification", body: "This is a simple push notification"
  2. WITH IMAGE - title: "Image Notification", body: "This notification includes an image"
     big_picture (Android): https://media.onesignal.com/automated_push_templates/ratings_template.png
     ios_attachments (iOS): {"image": "https://media.onesignal.com/automated_push_templates/ratings_template.png"}
  3. CUSTOM - opens dialog for custom title and body
  4. CLEAR ALL - calls OneSignal.Notifications.clearAllNotificaitons() to remove all delivered notifications

Tooltip should explain each button type.

### Prompt 2.4 - In-App Messaging Section

In-App Messaging Section (placed right after Send Push):

- Section title: "In-App Messaging" with info icon for tooltip
- Pause In-App Messages toggle switch:
  - Label: "Pause In-App Messages"
  - Description: "Toggle in-app message display"

### Prompt 2.5 - Send In-App Message Section

Send In-App Message Section (placed right after In-App Messaging):

- Section title: "Send In-App Message" with info icon for tooltip
- Four FULL-WIDTH buttons (not a grid):
  1. TOP BANNER - vertical-align-top icon, trigger: "iam_type" = "top_banner"
  2. BOTTOM BANNER - vertical-align-bottom icon, trigger: "iam_type" = "bottom_banner"
  3. CENTER MODAL - crop-square icon, trigger: "iam_type" = "center_modal"
  4. FULL SCREEN - fullscreen icon, trigger: "iam_type" = "full_screen"
- Button styling: primary (red) background, white text, type-specific icon on
  LEFT side only, full width, left-aligned content, UPPERCASE text
- On tap: adds trigger and shows feedback message "Sent In-App Message: {type}"
  - Also upserts `iam_type` in the Triggers list immediately so UI reflects the sent IAM type

Tooltip should explain each IAM type.

### Prompt 2.6 - Aliases Section

Aliases Section (placed after Send In-App Message):

- Section title: "Aliases" with info icon for tooltip
- Stacked key-value list (read-only, no delete icons)
- Each item shows Label on top, ID below (see styles.md "Stacked" list layout)
- Filter out "external_id" and "onesignal_id" from display (these are special)
- "No Aliases Added" text when empty
- ADD button -> PairInputDialog with empty Label and ID fields on the same row (single add)
- ADD MULTIPLE button -> MultiPairInputDialog (dynamic rows, add/remove)
- No remove/delete functionality (aliases are add-only from the UI)

### Prompt 2.7 - Emails Section

Emails Section:

- Section title: "Emails" with info icon for tooltip
- List showing email addresses
- Each item shows email with an X icon (remove action)
- "No Emails Added" text when empty
- ADD EMAIL button -> dialog with empty email field
- Collapse behavior when >5 items:
  - Show first 5 items
  - Show "X more" text (tappable)
  - Expand to show all when tapped

### Prompt 2.8 - SMS Section

SMS Section:

- Section title: "SMS" with info icon for tooltip
- List showing phone numbers
- Each item shows phone number with an X icon (remove action)
- "No SMS Added" text when empty
- ADD SMS button -> dialog with empty SMS field
- Collapse behavior when >5 items (same as Emails)

### Prompt 2.9 - Tags Section

Tags Section:

- Section title: "Tags" with info icon for tooltip
- List showing key-value pairs
- Each item shows key above value (stacked layout) with an X icon on the right (remove action)
- "No Tags Added" text when empty
- ADD button -> PairInputDialog with empty Key and Value fields (single add)
- ADD MULTIPLE button -> MultiPairInputDialog (dynamic rows)
- REMOVE SELECTED button:
  - Only visible when at least one tag exists
  - Opens MultiSelectRemoveDialog with checkboxes

### Prompt 2.10 - Outcome Events Section

Outcome Events Section:

- Section title: "Outcome Events" with info icon for tooltip
- SEND OUTCOME button -> opens dialog with 3 radio options:
  1. Normal Outcome -> shows name input field
  2. Unique Outcome -> shows name input field
  3. Outcome with Value -> shows name and value (number) input fields

### Prompt 2.11 - Triggers Section (IN MEMORY ONLY)

Triggers Section:

- Section title: "Triggers" with info icon for tooltip
- List showing key-value pairs
- Each item shows key above value (stacked layout) with an X icon on the right (remove action)
- "No Triggers Added" text when empty
- ADD button -> PairInputDialog with empty Key and Value fields (single add)
- ADD MULTIPLE button -> MultiPairInputDialog (dynamic rows)
- Two action buttons (only visible when triggers exist):
  - REMOVE SELECTED -> MultiSelectRemoveDialog with checkboxes
  - CLEAR ALL -> Removes all triggers at once

IMPORTANT: Triggers are stored IN MEMORY ONLY during the app session.

- triggersList is an in-memory list of key-value pairs in the state layer
- Sending an IAM button also updates the same list by setting `iam_type`
- Triggers are NOT persisted to local storage
- Triggers are cleared when the app is killed/restarted
- This is intentional - triggers are transient test data for IAM testing

### Prompt 2.12 - Track Event Section

Track Event Section:

- Section title: "Track Event" with info icon for tooltip
- TRACK EVENT button -> opens TrackEventDialog with:
  - "Event Name" label + empty input field (required, shows error if empty on submit)
  - "Properties (optional, JSON)" label + input field with placeholder hint {"key": "value"}
    - If non-empty and not valid JSON, shows "Invalid JSON format" error on the field
    - If valid JSON, parsed and converted to a map for the SDK call
    - If empty, passes null/undefined
  - TRACK button disabled until name is filled AND JSON is valid (or empty)
- Calls OneSignal.User.trackEvent(name, properties)

### Prompt 2.13 - Location Section

Location Section:

- Section title: "Location" with info icon for tooltip
- Location Shared toggle switch:
  - Label: "Location Shared"
  - Description: "Share device location with OneSignal"
- PROMPT LOCATION button

### Prompt 2.14 - Secondary Screen

Secondary Screen (launched by "Next Activity" button at bottom of main screen):

- Screen title: "Secondary Activity"
- Screen content: centered text "Secondary Activity" using a large headline style
- Simple screen, no additional functionality needed

---

## Phase 3: View User API Integration

### Prompt 3.1 - Data Loading Flow

Loading indicator overlay:

- Full-screen semi-transparent overlay with centered spinner
- isLoading flag in app state
- Show/hide based on isLoading state
- IMPORTANT: Add 100ms delay after populating data before dismissing loading indicator
  - This ensures UI has time to render

On cold start:

- Check if OneSignal onesignalId is not null
- If exists: show loading -> call fetchUserDataFromApi() -> populate UI -> delay 100ms -> hide loading
- If null: just show empty state (no loading indicator)

On login (LOGIN USER / SWITCH USER):

- Show loading indicator immediately
- Call OneSignal.login(externalUserId)
- Clear old user data (aliases, emails, sms, triggers)
- Wait for onUserStateChange callback
- onUserStateChange calls fetchUserDataFromApi()
- fetchUserDataFromApi() populates UI, delays 100ms, then hides loading

On logout:

- Show loading indicator
- Call OneSignal.logout()
- Clear local lists (aliases, emails, sms, triggers)
- Hide loading indicator

On onUserStateChange callback:

- Call fetchUserDataFromApi() to sync with server state
- Update UI with new data (aliases, tags, emails, sms)

Note: REST API key is NOT required for fetchUser endpoint.

### Prompt 3.2 - UserData Model

UserData:
aliases: map of string->string // From identity object (filter out external_id, onesignal_id)
tags: map of string->string // From properties.tags object
emails: list of strings // From subscriptions where type=="Email" -> token
smsNumbers: list of strings // From subscriptions where type=="SMS" -> token
externalId: nullable string // From identity.external_id

fromJson(json) -> UserData // Factory/parser method

---

## Phase 4: Info Tooltips

### Prompt 4.1 - Tooltip Content (Remote)

Tooltip content is fetched at runtime from the sdk-shared repo. Do NOT bundle a local copy.

URL:
https://raw.githubusercontent.com/OneSignal/sdk-shared/main/demo/tooltip_content.json

This file is maintained in the sdk-shared repo and shared across all platform demo apps.

### Prompt 4.2 - Tooltip Helper

Create TooltipHelper as a singleton:

- Holds a map of key -> TooltipData
- Fetches from the remote URL on init
- On failure (no network, etc.), leaves map empty (tooltips are non-critical)
- getTooltip(key) returns the tooltip data or null

TooltipData:
title: string
description: string
options: optional list of TooltipOption

TooltipOption:
name: string
description: string

### Prompt 4.3 - Tooltip UI Integration

For each section, pass an onInfoTap callback to SectionCard:

- SectionCard has an optional info icon that calls onInfoTap when tapped
- In the home screen, wire onInfoTap to show a TooltipDialog
- TooltipDialog displays title, description, and options (if present)

---

## Phase 5: Data Persistence & Initialization

### What IS Persisted (local storage)

PreferencesService stores:

- OneSignal App ID
- Consent required status
- Privacy consent status
- External user ID (for login state restoration)
- Location shared status
- In-app messaging paused status

### Initialization Flow

On app startup, state is restored in two layers:

1. Restore SDK state from cached preferences BEFORE initialize:
   - OneSignal.consentRequired(cachedConsentRequired)
   - OneSignal.consentGiven(cachedPrivacyConsent)
   - OneSignal.initialize(appId)
     Then AFTER initialize, restore remaining SDK state:
   - OneSignal.InAppMessages.paused(cachedPausedStatus)
   - OneSignal.Location.setShared(cachedLocationShared)
     This ensures consent settings are in place before the SDK initializes.

2. State management layer reads UI state from the SDK (not cached preferences):
   - consentRequired from cached prefs (no SDK getter)
   - privacyConsentGiven from cached prefs (no SDK getter)
   - inAppMessagesPaused from SDK getter (if available) or cached prefs
   - locationShared from SDK getter (if available) or cached prefs
   - externalUserId from OneSignal.User.getExternalId()
   - appId from PreferencesService (app-level config)

This two-layer approach ensures:

- The SDK is configured with the user's last preferences before anything else runs
- The UI reads the SDK's actual state as the source of truth
- The UI always reflects what the SDK reports, not stale cache values

### What is NOT Persisted (In-Memory Only)

App state holds in memory:

- triggersList:
  - Triggers are session-only
  - Cleared on app restart
  - Used for testing IAM trigger conditions

- aliasesList:
  - Populated from REST API on each session start
  - When user adds alias locally, added to list immediately (SDK syncs async)
  - Fetched fresh via fetchUserDataFromApi() on login/app start

- emailsList, smsNumbersList:
  - Populated from REST API on each session
  - Not cached locally
  - Fetched fresh via fetchUserDataFromApi()

- tagsList:
  - Can be read from SDK via getTags() (if available)
  - Also fetched from API for consistency

---

## Phase 6: Testing Values (Appium Compatibility)

All dialog input fields should be EMPTY by default.
The test automation framework (Appium) will enter these values:

- Login Dialog: External User Id = "test"
- Add Alias Dialog: Key = "Test", Value = "Value"
- Add Multiple Aliases Dialog: Key = "Test", Value = "Value" (first row; supports multiple rows)
- Add Email Dialog: Email = "test@onesignal.com"
- Add SMS Dialog: SMS = "123-456-5678"
- Add Tag Dialog: Key = "Test", Value = "Value"
- Add Multiple Tags Dialog: Key = "Test", Value = "Value" (first row; supports multiple rows)
- Add Trigger Dialog: Key = "trigger_key", Value = "trigger_value"
- Add Multiple Triggers Dialog: Key = "trigger_key", Value = "trigger_value" (first row; supports multiple rows)
- Outcome Dialog: Name = "test_outcome", Value = "1.5"
- Track Event Dialog: Name = "test_event", Properties = "{\"key\": \"value\"}"
- Custom Notification Dialog: Title = "Test Title", Body = "Test Body"

---

## Phase 7: Important Implementation Details

### Alias Management

Aliases are managed with a hybrid approach:

1. On app start/login: Fetched from REST API via fetchUserDataFromApi()
2. When user adds alias locally:
   - Call OneSignal.User.addAlias(label, id) - syncs to server async
   - Immediately add to local aliasesList (don't wait for API)
   - This ensures instant UI feedback while SDK syncs in background
3. On next app launch: Fresh data from API includes the synced alias

### Notification Permission

Notification permission is automatically requested when the home screen loads:

- Call promptPush() in the home screen's init/mount lifecycle
- This ensures prompt appears after user sees the app UI
- PROMPT PUSH button remains as fallback if user initially denied
- Button hidden once permission is granted
- Keep Push "Enabled" toggle disabled until permission is granted

---

## Phase 8: Architecture

### Prompt 8.1 - State Management

Use platform-idiomatic state management:

- A single state container at the root of the app
- Holds all UI state with public getters/selectors
- Exposes action methods that update state and notify the UI
- Receives OneSignalRepository via injection
- Receives PreferencesService via injection
- Initialize OneSignal SDK before rendering
- Fetch tooltips in the background (non-blocking)

### Prompt 8.2 - Reusable Widgets/Components

Create reusable UI components:

SectionCard:

- Card with title text and optional info icon button
- Content/children slot
- onInfoTap callback for tooltips
- Consistent padding and styling per styles.md

ToggleRow:

- Label, optional description, toggle/switch control
- Row layout with content spaced to edges

ActionButton:

- PrimaryButton (filled) and DestructiveButton (outlined)
- Full-width buttons
- Styling per styles.md

ListWidgets:

- PairItem (key-value with optional delete icon button)
- SingleItem (single value with delete icon button)
- EmptyState (centered "No items" text)
- CollapsibleList (shows 5 items, expandable)
- PairList (simple list of key-value pairs)

LoadingOverlay:

- Full-screen overlay with centered spinner (styling per styles.md)
- Shown via isLoading state

Dialogs/Modals:

- All dialogs use full-width layout with consistent padding
- SingleInputDialog (one text field)
- PairInputDialog (key-value text fields on the same row, single pair)
- MultiPairInputDialog (dynamic rows with dividers between them, X icon to delete a row, full-width, batch submit)
- MultiSelectRemoveDialog (checkbox per item for batch remove)
- LoginDialog, OutcomeDialog, TrackEventDialog
- CustomNotificationDialog, TooltipDialog

### Prompt 8.3 - Reusable Multi-Pair Dialog

Tags, Aliases, and Triggers all share a reusable MultiPairInputDialog
for adding multiple key-value pairs at once.

Behavior:

- Dialog opens full-width with horizontal padding
- Starts with one empty key-value row (Key and Value fields side by side)
- "Add Row" button below the rows adds another empty row
- Dividers separate each row for visual clarity
- Each row shows an X (close icon) delete button on the right (hidden when only one row)
- "Add All" button is disabled until ALL key and value fields in every row are filled
- Validation runs on every text change and after row add/remove
- On "Add All" press, all rows are collected and submitted as a batch
- Batch operations use SDK bulk APIs (addAliases, addTags, addTriggers)

Used by:

- ADD MULTIPLE button (Aliases section) -> calls addAliases(pairs)
- ADD MULTIPLE button (Tags section) -> calls addTags(pairs)
- ADD MULTIPLE button (Triggers section) -> calls addTriggers(pairs)

### Prompt 8.4 - Reusable Remove Multi Dialog

Tags and Triggers share a reusable MultiSelectRemoveDialog
for selectively removing items from the current list.

Behavior:

- Accepts the current list of items as key-value pairs
- Renders one checkbox per item on the left with just the key as the label (not "key: value")
- User can check 0, 1, or more items
- "Remove (N)" button shows count of selected items, disabled when none selected
- On confirm, checked items' keys are collected as a list and passed to the callback

Used by:

- REMOVE SELECTED button (Tags section) -> calls removeSelectedTags(keys)
- REMOVE SELECTED button (Triggers section) -> calls removeSelectedTriggers(keys)

### Prompt 8.5 - Theme

All colors, spacing, typography, button styles, card styles, and component
specs are defined in the shared style reference:
https://raw.githubusercontent.com/OneSignal/sdk-shared/refs/heads/main/demo/styles.md

Implement theme constants/tokens that map the style reference values to
the platform's theming system. Define color and spacing constants for use
throughout the app.

### Prompt 8.6 - Log View (Appium-Ready)

Add collapsible log view at top of screen for debugging and Appium testing.

LogManager Features:

- Singleton with reactive notification mechanism for UI updates
- API: d(tag, message), i(), w(), e() for debug/info/warn/error levels
- Also prints to console/debugPrint for development

LogView Features:

- Refer to the Logs View section of the shared style reference for layout, colors, and typography
- Header sits above the list; 100dp height applies to the list area only
- Newest entries at the top (reverse order at render time)
- Trash icon only visible when entries exist

Appium Accessibility Labels/IDs:
| Label/ID | Description |
|---------------------------|----------------------------------|
| log*view_container | Main container |
| log_view_header | Tappable expand/collapse |
| log_view_count | Shows "(N)" log count |
| log_view_clear_button | Clear all logs |
| log_view_list | Scrollable list view |
| log_view_empty | "No logs yet" state |
| log_entry*{N} | Each log row (N=index) |
| log*entry*{N}_timestamp | Timestamp text |
| log_entry_{N}_level | D/I/W/E indicator |
| log_entry_{N}\_message | Log message content |

Use the platform's accessibility/test ID mechanism (Semantics label, testID, data-testid, etc.).

### Prompt 8.7 - Feedback Messages (SnackBar / Toast)

All user actions should display brief feedback messages:

- Login: "Logged in as: {userId}"
- Logout: "Logged out"
- Add alias: "Alias added: {label}"
- Add multiple aliases: "{count} alias(es) added"
- Similar patterns for tags, triggers, emails, SMS
- Notifications: "Notification sent: {type}" or "Failed to send notification"
- In-App Messages: "Sent In-App Message: {type}"
- Outcomes: "Outcome sent: {name}"
- Events: "Event tracked: {name}"
- Location: "Location sharing enabled/disabled"
- Push: "Push enabled/disabled"

Implementation:

- Use the platform's standard transient message component (SnackBar, Toast, IonToast, etc.)
- Show at a consistent position (bottom recommended)
- Clear previous message before showing a new one
- All feedback messages are also logged via LogManager.i()

---

## Configuration

### App ID Placeholder

Default app id: 77e32082-ea27-42e3-a898-c72e141824ef

Note: REST API key is NOT required for the fetchUser endpoint.

### Package / Bundle Identifier

The identifiers MUST be `com.onesignal.example` to work with the existing:

- `google-services.json` (Firebase configuration)
- `agconnect-services.json` (Huawei configuration)

If you change the identifier, you must also update these files with your own Firebase/Huawei project configuration.

---

## Summary

This app demonstrates all OneSignal SDK features:

- User management (login/logout, aliases with batch add)
- Push notifications (subscription, sending with images, auto-permission prompt)
- Email and SMS subscriptions
- Tags for segmentation (batch add/remove support)
- Triggers for in-app message targeting (in-memory only, batch operations)
- Outcomes for conversion tracking
- Event tracking with JSON properties validation
- In-app messages (display testing with type-specific icons)
- Location sharing
- Privacy consent management

The app is designed to be:

1. **Testable** - Empty dialogs with accessibility labels for Appium automation
2. **Comprehensive** - All SDK features demonstrated
3. **Clean** - Repository pattern with platform-idiomatic state management
4. **Cross-platform** - Single codebase for Android and iOS
5. **Session-based triggers** - Triggers stored in memory only, cleared on restart
6. **Responsive UI** - Loading indicator with delay to ensure UI populates before dismissing
7. **Performant** - Tooltip JSON loaded asynchronously, minimal rebuilds
8. **Modern UI** - Consistent theming with reusable components
9. **Batch Operations** - Add multiple items at once, select and remove multiple items
