## Visual Comparison & Adjustment

### Overview

```
Two Android emulators should be running side by side:
  1. Reference emulator — has the existing native OneSignal demo app installed
  2. SDK emulator — running the new SDK demo app from examples/demo/

The goal is to visually compare the SDK app against the reference app
section by section, then fix any inconsistencies in layout, spacing, colors,
section order, typography, dialog flows, or overall look and feel.
```

### Identify the emulators

```
Run `adb devices` to list connected emulators. You should see two entries.

Identify which emulator is the reference by checking for the native demo package:
  adb -s <emulator-id> shell pm list packages | grep -i onesignal

The emulator that returns `package:com.onesignal.sdktest` is the reference.
The other emulator is the SDK demo.

Assign them to variables for the steps below:

  REF=<emulator-with-com.onesignal.sdktest>
  SDK=<emulator-with-com.onesignal.sdkdemo>

(Replace with the actual emulator names from `adb devices`.)
```

### Launch both apps

```
If the reference app is not already running, launch it:
  adb -s $REF shell am start -n com.onesignal.sdktest/.ui.main.MainActivity

If the SDK demo app is not already running, launch it on the other emulator:
  cd examples/demo && run the app on $SDK

Before capturing screenshots, dismiss any in-app messages showing on
either emulator. Tap the X or click-through button on each IAM until
both apps show their main UI with no overlays.

Then pause in-app messages on both emulators so new IAMs don't
interrupt the comparison. Scroll to the "In-App Messaging" section
on each emulator and toggle "Pause In-App Messages" on.
```

### Capture and compare screenshots

```
Create output directories:
  mkdir -p /tmp/onesignal_reference /tmp/onesignal_sdk

Layout note: Both apps have a sticky LOGS section pinned at the top.
On both emulators the scrollable content area starts at roughly y=800.
When calculating swipe distances or tap targets, account for this offset.
The screen resolution is 1344x2992 on both emulators, giving a visible
scrollable viewport of about 2200px below the LOGS section.

Use uiautomator to find exact element positions before scrolling or tapping:
  adb -s $REF shell uiautomator dump /sdcard/ui.xml && adb -s $REF pull /sdcard/ui.xml /tmp/onesignal_reference/ui.xml
  adb -s $SDK shell uiautomator dump /sdcard/ui.xml && adb -s $SDK pull /sdcard/ui.xml /tmp/onesignal_sdk/ui.xml

Parse bounds to locate section headers and buttons:
  python3 -c "
  import xml.etree.ElementTree as ET
  tree = ET.parse('/tmp/onesignal_sdk/ui.xml')
  for node in tree.iter():
      d = node.get('content-desc','')
      b = node.get('bounds','')
      if d.strip():
          print(d.split(chr(10))[0][:50], b)
  "

To scroll a specific section header into view, dump the UI hierarchy,
find the nearest visible element, and compute the swipe delta needed
to bring the target section just below the LOGS area (y~800). For example,
if the TAGS header is currently at y=2400 and you want it at y=850:
  delta = 2400 - 850 = 1550
  adb -s $SDK shell input swipe 672 2000 672 450
  (swipe from y=2000 up by ~1550px to y=450)

After scrolling, re-dump the UI hierarchy to confirm the section is now
visible and get updated coordinates before tapping any buttons.

Capture matching screenshots at each scroll position:
  adb -s $REF shell screencap -p /sdcard/ref_01.png && adb -s $REF pull /sdcard/ref_01.png /tmp/onesignal_reference/ref_01.png
  adb -s $SDK shell screencap -p /sdcard/sdk_01.png && adb -s $SDK pull /sdcard/sdk_01.png /tmp/onesignal_sdk/sdk_01.png

Scroll section by section, aligning both emulators so the same section
header sits just below the LOGS area on each, then capture and compare.
Repeat until you have covered all sections from top to bottom.

Compare each pair of screenshots side by side. Look for differences in:
  - Section order and grouping
  - Card spacing and padding
  - Button styles, sizes, and colors
  - Typography (font size, weight, color)
  - Toggle/switch alignment
  - List item layout (key-value pairs, delete icons)
  - Empty state text
  - Logs section styling (background colors, text colors, header style)
    must match the reference app screenshots
```

### Compare dialogs (ask before proceeding)

```
Ask the user: "The main UI comparison is complete. Would you like to also compare key dialogs?"

If yes, for each dialog below, tap the corresponding button on both emulators,
capture and compare the screenshots, then dismiss before moving on.

To tap an element, compute the center of its bounds from the UI dump:
  adb -s $SDK shell input tap <centerX> <centerY>

To type into a focused field:
  adb -s $SDK shell input text "test"

Dialogs to compare:
  - Add Alias (single pair input)
  - Add Multiple Aliases/Tags (dynamic rows with add/remove)
  - Remove Selected Tags (checkbox multi-select)
  - Login User
  - Send Outcome (radio options)
  - Track Event (with JSON properties field)
  - Custom Notification (title + body)

For each dialog, compare field layout, button placement, spacing,
and validation behavior. Dismiss the dialog on both before moving on.
```

### Fix inconsistencies

```
After comparing, update the SDK demo source code in examples/demo/lib/
to fix any visual differences. Common things to adjust:

  - Padding/margin values in section widgets
  - Font sizes or weights in theme.dart or individual sections
  - Button colors or styles in action_button.dart
  - Card elevation or border radius in theme.dart
  - Section ordering in home_screen.dart
  - Dialog field layout in dialogs.dart

After each fix, hot reload by pressing 'r' in the user's active SDK
terminal (check open terminals for a running build process) and
re-capture the SDK screenshot to verify the change matches the reference.
```
