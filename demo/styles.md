# Demo App Style Reference

Design spec for OneSignal SDK demo/sample apps. Values use platform-independent units (px). Adapt to the equivalent on each platform (dp on Android, pt on iOS, px in CSS, etc.). Token names use camelCase; convert to kebab-case (e.g. `os-primary`) for CSS/USS platforms.

The native Android demo (`OneSignal-Android-SDK/examples/demo`) is the reference implementation. When this file and a demo disagree, this file wins.

## Colors

| Token               | Value                      | Usage                                                                         |
| ------------------- | -------------------------- | ----------------------------------------------------------------------------- |
| osPrimary           | `#E54B4D`                  | Header, primary buttons, switch track (on), links, dialog confirm actions     |
| osInk               | `#1F2328`                  | Default text: section headers, row labels, secondary button labels, snackbar  |
| osGrey700           | `#57606A`                  | Card row values, dialog cancel action, Field Group Caption                    |
| osGrey600           | `#6E7781`                  | Descriptions, list values, tappable icons (info, copy, remove, dropdown arrow) |
| osGrey500           | `#9AA2AC`                  | Placeholders, empty states, "—" for unset values, disabled text               |
| osLightBackground   | `#F7F7F7`                  | Page background                                                               |
| osCardBackground    | `#FFFFFF`                  | Card and dialog surfaces                                                      |
| osCardBorder        | `#E5E7EB`                  | Card border                                                                   |
| osControlBorder     | `#D5DAE1`                  | Secondary button border, text input border                                    |
| osDivider           | `#ECEEF2`                  | Dividers inside cards and lists                                               |
| osSwitchTrack       | `#D0D5DD`                  | Switch track (off)                                                            |
| osNeutralBackground | `#EEF0F3`                  | Disabled primary button fill                                                  |
| osWarningBackground | `#FFF9E6`                  | Guidance banner fill                                                          |
| osWarningBorder     | `#F2D68A`                  | Guidance banner border                                                        |
| osWarningIcon       | `#B7791F`                  | Guidance banner icon                                                          |
| osWarningText       | `#6B4A12`                  | Guidance banner text                                                          |
| osBackdrop          | `rgba(0,0,0,0.54)`         | Dialog / overlay backdrop                                                     |
| osLogBackground     | `#16181D`                  | Log View body                                                                 |
| osLogHeader         | `#1E2128`                  | Log View header row                                                           |
| osLogBorder         | `rgba(255,255,255,0.08)`   | Log View header/body divider                                                  |
| osLogBadge          | `#2B303B`                  | Log View count badge                                                          |
| osLogMuted          | `#7E8594`                  | Log View timestamps, count, icons, empty state                                |
| osLogText           | `#D8DEE9`                  | Log View entries and title                                                    |

Tappable icons use osGrey600, not osGrey500: osGrey500 is about 2.4:1 against the page, below the 3:1 minimum for controls.

## Spacing

| Token           | Value                      | Usage                                                                                                      |
| --------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------- |
| gap             | 8                          | Gap between elements inside a section                                                                      |
| Section spacing | 16 vertical, 16 horizontal | Gap between sections. CSS platforms can use `gap: 16` on the list container instead of per-section padding |
| Scroll top      | 16                         | Padding above the first section, inside the scroll view so it scrolls away                                 |
| Scroll bottom   | 16 + bottom safe area      | Space after the last element, inside the scroll view. The list draws behind the navigation bar / home indicator instead of stopping above it, and this inset lets the last item scroll clear |

## Cards

| Property      | Value                                         |
| ------------- | --------------------------------------------- |
| Background    | osCardBackground (`#FFFFFF`)                  |
| Corner radius | 12                                            |
| Border        | 1, osCardBorder                               |
| Shadow        | none (elevation 0)                            |
| Inner padding | 16 horizontal, 12 vertical                    |
| Outer margin  | 0 (parent section handles spacing)            |
| Row dividers  | osDivider, 1, with 8 above and below          |

## Typography

All sizes in sp/px. Default text color is osInk unless a specific color is listed.

### Font

Use **Google Sans Flex** for all text, including the Log View. It is open source (SIL Open Font License 1.1) and on Google Fonts.

- Bundle it with the demo rather than downloading at runtime (Android's downloadable fonts need Play Services, which the Huawei build lacks)
- Ship static instances of the weights the demo uses (normal/400, medium/500, semibold/600, bold/700), cut from the variable font at optical size 14 and subset to Latin. Variable-font weights need Android 8+, and the full variable file is about 4 MB; the four static files are about 350 KB
- Ship the OFL license text next to the font (e.g. `assets/licenses/GoogleSansFlex-OFL.txt`)
- Web platforms can load it from Google Fonts instead of bundling

### Text Scale Reference

| Name       | Size | Weight     | Usage                                                                        |
| ---------- | ---- | ---------- | ---------------------------------------------------------------------------- |
| headline   | 20   | semibold   | Dialog titles, Secondary Screen headline                                     |
| bodyLarge  | 16   | normal/400 | Header bar platform name, radio button labels (dialogs)                      |
| bodyMedium | 14   | normal/400 | Unstacked list items, dialog inputs                                          |
| rowLabel   | 13   | medium/500 | Card row labels, toggle labels, stacked list keys                            |
| button     | 13   | medium/500 | Button labels                                                                |
| bodySmall  | 12   | normal/400 | Card row values, toggle descriptions, list values, empty states, banner text |
| sectionHeader | 12 | bold/700  | Section headers                                                              |

### Header Bar

- Height: 48 (below the status bar); the brand color also fills the status bar area
- Flat (no shadow)
- Logo height: 22, then 8 gap
- Platform name ("Android", "iOS", ...): bodyLarge (16, normal/400), color white
- Centered

### Section Headers

- Style: sectionHeader (12, bold), color osInk
- Letter spacing: 0.8
- Transform: uppercase
- Height: 24, bottom padding 8 (gap)
- No accent bar or other decoration
- Info icon: 18, color osGrey600, glyph aligned with the card's right edge

### Card Rows

Label on the left, value on the right, at least 24 tall, 12 between them.

- Label: rowLabel (13, medium)
- Value: bodySmall (12), color osGrey700, platform font (not monospace), one line, ellipsized
- Unset value: "—" in osGrey500 (Appium reads it to tell "not set" apart from a real ID)
- Copy button on ID rows (App ID, External ID, Push ID), only when the value is set:
  - Icon: outlined copy, 14, color osGrey600, glyph aligned with the card's right padding
  - Only the icon copies; tapping the rest of the row does nothing
  - Touch target at least 48, without making the row taller (e.g. a 24 box that the platform extends)
  - Accessible as a button labeled `Copy {label}` (e.g. "Copy Push ID")
  - Feedback: see build.md Prompt 7.6 (no snackbar where the OS shows its own clipboard confirmation)

### Toggle Row

- Label: rowLabel (13, medium); 45% opacity when disabled
- Description: bodySmall (12), color osGrey600, 2 below the label; 55% opacity when disabled
- 12 between the text and the switch

### Radio Button Labels (Dialogs)

- Style: bodyLarge (16)

### Radio and Checkbox Rows (Dialogs)

- Control aligns with the dialog content edge: drop the platform's extra tap-target padding (as for switches)
- The whole row (control + label) is tappable instead
- Row vertical padding: 6; 12 between the control and its label

## Buttons

There are two button styles: **Primary** and **Secondary**. Secondary also covers removal and reset actions (CLEAR ALL, REMOVE TAGS, ...); there is no separate destructive style.

Both:

- Height: 40
- Corner radius: 10
- Label: button (13, medium/500), Title Case, centered, one line (see Button Grid for scaling). Small words stay lowercase and acronyms stay uppercase ("Login with Profile", "Update User JWT", "Add SMS", "HTML"). Section headers are the only uppercase text, which keeps them distinct from buttons
- Horizontal content padding: 12
- No shadow
- Pressed: darken by a 12% black overlay. On Android keep the ripple but make it black at 12% (the default ripple takes the label color and turns red buttons pink)

### Primary Button

The main action of a section, and the common choices in a send grid.

- Background: osPrimary
- Label: white
- Disabled: osNeutralBackground fill, osGrey500 label
- Leading icon (when present): size 18, 8 gap before label

### Secondary Button

Everything else: alternatives to the main action, less common send types, navigation (NEXT SCREEN), and removal or reset actions.

- Background: transparent (shows the page)
- Border: 1.5, osControlBorder
- Label: osInk
- Disabled: same border, osGrey500 label

### Button Grid

A section with two or more action buttons lays them out two per row instead of stacking them full width.

- Two equal columns, in the order the section lists the buttons (left, right)
- Column and row gap: same as the vertical gap between other section elements
- Odd count: the last button spans both columns
- Hidden buttons (e.g. REMOVE TAGS on an empty list) drop out and the rest reflow; never leave an empty cell
- Each button fills its cell. Labels stay on one line and scale down if needed (to 70% at most) instead of truncating
- Single-button sections (e.g. ADD EMAIL, SEND OUTCOME) stay full width
- Buttons carry no vertical margin of their own. Spacing comes from the layout: gap (8) between a card and its buttons and between button rows, then section spacing below the last row. A section that ends in buttons must leave the same space below as one that ends in a card

## Toggle / Switch

- Use the platform's native switch component
- On: track osPrimary, thumb white
- Off: track osSwitchTrack, thumb white, no outline. Disabled off: track at 50% opacity
- Reduce extra tap-target padding where the platform allows (e.g. Compose: disable `LocalMinimumInteractiveComponentEnforcement` around the switch, so the row sizes to the 32dp switch instead of a 48dp target)
- Toggle row vertical padding: 4

## Dialogs

- Position: prefer top-anchored (below the safe area plus the vertical inset) over centered, and keep the dialog fixed when the keyboard opens. A dialog that moves while open can leave Appium with stale element frames, so taps miss. Fall back to the platform default only if it can't be anchored
- Height: bounded by the screen. Content with no natural height (multi-line inputs, lists) gets a fixed or max height, with scrolling for overflow, so the action row stays on screen in landscape and above the keyboard
- Backdrop: osBackdrop (`rgba(0,0,0,0.54)`), covering the full display including the status and navigation bars. If the platform's dialog window stops at the system bars, use its window dim (e.g. Android `FLAG_DIM_BEHIND` at 0.54) instead of drawing the color inside the dialog
- Background: osCardBackground (`#FFFFFF`)
- Corner radius: 24
- Horizontal inset from screen edge: 16
- Vertical inset: 24
- Title: headline (20, semibold)
- Content padding: 20 left, 20 right, 20 top; 12 between the title and the first field
- Gap between fields: 12
- Action buttons: Title Case like screen buttons (Cancel, Login, Add All, Remove (N)), size 14, weight semibold/600, padding 12 horizontal 8 vertical. Confirm (Login, Add, Remove, ...) is osPrimary; Cancel is osGrey700 so the confirm action stands out
- Action buttons disabled color: osGrey500
- Actions gap: 8
- Actions area padding: 20 left, 20 right, 12 top, 12 bottom
- Clear (✕) icons inside dialogs: osGrey600

## Snackbar / Toast

- Background: osInk, text white
- Corner radius: 10

## Dividers

- 1px, osDivider

## Text Input Fields

Standalone bordered inputs used in dialogs.

- Corner radius: 10
- Content padding: 12 horizontal, 10 vertical (about 44 tall for a single line). Don't let the platform's default minimum height win; e.g. Compose's `OutlinedTextField` enforces 56, so build on `BasicTextField` with the outlined decoration
- Border: 1px solid osControlBorder
- Focused border: 2px solid osPrimary (must not cause layout shift)
- Label color: osGrey600
- Placeholder color: osGrey500

### Field Group Caption

A small caption above a group of side-by-side fields that form one value (e.g. Login With Profile's "Tag (optional)" over Key | Value). Carries "(optional)" when half-width field labels would cut it off.

- Style: bodySmall (12), color osGrey700
- Padding: 4 top, 4 bottom

### Inline Input Row

Borderless label + input pairs displayed inside a card (e.g. Live Activity fields). The card provides the outer border; individual inputs have no border.

| Property        | Value                                    |
| --------------- | ---------------------------------------- |
| Layout          | Horizontal row (label left, input right) |
| Row spacing     | 4 vertical between rows                  |
| Label style     | bodyMedium (14), color osGrey600         |
| Label min-width | 80                                       |
| Input style     | bodyMedium (14), default text color      |
| Input alignment | Right-aligned, flex fill                 |
| Input border    | None                                     |

## Guidance Banner

An amber callout in the App section, between the section header and the App card (not a card of its own). See build.md Prompt 2.1a for when it shows.

- Background: osWarningBackground; border 1, osWarningBorder; corner radius 12
- Padding: 12 horizontal, 10 vertical
- Leading info icon: 16, osWarningIcon, 10 before the text
- Text: bodySmall (12), osWarningText
- Link: bodySmall (12), semibold/600, osPrimary, no underline, 4 above
- 8 (gap) between the banner and the App card

## List Items

Items displayed inside cards (e.g. tags, aliases, emails, SMS numbers). The list sits inside a card with standard card padding.

| Property     | Value                                                                    |
| ------------ | ------------------------------------------------------------------------ |
| Item padding | 6 vertical                                                               |
| Divider      | osDivider, 1, between items                                              |
| Delete icon  | close/X, 16, color osGrey600, trailing, glyph aligned with the card edge |

### Stacked (key-value pairs)

Two lines vertically stacked. Used for paired data like tags or labeled aliases.

| Line  | Style                           |
| ----- | ------------------------------- |
| Key   | rowLabel (13, medium)           |
| Value | bodySmall (12), color osGrey600 |

### Unstacked (single value)

Single line. Used for simple string lists like emails or SMS numbers.

| Line | Style           |
| ---- | --------------- |
| Text | bodyMedium (14) |

### Empty State

- Text: bodySmall (12), color osGrey500
- Centered in a 20-tall slot (shared with Loading State)

### Collapsible Overflow

When a list exceeds `maxVisible` items (default 5), the overflow is hidden behind a "N more" link.

- Text: bodyMedium (14), color osPrimary, weight medium/500
- Padding: 4 vertical

## Scrollable List

- Bottom padding: 24

## Log View

Sticky panel below the header bar (see build.md Prompt 2.0). Dark, logcat-style, independent of light/dark app theme.

| Property          | Value                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------ |
| Body background   | osLogBackground                                                                                              |
| Header            | 28 tall, osLogHeader background, 16 left / 8 right padding, content vertically centered                      |
| Header title      | `LOGS`, osLogText, 11, semibold, 0.8 letter spacing                                                          |
| Count badge       | 6 after the title: entry count, osLogMuted, 10, semibold, on an osLogBadge pill (6 horizontal, 1 vertical padding) |
| Header icons      | osLogMuted; trash (filled) 14, then chevron 18, each centered in a 32-wide tap area                          |
| Divider           | 1, osLogBorder, between header and body (hidden with the body)                                               |
| Body height       | 100 (fixed; scrolls internally)                                                                              |
| Body padding      | 16 horizontal, 3 vertical                                                                                    |
| Entry text        | osLogText, app font (Google Sans Flex), 9, one entry per line; monospace made long IDs and titles wrap       |
| Timestamp         | osLogMuted, fixed-width (tabular) digits so every timestamp is the same width and messages line up. Use the font's `tnum` feature (Compose `fontFeatureSettings = "tnum"`, CSS `font-variant-numeric: tabular-nums`, SwiftUI `.monospacedDigit()`, Flutter `FontFeature.tabularFigures()`, RN `fontVariant: ['tabular-nums']`); where the text engine ignores OpenType features (Unity TextMeshPro), wrap the timestamp in `<mspace>` |
| Empty state       | `No logs yet`, same style as entries, osLogMuted                                                             |
| Entry line height | 1.5, applied to single-line entries too (e.g. Compose `LineHeightStyle.Trim.None`; the default trim drops it). Seven entries fill the 100 body |
| Stacking          | Above page content, below the header bar                                                                     |

## Loading State

Inline placeholder shown inside a list card while remote data is being fetched (e.g. aliases, tags, emails, SMS after login or cold start). Occupies the same slot as the empty-state message, so the layout does not shift when data arrives.

- Container: same slot as Empty State (centered, 20 tall)
- Spinner: platform's native small progress indicator, 18, color osPrimary
- No accompanying text label (the spinner alone communicates intent; the surrounding section title provides context)

Do **not** use a full-screen blocking overlay for these fetches — non-loading sections should remain interactive.
