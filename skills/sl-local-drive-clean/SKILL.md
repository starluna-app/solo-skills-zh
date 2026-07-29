---
name: sl-local-drive-clean
description: Intelligently identifies and cleans up large, redundant developer files and system data. Use when the user reports low disk space, mentions large "System Data", or wants to prune old simulators, iOS runtimes, Xcode build caches, package manager caches, and test artifacts. Provides interactive choice for deleting specific emulators and images.
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
6. **Package Manager Caches**: `~/.npm`, `~/.cocoapods`, `~/.gradle`, `~/.pub-cache` (Flutter/Dart)
7. **Python Virtual Envs**: Search for `.venv` or `venv` directories in projects
8. **Homebrew**: `brew cleanup -n` (Old versions and downloads)
9. **macOS Trash**: `~/.Trash` (Deleted runtimes and builds remain here until emptied)

## Step 2: Interactive Cleanup

When cleaning runtimes or simulators, ALWAYS use `ask_question` with a choice list to ensure safe deletion.

### For Simulators and Runtimes:

1. List available items first.
2. Present a multi-select choice to the user.
3. Only delete the selected items.

Example workflow for emulators:
1. Run `xcrun simctl list devices`.
2. Parse the output to identify active and shutdown devices.
3. Call `ask_question` with options like "Delete all Shutdown", "Delete specific version", etc.

## Standard Cleanup Commands

- **XCTestDevices**: `rm -rf ~/Library/Developer/XCTestDevices/*`
- **DerivedData**: `rm -rf ~/Library/Developer/Xcode/DerivedData/*`
- **iOS DeviceSupport**: `rm -rf ~/Library/Developer/Xcode/iOS\ DeviceSupport/*`
- **Homebrew**: `brew cleanup --prune=all || true` (Use `|| true` to prevent lock error aborts)
- **Flutter Pub Cache**: `rm -rf ~/.pub-cache ~/.config/flutter`
- **Python Virtual Envs**: `find . -maxdepth 3 -type d \( -name ".venv" -o -name "venv" \) -exec rm -rf {} +`
- **Unavailable Simulators**: `xcrun simctl delete unavailable`
- **Specific Runtime**: Pass single UUID per call or loop:
  `for uuid in <UUID1> <UUID2>; do xcrun simctl runtime delete "$uuid"; done`

> **Note on macOS Finder `.DS_Store`:** When deleting large nested directories (like Python virtual environments), Finder may recreate `.DS_Store` mid-deletion causing `Directory not empty` errors. Retry the command if this occurs.

