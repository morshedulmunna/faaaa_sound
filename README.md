# Faaaa Sound

A VS Code extension that plays your `faaah.mp3` sound when tests fail.

By default, it triggers on **failed test cases only**.
You can optionally enable sound on editor errors.

## What It Does

- Plays `faaah.mp3` when a test command fails.
- Supports test failure detection from:
  - Task failures
  - Integrated terminal commands (for example `npm test`, `npm run test`, `jest`, `vitest`)
- Optional mode to read the latest error message before the final sound.
- Falls back to speech (`Faaaaaaah`) if file playback is unavailable.

## Default Behavior

- `faaaaSound.onTestFailure`: `true`
- `faaaaSound.onErrors`: `false`

So out of the box, sound plays on test failure, not on general code errors.

## Extension Settings

- `faaaaSound.enabled`: Enable/disable the extension.
- `faaaaSound.onTestFailure`: Trigger on failed tests.
- `faaaaSound.onErrors`: Trigger on new diagnostics with error severity.
- `faaaaSound.readErrorMessage`: Read latest error text before playing sound.
- `faaaaSound.soundFilePath`: Audio file path. Supports `${extensionPath}` and `${workspaceFolder}`.
- `faaaaSound.cooldownMs`: Minimum time between triggers (milliseconds).
- `faaaaSound.customPhrase`: Fallback speech phrase if audio file playback fails.

## Commands

- `Faaaa Sound: Play Now` (`faaaaSound.playNow`)
- `Faaaa Sound: Self Test` (`faaaaSound.selfTest`)
- `Faaaa Sound: Show Logs` (`faaaaSound.showLogs`)

## Local Development

1. Install dependencies:
```bash
npm install
```

2. Compile:
```bash
npm run compile
```

3. Run extension in dev host:
- Press `F5` in VS Code.

4. Test behavior:
- Run `Faaaa Sound: Self Test` from Command Palette.
- Run a failing test command in integrated terminal, for example:
```bash
npm run test
```

## Package and Install

```bash
npm run compile
npx vsce package
code --install-extension faaaa-sound-<version>.vsix --force
```

Reload VS Code after install.

## Publish to Marketplace

If a version already exists, bump version first:

```bash
npx vsce publish patch
```

Or:

```bash
npm version patch
npx vsce publish
```

## Platform Notes

- macOS: uses `afplay` for file playback.
- Linux: tries `ffplay`, then `mpg123`.
- Windows: uses PowerShell media playback.
- If audio playback fails, speech fallback is used.
- Terminal command detection depends on VS Code shell integration.
