import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

const CONFIG_KEY = 'faaaaSound';
let lastTriggerAt = 0;
let lastErrorCount = 0;
let extensionPath = process.cwd();
let output: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext): void {
  output = vscode.window.createOutputChannel('Faaaa Sound');
  extensionPath = context.extensionPath;
  initializeErrorCount();
  log(`Activated. extensionPath=${extensionPath}`);

  context.subscriptions.push(
    output,
    vscode.commands.registerCommand('faaaaSound.playNow', async () => {
      log('Manual command received: playNow');
      await triggerFaaaa('Manual trigger from command.');
    }),
    vscode.commands.registerCommand('faaaaSound.selfTest', async () => {
      const played = await playConfiguredSound();
      log(`Self test run. playedFile=${played}`);
      if (!played) {
        await speak('Faaaaaaah');
      }
      void vscode.window.showInformationMessage(`Faaaa Sound self-test: ${played ? 'audio file played' : 'fallback speech used'}.`);
    }),
    vscode.commands.registerCommand('faaaaSound.showLogs', () => {
      output.show(true);
    })
  );

  const testTaskListener = vscode.tasks.onDidEndTaskProcess(async (event) => {
    if (!config().get<boolean>('enabled', true)) {
      return;
    }
    if (!config().get<boolean>('onTestFailure', true)) {
      return;
    }

    if (event.exitCode !== 0 && isLikelyTestTask(event.execution.task)) {
      log(`Failed task detected: name=${event.execution.task.name} exitCode=${event.exitCode}`);
      await triggerFaaaa(`Detected failing test task (${event.execution.task.name}).`);
    }
  });

  const windowAny = vscode.window as unknown as {
    onDidEndTerminalShellExecution?: (
      listener: (event: { execution: { commandLine: { value: string } }; exitCode: number | undefined }) => void | Thenable<void>
    ) => vscode.Disposable;
  };

  const terminalExecutionListener = windowAny.onDidEndTerminalShellExecution
    ? windowAny.onDidEndTerminalShellExecution(async (event) => {
        if (!config().get<boolean>('enabled', true)) {
          return;
        }
        if (!config().get<boolean>('onTestFailure', true)) {
          return;
        }

        const commandLine = event.execution.commandLine.value;
        const failed = event.exitCode !== 0 && event.exitCode !== undefined;
        if (failed && isLikelyTestCommand(commandLine)) {
          log(`Failed terminal command detected: command=${commandLine} exitCode=${event.exitCode}`);
          await triggerFaaaa(`Detected failing terminal test command (${commandLine}).`);
        }
      })
    : undefined;

  if (!terminalExecutionListener) {
    log('Terminal shell execution API unavailable in this VS Code version; only task/diagnostic triggers are active.');
  }

  const diagnosticsListener = vscode.languages.onDidChangeDiagnostics(async () => {
    if (!config().get<boolean>('enabled', true)) {
      return;
    }
    if (!config().get<boolean>('onErrors', false)) {
      return;
    }

    const latestError = getLatestErrorDiagnostic();
    const totalErrors = countTotalErrors();
    const hasNewError = totalErrors > lastErrorCount;

    lastErrorCount = totalErrors;

    if (!hasNewError || !latestError) {
      return;
    }

    log(`Diagnostic error detected: ${sanitizeSpeech(latestError.message)}`);
    await triggerFaaaa('New error diagnostic detected.', latestError.message);
  });

  context.subscriptions.push(testTaskListener, diagnosticsListener);
  if (terminalExecutionListener) {
    context.subscriptions.push(terminalExecutionListener);
  }
}

export function deactivate(): void {
  // No resources requiring explicit disposal here.
}

function config(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration(CONFIG_KEY);
}

function initializeErrorCount(): void {
  lastErrorCount = countTotalErrors();
}

function countTotalErrors(): number {
  return vscode.languages
    .getDiagnostics()
    .reduce((count, [, diagnostics]) => count + diagnostics.filter((d) => d.severity === vscode.DiagnosticSeverity.Error).length, 0);
}

function getLatestErrorDiagnostic(): vscode.Diagnostic | undefined {
  const allDiagnostics = vscode.languages.getDiagnostics();
  for (let i = allDiagnostics.length - 1; i >= 0; i -= 1) {
    const [, diagnostics] = allDiagnostics[i];
    for (let j = diagnostics.length - 1; j >= 0; j -= 1) {
      if (diagnostics[j].severity === vscode.DiagnosticSeverity.Error) {
        return diagnostics[j];
      }
    }
  }
  return undefined;
}

async function triggerFaaaa(reason: string, errorMessage?: string): Promise<void> {
  log(`Trigger requested: reason=${reason}`);
  const now = Date.now();
  const cooldownMs = Math.max(0, config().get<number>('cooldownMs', 2500));
  if (now - lastTriggerAt < cooldownMs) {
    log(`Skipped by cooldown: cooldownMs=${cooldownMs}`);
    return;
  }
  lastTriggerAt = now;

  const phrase = sanitizeSpeech(config().get<string>('customPhrase', 'Faaaaaaah'));
  const shouldReadError = config().get<boolean>('readErrorMessage', false);

  if (shouldReadError && errorMessage) {
    log('Reading error message before sound.');
    await speak(sanitizeSpeech(errorMessage));
  }

  const played = await playConfiguredSound();
  log(`Audio play attempt finished. played=${played}`);
  if (!played) {
    log('Falling back to speech phrase.');
    await speak(phrase);
  }

  vscode.window.setStatusBarMessage(`Faaaa Sound: ${reason}`, 3000);
}

function sanitizeSpeech(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 300) || 'Faaaaaaah';
}

function speak(text: string): Promise<void> {
  return new Promise((resolve) => {
    const platform = process.platform;

    const candidates: Array<{ cmd: string; args: string[] }> =
      platform === 'darwin'
        ? [{ cmd: 'say', args: [text] }]
        : platform === 'win32'
          ? [{ cmd: 'PowerShell', args: ['-Command', `Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).Speak('${escapePowerShell(text)}')`] }]
          : [
              { cmd: 'spd-say', args: [text] },
              { cmd: 'espeak', args: [text] },
            ];

    runCandidate(candidates, 0, resolve);
  });
}

function playConfiguredSound(): Promise<boolean> {
  const configuredPath = config().get<string>('soundFilePath', '${extensionPath}/faaah.mp3');
  const resolvedPath = resolvePathTokens(configuredPath);
  log(`Configured sound path=${configuredPath} resolved=${resolvedPath ?? 'undefined'}`);

  if (!resolvedPath || !fs.existsSync(resolvedPath)) {
    log('Sound file missing; cannot play configured audio.');
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    const candidates = audioCandidatesForPlatform(resolvedPath);
    runCandidateWithResult(candidates, 0, resolve);
  });
}

function resolvePathTokens(inputPath: string): string | undefined {
  if (!inputPath) {
    return undefined;
  }

  let resolved = inputPath;
  resolved = resolved.replace(/\$\{extensionPath\}/g, extensionPath);

  const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (workspacePath) {
    resolved = resolved.replace(/\$\{workspaceFolder\}/g, workspacePath);
  }

  if (!path.isAbsolute(resolved)) {
    resolved = path.resolve(extensionPath, resolved);
  }

  return resolved;
}

function audioCandidatesForPlatform(filePath: string): Array<{ cmd: string; args: string[] }> {
  if (process.platform === 'darwin') {
    return [{ cmd: 'afplay', args: [filePath] }];
  }

  if (process.platform === 'win32') {
    const escaped = filePath.replace(/'/g, "''");
    return [
      {
        cmd: 'PowerShell',
        args: [
          '-Command',
          `$p=New-Object -ComObject WMPlayer.OCX;$m=$p.newMedia('${escaped}');$p.currentPlaylist.appendItem($m);$p.controls.play();Start-Sleep -Seconds 3`,
        ],
      },
    ];
  }

  return [
    { cmd: 'ffplay', args: ['-nodisp', '-autoexit', '-loglevel', 'quiet', filePath] },
    { cmd: 'mpg123', args: [filePath] },
  ];
}

function runCandidate(candidates: Array<{ cmd: string; args: string[] }>, index: number, done: () => void): void {
  if (index >= candidates.length) {
    // Fallback to a terminal bell if no speech tool is available.
    process.stdout.write('\u0007');
    done();
    return;
  }

  const child = spawn(candidates[index].cmd, candidates[index].args, {
    stdio: 'ignore',
  });

  child.on('error', () => {
    log(`Speech candidate failed to start: ${candidates[index].cmd}`);
    runCandidate(candidates, index + 1, done);
  });
  child.on('exit', (code) => {
    if (code === 0) {
      log(`Speech candidate succeeded: ${candidates[index].cmd}`);
      done();
      return;
    }
    log(`Speech candidate exited non-zero (${code ?? 'null'}): ${candidates[index].cmd}`);
    runCandidate(candidates, index + 1, done);
  });
}

function runCandidateWithResult(
  candidates: Array<{ cmd: string; args: string[] }>,
  index: number,
  done: (success: boolean) => void
): void {
  if (index >= candidates.length) {
    done(false);
    return;
  }

  const child = spawn(candidates[index].cmd, candidates[index].args, {
    stdio: 'ignore',
  });

  child.on('error', () => {
    log(`Audio candidate failed to start: ${candidates[index].cmd}`);
    runCandidateWithResult(candidates, index + 1, done);
  });
  child.on('exit', (code) => {
    if (code === 0) {
      log(`Audio candidate succeeded: ${candidates[index].cmd}`);
      done(true);
      return;
    }
    log(`Audio candidate exited non-zero (${code ?? 'null'}): ${candidates[index].cmd}`);
    runCandidateWithResult(candidates, index + 1, done);
  });
}

function escapePowerShell(text: string): string {
  return text.replace(/'/g, "''");
}

function isLikelyTestTask(task: vscode.Task): boolean {
  const combined = `${task.name} ${task.source} ${task.definition?.type ?? ''}`.toLowerCase();
  return /(test|jest|vitest|mocha|ava|pytest|phpunit|rspec|go test|cargo test|dotnet test)/.test(combined);
}

function isLikelyTestCommand(commandLine: string): boolean {
  const normalized = commandLine.toLowerCase();
  return /(\bnpm\s+(run\s+)?test\b|\bpnpm\s+(run\s+)?test\b|\byarn\s+test\b|\bjest\b|\bvitest\b|\bmocha\b|\bava\b|\bpytest\b|\bphpunit\b|\brspec\b|\bgo\s+test\b|\bcargo\s+test\b|\bdotnet\s+test\b)/.test(normalized);
}

function log(message: string): void {
  if (!output) {
    return;
  }
  output.appendLine(`[${new Date().toISOString()}] ${message}`);
}
