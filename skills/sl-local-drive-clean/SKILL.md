---
name: sl-local-drive-clean
description: Intelligently identifies and cleans up large, redundant developer files and system data. Use when the user reports low disk space, mentions large "System Data", or wants to prune old simulators, iOS runtimes, Xcode build caches, and test artifacts. Provides interactive choice for deleting specific emulators and images.
---

# Local Drive Clean

This skill helps reclaim massive amounts of disk space by targeting known "System Data" bloat in developer environments.

## Step 1: Scan for Bloat

Always start by checking these specific locations:

1. **XCTestDevices**: `~/Library/Developer/XCTestDevices` (Temporary parallel test clones - can grow to hundreds of GBs)
2. **DerivedData**: `~/Library/Developer/Xcode/DerivedData` (Build artifacts)
3. **DeviceSupport**: `~/Library/Developer/Xcode/iOS DeviceSupport` (Symbols for old physical devices)
4. **Simulator Runtimes**: `xcrun simctl runtime list` (Old iOS/watchOS/tvOS images)
5. **Simulators**: `xcrun simctl list devices` (Old or unavailable emulators)
6. **Package Manager Caches**: `~/.npm`, `~/.cocoapods`, `~/.gradle`
7. **Homebrew**: `brew cleanup -n` (Old versions and downloads)

## Step 2: Interactive Cleanup

When cleaning runtimes or simulators, ALWAYS use `ask_user` with a choice list to ensure safe deletion.

### For Simulators and Runtimes:

1. List available items first.
2. Present a multi-select choice to the user.
3. Only delete the selected items.

Example workflow for emulators:
1. Run `xcrun simctl list devices`.
2. Parse the output to identify active and shutdown devices.
3. Call `ask_user` with options like "Delete all Shutdown", "Delete specific version", etc.

## Standard Cleanup Commands

- **XCTestDevices**: `rm -rf ~/Library/Developer/XCTestDevices/*`
- **DerivedData**: `rm -rf ~/Library/Developer/Xcode/DerivedData/*`
- **iOS DeviceSupport**: `rm -rf ~/Library/Developer/Xcode/iOS\ DeviceSupport/*`
- **Homebrew**: `brew cleanup --prune=all`
- **Unavailable Simulators**: `xcrun simctl delete unavailable`
- **Specific Runtime**: `xcrun simctl runtime delete <UUID>`
