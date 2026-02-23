# Demo App Style Reference

Design spec for OneSignal SDK demo/sample apps. Values use platform-independent units (px). Adapt to the equivalent on each platform (dp on Android, pt on iOS, px in CSS, etc.).

## Colors

| Token             | Value               | Usage                          |
| ----------------- | ------------------- | ------------------------------ |
| oneSignalRed      | `#E54B4D`           | Header, primary buttons        |
| oneSignalGreen    | `#34A853`           | Logged-in / success status     |
| lightBackground   | `#F8F9FA`           | Page background                |
| cardBackground    | `#FFFFFF`           | Card surfaces                  |
| dividerColor      | `#E8EAED`           | Dividers                       |
| warningBackground | `#FFF8E1`           | Guidance / warning banner card |
| overlayScrim      | `rgba(0,0,0,0.26)`  | Loading overlay background     |
| sectionHeaderText | `#616161`           | Section header label and icon  |
| subtleText        | `#757575`           | Toggle descriptions, secondary text |
| logBackground     | `#1A1B1E`           | Logs view background               |

## Spacing

| Token                       | Value                          | Usage                                                       |
| --------------------------- | ------------------------------ | ----------------------------------------------------------- |
| gap                         | 8                              | Gap between elements inside a section                       |
| Section spacing             | 24 vertical, 16 horizontal     | Gap between sections. CSS platforms can use `gap: 24` on the list container instead of per-section padding |

## Cards

| Property        | Value                      |
| --------------- | -------------------------- |
| Background      | cardBackground (`#FFFFFF`) |
| Corner radius   | 12                         |
| Inner padding   | 12 horizontal, 12 vertical |
| Outer margin    | 0 (parent section handles spacing) |

### Card Shadow

Use the platform's standard light shadow (elevation 1 on Android/Flutter, a subtle `box-shadow` in CSS). No header/toolbar shadow. Also applies to the warning/guidance banner.

For CSS-based platforms, the equivalent shadow layers are:

| Layer    | Offset  | Blur | Spread | Color              |
| -------- | ------- | ---- | ------ | ------------------ |
| Umbra    | 0, 2    | 1    | -1     | `rgba(0,0,0,0.20)` |
| Penumbra | 0, 1    | 1    | 0      | `rgba(0,0,0,0.14)` |
| Ambient  | 0, 1    | 3    | 0      | `rgba(0,0,0,0.12)` |

## Typography

All sizes in sp/px. Use the platform's default system font unless otherwise noted.

### Text Scale Reference

| Name        | Size | Weight     | Usage                                        |
| ----------- | ---- | ---------- | -------------------------------------------- |
| bodyLarge   | 16   | normal/400 | Radio button labels (dialogs)                |
| bodyMedium  | 14   | normal/400 | Card row labels, toggle labels, unstacked list items, list empty state |
| bodyMedium  | 14   | medium/500 | Stacked list key, collapsible "N more" link  |
| bodySmall   | 12   | normal/400 | Card row values, toggle descriptions, section headers, stacked list value |

### Header Bar

- Logo height: 22
- Title text ("Sample App"): bodyMedium (14, normal/400), color white
- Centered

### Section Headers

- Size: bodySmall (12)
- Weight: bold
- Color: sectionHeaderText
- Letter spacing: 0.5
- Transform: uppercase
- Bottom padding: 8 (gap)
- Info icon: 18, color sectionHeaderText

### Card Row Labels

- Style: bodyMedium (14) (e.g., "App ID", "Push ID", "Status")

### Card Row Values

- Style: bodySmall (12)
- Font: monospace

### Toggle Row

- Label: bodyMedium (14)
- Description: bodySmall (12), color subtleText

### Radio Button Labels (Dialogs)

- Style: bodyLarge (16)

## Buttons

### Primary Button

- Full width
- Background: oneSignalRed
- Text color: white
- Height: 48
- Corner radius: 8

### Destructive / Outlined Button

- Full width
- Background: transparent
- Border + text color: oneSignalRed
- Height: 48
- Corner radius: 8

## Toggle / Switch

- Use the platform's native switch component
- Reduce extra tap-target padding where the platform allows

## Dialogs

- Horizontal inset from screen edge: 16
- Vertical inset: 24

## Dividers

- Use the platform's default divider / separator (1px line, subtle grey)

## Text Input Fields

- Corner radius: 8
- Content padding: 12 horizontal, 14 vertical

## Warning Banner

- Uses card styling (shadow, corner radius) with warningBackground color
- Text: bodySmall (12)
- Link: bodySmall (12), color oneSignalRed, weight semibold/600, no underline, no gap above

## List Items

Items displayed inside cards (e.g. tags, aliases, emails, SMS numbers). The list sits inside a card with standard card padding (12 horizontal, 12 vertical).

| Property       | Value                                                          |
| -------------- | -------------------------------------------------------------- |
| Item padding   | 4 vertical, 4 horizontal                                      |
| Divider        | height 1 between items                                        |
| Delete icon    | close/X, size 18, color sectionHeaderText (`#616161`), trailing |

### Stacked (key-value pairs)

Two lines vertically stacked. Used for paired data like tags or labeled aliases.

| Line  | Style                                  |
| ----- | -------------------------------------- |
| Key   | bodyMedium (14), weight medium/500     |
| Value | bodySmall (12), color subtleText       |

### Unstacked (single value)

Single line. Used for simple string lists like emails or SMS numbers.

| Line | Style              |
| ---- | ------------------ |
| Text | bodyMedium (14)    |

### Empty State

- Text: bodyMedium (14), color subtleText
- Centered, 12 vertical padding

### Collapsible Overflow

When a list exceeds `maxVisible` items (default 5), the overflow is hidden behind a "N more" link.

- Text: bodyMedium (14), color oneSignalRed, weight medium/500
- Padding: 4 vertical

## Scrollable List

- Bottom padding: 24

## Logs View

Sticky dark panel at the top of the scrollable content, always visible. Full width with no horizontal margin, no rounded corners, and no gap between it and the header bar.

### Layout

| Property        | Value                          |
| --------------- | ------------------------------ |
| Background      | logBackground (`#1A1B1E`)      |
| Corner radius   | 0                              |
| Height          | 100 (fixed, content scrolls)   |
| Margin          | 0 (touches header bar on top, content below) |
| Default state   | Expanded                       |

### Header Row

| Property        | Value                          |
| --------------- | ------------------------------ |
| Padding         | 16 horizontal, 12 vertical     |
| Title text      | "LOGS", bold, white            |
| Count text      | "(N)" where N = log count, grey 400 |
| Clear icon      | Trash/delete, size 18, grey 400 |
| Expand/collapse | Chevron icon, size 20, grey 400 |
| Spacing         | 8 between title and count      |

Tapping the header row toggles expand/collapse.

### Log Entry Row

| Property        | Value                          |
| --------------- | ------------------------------ |
| Vertical padding | 1                             |
| List padding    | 12 horizontal                  |

Each row contains three inline elements separated by 4px gaps:

| Element   | Size | Font      | Color            | Format              |
| --------- | ---- | --------- | ---------------- | ------------------- |
| Timestamp | 11   | monospace | grey 500         | `HH:mm:ss`         |
| Level     | 11   | monospace, bold | level color (see below) | Single letter: D, I, W, E |
| Message   | 11   | monospace | white 70% opacity | `tag: message`     |

### Log Level Colors

| Level | Label | Color   |
| ----- | ----- | ------- |
| Debug | D     | Blue    |
| Info  | I     | Green   |
| Warn  | W     | Amber   |
| Error | E     | Red     |

### Behavior

- Auto-scrolls to the newest entry when a log is added
- Empty state: centered "No logs yet" text, grey 500
- Horizontal scroll on the entire list (not per row), no text truncation

## Loading Overlay

- Full-screen scrim over content
- Background: overlayScrim (`rgba(0,0,0,0.26)`)
- Centered spinner using the platform's native progress indicator
