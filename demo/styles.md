# Demo App Style Reference

Design spec for OneSignal SDK demo/sample apps. Values use platform-independent units (px). Adapt to the equivalent on each platform (dp on Android, pt on iOS, px in CSS, etc.). Token names use camelCase; convert to kebab-case (e.g. `os-primary`) for CSS/USS platforms.

## Colors

| Token               | Value                | Usage                               |
| ------------------- | -------------------- | ----------------------------------- |
| osPrimary           | `#E54B4D`            | Header, primary buttons             |
| osSuccess           | `#34A853`            | Logged-in / success status          |
| osGrey700           | `#616161`            | Section headers                     |
| osGrey600           | `#757575`            | Toggle descriptions, secondary text |
| osGrey500           | `#9E9E9E`            | Icons                               |
| osLightBackground   | `#F8F9FA`            | Page background                     |
| osCardBackground    | `#FFFFFF`            | Card surfaces                       |
| osCardBorder        | `rgba(0, 0, 0, 0.1)` | Card border                         |
| osDivider           | `#E8EAED`            | Dividers                            |
| osWarningBackground | `#FFF8E1`            | Guidance / warning banner card      |
| osBackdrop          | `rgba(0,0,0,0.54)`   | Dialog / overlay backdrop           |

## Spacing

| Token           | Value                      | Usage                                                                                                      |
| --------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------- |
| gap             | 8                          | Gap between elements inside a section                                                                      |
| Section spacing | 24 vertical, 16 horizontal | Gap between sections. CSS platforms can use `gap: 24` on the list container instead of per-section padding |

## Cards

| Property      | Value                                         |
| ------------- | --------------------------------------------- |
| Background    | osCardBackground (`#FFFFFF`)                  |
| Corner radius | 12                                            |
| Border        | osCardBorder (`2px solid rgba(0, 0, 0, 0.1)`) |
| Shadow        | none (elevation 0)                            |
| Inner padding | 12 horizontal, 12 vertical                    |
| Outer margin  | 0 (parent section handles spacing)            |

## Typography

All sizes in sp/px. Use the platform's default system font unless otherwise noted. Default text color is black unless a specific color is listed.

### Text Scale Reference

| Name       | Size | Weight     | Usage                                                                                    |
| ---------- | ---- | ---------- | ---------------------------------------------------------------------------------------- |
| bodyLarge  | 16   | normal/400 | Radio button labels (dialogs)                                                            |
| bodyMedium | 14   | normal/400 | Card row labels, toggle labels, unstacked list items, list empty state, stacked list key |
| bodySmall  | 12   | normal/400 | Card row values, toggle descriptions, section headers, stacked list value                |

### Header Bar

- Logo height: 22
- Title text ("Sample App"): bodyMedium (14, normal/400), color white
- Centered

### Section Headers

- Size: bodySmall (12)
- Weight: bold
- Color: osGrey700
- Letter spacing: 0.5
- Transform: uppercase
- Bottom padding: 8 (gap)
- Info icon: 18, color osGrey500

### Card Row Labels

- Style: bodyMedium (14) (e.g., "App ID", "Push ID", "Status")

### Card Row Values

- Style: bodySmall (12)
- Font: monospace (applies to ID values like App ID, Push Subscription ID, External ID, and status text)

### Toggle Row

- Label: bodyMedium (14)
- Description: bodySmall (12), color osGrey600

### Radio Button Labels (Dialogs)

- Style: bodyLarge (16)

## Buttons

### Primary Button

- Full width
- Background: osPrimary
- Text color: white
- Font weight: semibold/600
- Height: 48
- Corner radius: 8
- Leading icon (when present): size 18, 8 gap before label

### Outlined Button

Used for secondary and destructive actions. "Destructive" and "outlined" refer to the same visual style — there is only one non-primary button variant.

- Full width
- Background: transparent
- Border + text color: osPrimary
- Font weight: semibold/600
- Height: 48
- Corner radius: 8

## Toggle / Switch

- Use the platform's native switch component
- Reduce extra tap-target padding where the platform allows

## Dialogs

- Backdrop: osBackdrop (`rgba(0,0,0,0.54)`)
- Background: osCardBackground (`#FFFFFF`)
- Corner radius: 28
- Horizontal inset from screen edge: 16
- Vertical inset: 24
- Title: size 24, weight normal/400
- Action buttons (cancel, confirm, delete): size 14, weight medium/500, color osPrimary, padding 12 horizontal 8 vertical
- Action buttons disabled color: osGrey500
- Actions gap: 8
- Actions area padding: 24 left, 24 right, 24 bottom

## Dividers

- Use the platform's default divider / separator (1px line, subtle grey)

## Text Input Fields

Standalone bordered inputs used in dialogs.

- Corner radius: 8
- Content padding: 12 horizontal, 14 vertical
- Border: 1px solid osGrey700
- Focused border: 2px solid osPrimary (must not cause layout shift)
- Placeholder color: osGrey600

### Inline Input Row

Borderless label + input pairs displayed inside a card (e.g. Live Activity fields). The card provides the outer border; individual inputs have no border.

| Property        | Value                                |
| --------------- | ------------------------------------ |
| Layout          | Horizontal row (label left, input right) |
| Row spacing     | 4 vertical between rows              |
| Label style     | bodyMedium (14), color osGrey600     |
| Label min-width | 80                                   |
| Input style     | bodyMedium (14), default text color  |
| Input alignment | Right-aligned, flex fill             |
| Input border    | None                                 |

## Warning Banner

- Uses card styling with osWarningBackground color
- Text: bodySmall (12)
- Link: bodySmall (12), color osPrimary, weight semibold/600, no underline, no gap above

## List Items

Items displayed inside cards (e.g. tags, aliases, emails, SMS numbers). The list sits inside a card with standard card padding (12 horizontal, 12 vertical).

| Property     | Value                                       |
| ------------ | ------------------------------------------- |
| Item padding | 4 vertical, 4 horizontal                    |
| Divider      | height 1 between items                      |
| Delete icon  | close/X, size 18, color osPrimary, trailing |

### Stacked (key-value pairs)

Two lines vertically stacked. Used for paired data like tags or labeled aliases.

| Line  | Style                           |
| ----- | ------------------------------- |
| Key   | bodyMedium (14)                 |
| Value | bodySmall (12), color osGrey600 |

### Unstacked (single value)

Single line. Used for simple string lists like emails or SMS numbers.

| Line | Style           |
| ---- | --------------- |
| Text | bodyMedium (14) |

### Empty State

- Text: bodyMedium (14), color osGrey600
- Centered, 12 vertical padding

### Collapsible Overflow

When a list exceeds `maxVisible` items (default 5), the overflow is hidden behind a "N more" link.

- Text: bodyMedium (14), color osPrimary, weight medium/500
- Padding: 4 vertical

## Scrollable List

- Bottom padding: 24

## Loading Overlay

- Full-screen scrim over content
- Background: osBackdrop (`rgba(0,0,0,0.54)`)
- Centered spinner using the platform's native progress indicator
