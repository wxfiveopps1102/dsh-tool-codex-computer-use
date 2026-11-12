import { execFile, spawn } from 'node:child_process';
import { access, mkdir, mkdtemp, open, readFile, rm, stat } from 'node:fs/promises';
import { homedir, tmpdir, version } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { constants } from 'node:fs';

const PLATFORM = process.platform;
export function platformLabel(p) { return p === 'darwin' ? 'macOS' : p === 'win32' ? 'Windows' : 'Linux'; }

export const name = 'tool-computer-use-codex';
export const inject = ['tools'];
// No Host runtime dependencies: configuration is accepted by apply() or env.
async function resolveCodexBin(config) {
  const profileDir = process.env.DSH_PROFILE_DIR;
  const explicit = config.codexBin ?? process.env.DSH_CODEX_BIN;
  const check = async entry => {
    const path = resolve(entry);
    if (!(await stat(path)).isFile()) throw new Error(`Codex entry is not a file: ${path}`);
    await access(path, path.endsWith('.js') ? constants.R_OK : constants.X_OK);
    return path;
  };
  // Explicit settings fail visibly rather than silently invoking another binary.
  if (explicit !== undefined) {
    if (typeof explicit !== 'string' || !explicit.trim()) throw new Error('codexBin / DSH_CODEX_BIN must be a non-empty file path.');
    return check(explicit);
  }
  for (const directory of (process.env.PATH ?? '').split(delimiter).filter(Boolean)) {
    try { return await check(join(directory, 'codex')); } catch {}
  }
  if (profileDir) {
    try { return await check(join(profileDir, 'node_modules/@openai/codex/bin/codex.js')); }
    catch (error) { throw new Error(`Cannot use the profile Codex entry: ${error.message}`); }
  }
  throw new Error('找不到 Codex 入口，请设置 codexBin / DSH_CODEX_BIN / PATH');
}

const codexVersionCache = new Map();
let latestCodexVersionCache;

function parseSemver(version) {
  if (typeof version !== 'string') return null;
  const match = version.match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/);
  if (!match) return null;
  const prerelease = match[4]?.split('.') ?? [];
  if (prerelease.some(part => /^0\d+$/.test(part))) return null;
  return { core: match.slice(1, 4).map(BigInt), prerelease };
}

function compareVersions(local, latest) {
  const a = parseSemver(local), b = parseSemver(latest);
  if (!a || !b) return null;
  const compare = (x, y) => x < y ? -1 : x > y ? 1 : 0;
  for (let i = 0; i < 3; i++) {
    const difference = compare(a.core[i], b.core[i]);
    if (difference) return difference;
  }
  if (!a.prerelease.length || !b.prerelease.length) {
    return compare(Number(!a.prerelease.length), Number(!b.prerelease.length));
  }
  for (let i = 0; i < Math.max(a.prerelease.length, b.prerelease.length); i++) {
    const x = a.prerelease[i], y = b.prerelease[i];
    if (x === undefined || y === undefined) return compare(a.prerelease.length, b.prerelease.length);
    const numericX = /^\d+$/.test(x), numericY = /^\d+$/.test(y);
    const difference = numericX && numericY ? compare(BigInt(x), BigInt(y))
      : numericX !== numericY ? (numericX ? -1 : 1) : compare(x, y);
    if (difference) return difference;
  }
  return 0;
}

async function fetchLatestCodexVersion() {
  if (!latestCodexVersionCache || Date.now() - latestCodexVersionCache.timestamp >= 6 * 60 * 60 * 1000) {
    const result = (async () => {
      try {
        const response = await fetch('https://registry.npmjs.org/@openai/codex/latest', { signal: AbortSignal.timeout(6000) });
        if (!response.ok) return null;
        const { version } = await response.json();
        return parseSemver(version) ? version : null;
      } catch {
        return null;
      }
    })();
    // Share in-flight requests and cache failures as well as successful results.
    latestCodexVersionCache = { timestamp: Date.now(), result };
  }
  return latestCodexVersionCache.result;
}

function onlineCheckEnabled(config) {
  return config.onlineCheck !== false && process.env.DSH_CODEX_OFFLINE !== '1';
}

async function checkCodexUpdate(codexVersion, online) {
  const latestCodexVersion = online ? await fetchLatestCodexVersion() : null;
  const comparison = compareVersions(codexVersion, latestCodexVersion);
  return {
    latestCodexVersion,
    upToDate: comparison === null ? null : comparison >= 0,
    warnings: comparison !== null && comparison < 0
      ? [`旧 CLI（${codexVersion}），npm 最新 ${latestCodexVersion}，建议升级。`] : [],
  };
}

function resolveNodeExec() {
  // Host processes fall back to Electron, re-executed with ELECTRON_RUN_AS_NODE=1.
  const nodeExec = process.env.DSH_NODE_EXECUTABLE ?? process.execPath;
  if (!nodeExec?.trim()) throw new Error('No Node runtime is available to run a .js Codex entry.');
  return nodeExec;
}

function probeCodexVersion(codexBin) {
  if (!codexVersionCache.has(codexBin)) {
    const js = codexBin.endsWith('.js');
    // Cache the promise as well as its result so concurrent calls share a probe.
    const probe = new Promise((resolveVersion, rejectVersion) => {
      const child = execFile(js ? resolveNodeExec() : codexBin, js ? [codexBin, '--version'] : ['--version'], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        timeout: 5000, killSignal: 'SIGKILL', maxBuffer: 64 * 1024,
      }, (error, stdout, stderr) => {
        if (error) return rejectVersion(error);
        const codexVersion = `${stdout}\n${stderr}`.match(/(?:^|\s)v?((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?)(?=\s|$)/)?.[1];
        if (!codexVersion) return rejectVersion(new Error('No semver found in --version output'));
        const prereleasePart = codexVersion.split('+')[0].split('-').slice(1).join('-');
        if (prereleasePart.split('.').some(part => /^0\d+$/.test(part))) {
          return rejectVersion(new Error('Invalid semver in --version output'));
        }
        resolveVersion({
          codexVersion,
          warnings: [],
        });
      });
      child.stdin.end();
    }).catch(error => ({
      codexVersion: 'unknown',
      warnings: [`Codex CLI 版本探测失败：${error.code ?? error.message}；继续执行。`],
    }));
    codexVersionCache.set(codexBin, probe);
  }
  return codexVersionCache.get(codexBin);
}

const environmentCache = new Map();

async function inspectEnvironment(codexBin, config) {
  const online = onlineCheckEnabled(config);
  const cacheKey = JSON.stringify([codexBin, online]);
  const withUpdate = async result => {
    const environment = structuredClone(await result);
    const update = await checkCodexUpdate(environment.codexVersion, online);
    environment.latestCodexVersion = update.latestCodexVersion;
    environment.upToDate = update.upToDate;
    environment.warnings.push(...update.warnings);
    return environment;
  };
  const cached = environmentCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
    return withUpdate(cached.result);
  }
  const result = (async () => {
    const environment = {
      platform: PLATFORM, platformLabel: platformLabel(PLATFORM), osVersion: 'unknown',
      models: [], codexVersion: 'unknown', desktopAppVersion: 'unknown',
      authMode: 'unknown', planType: null, subscriptionActiveUntil: null, warnings: [],
    };
    try {
      const osVersion = version();
      if (typeof osVersion === 'string' && osVersion.trim()) environment.osVersion = osVersion;
    } catch {
      // OS metadata is optional and does not affect inspection warnings.
    }
    const readJson = args => new Promise((resolveJson, rejectJson) => {
      const js = codexBin.endsWith('.js');
      const child = execFile(js ? resolveNodeExec() : codexBin, js ? [codexBin, ...args] : args, {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        timeout: 15000, killSignal: 'SIGKILL', maxBuffer: 4 * 1024 * 1024,
      }, (error, stdout) => {
        if (error) return rejectJson(error);
        try { resolveJson(JSON.parse(stdout)); } catch (error) { rejectJson(error); }
      });
      child.stdin.end();
    });
    const readModels = async bundled => {
      const { models } = await readJson(['debug', 'models', ...(bundled ? ['--bundled'] : [])]);
      return models.map(model => ({
        slug: model.slug,
        displayName: model.displayName ?? model.display_name,
        efforts: (model.supportedReasoningEfforts ?? model.supported_reasoning_levels ?? []).map(level =>
          level.effort ?? level.reasoningEffort),
        serviceTiers: (model.serviceTiers ?? model.service_tiers ?? []).map(tier => tier.id),
      }));
    };
    try {
      environment.models = await readModels(!online);
      if (!online) environment.warnings.push('在线检查已关闭，模型使用离线目录（--bundled）。');
    } catch {
      if (online) {
        try {
          environment.models = await readModels(true);
          environment.warnings.push('Codex 在线模型查询失败，已回退至离线目录（--bundled）。');
        } catch {
          environment.warnings.push('Codex model inspection failed (online and --bundled).');
        }
      } else {
        environment.warnings.push('Codex model inspection failed (--bundled).');
      }
    }
    try {
      const doctor = await readJson(['doctor', '--json']);
      environment.codexVersion = doctor.codexVersion ?? 'unknown';
      const details = doctor.checks['desktop.app.version'].details;
      environment.desktopAppVersion = details.version ??
        Object.entries(details).find(([key]) => /version/i.test(key))?.[1] ?? 'unknown';
      environment.authMode = doctor.checks['auth.credentials'].details['stored auth mode'] ?? 'unknown';
    } catch {
      environment.warnings.push('Codex doctor inspection failed.');
    }
    try {
      const auth = JSON.parse(await readFile(join(process.env.CODEX_HOME ?? join(homedir(), '.codex'), 'auth.json'), 'utf8'));
      const payload = JSON.parse(Buffer.from(auth.tokens.id_token.split('.')[1], 'base64url').toString('utf8'));
      const claims = payload['https://api.openai.com/auth'];
      environment.planType = claims.chatgpt_plan_type ?? null;
      environment.subscriptionActiveUntil = claims.chatgpt_subscription_active_until ?? null;
    } catch {
      // Never include parse errors, command output, or credentials in warnings.
      environment.warnings.push('Codex subscription inspection failed.');
    }
    return environment;
  })();
  environmentCache.set(cacheKey, { timestamp: Date.now(), result });
  return withUpdate(result);
}

function truncate(text) {
  if (text.length <= 8000) return text;
  let kept = 8000;
  for (;;) {
    const suffix = `…[truncated, ${text.length - kept} chars omitted]`;
    const next = 8000 - suffix.length;
    if (next === kept) return text.slice(0, kept) + suffix;
    kept = next;
  }
}

const NAME_ARG = /^[a-z][a-z0-9_.-]{0,63}$/;

function validate(args) {
  const allowed = ['task', 'mode', 'verify', 'ephemeral', 'cwd', 'timeoutSeconds', 'model', 'reasoningEffort', 'serviceTier'];
  if (!args || typeof args !== 'object' || Array.isArray(args) ||
      Object.keys(args).some(key => !allowed.includes(key))) {
    throw new Error(`Invalid parameters: expected task plus optional ${allowed.slice(1).join(', ')}.`);
  }
  if (typeof args.task !== 'string' || !args.task.trim()) throw new Error('task must be a non-empty string.');
  if (args.cwd !== undefined && (typeof args.cwd !== 'string' || !args.cwd.trim() || args.cwd.includes('\0'))) {
    throw new Error('cwd must be a non-empty directory path.');
  }
  if (args.timeoutSeconds !== undefined && (!Number.isInteger(args.timeoutSeconds) || args.timeoutSeconds < 30 || args.timeoutSeconds > 3600)) {
    throw new Error('timeoutSeconds must be an integer from 30 to 3600.');
  }
  // Report new option errors in the result while preserving legacy validation.
  if (args.verify !== undefined && !['strict', 'final', 'none'].includes(args.verify)) {
    return 'Invalid verify: expected strict, final or none.';
  }
  if (args.ephemeral !== undefined && typeof args.ephemeral !== 'boolean') {
    return 'Invalid ephemeral: expected a boolean.';
  }
}

async function run(args, config) {
  const validationError = validate(args);
  const start = Date.now();
  let logPath, log, lastMessage;
  const mode = args.mode === undefined ? 'desktop' : args.mode;
  let verify = 'none';
  const securityMode = config.securityMode ?? process.env.DSH_CODEX_SECURITY_MODE ?? 'bypass';
  const selected = {};
  let controls = 'inherited from Codex config';
  let codexVersion = 'unknown';
  const warnings = [];
  const result = (ok, exitCode, output) => ({
    ok, exitCode, mode: typeof mode === 'string' ? mode : 'invalid', verify, codexVersion, warnings, securityMode: String(securityMode), controls, securityNotice: securityMode === 'bypass'
      ? 'Approvals and sandbox disabled; Codex can operate the local desktop and files.'
      : 'Workspace-write sandbox requested; GUI access may fail. External desktop effects are not rolled back.', durationMs: Math.max(0, Date.now() - start), output: truncate(output),
    ...(logPath ? { logPath } : {}),
  });
  try {
    if (validationError) return result(false, -1, validationError);
    if (!['desktop', 'text'].includes(mode)) {
      return result(false, -1, 'Invalid mode: expected desktop or text.');
    }
    verify = mode === 'desktop' ? args.verify ?? 'strict' : 'none';
    // Validate only the effective value; Codex owns the supported vocabulary.
    for (const [key, env] of Object.entries({
      model: 'DSH_CODEX_MODEL',
      reasoningEffort: 'DSH_CODEX_REASONING_EFFORT',
      serviceTier: 'DSH_CODEX_SERVICE_TIER',
    })) {
      const source = args[key] !== undefined ? 'argument' : config[key] !== undefined ? 'config' : 'environment';
      const value = source === 'argument' ? args[key] : source === 'config' ? config[key] : process.env[env];
      if (value === undefined) continue;
      if (typeof value !== 'string' || !NAME_ARG.test(value)) {
        return result(false, -1, `Invalid ${key} (${source}): expected a lowercase token such as low, medium or priority.`);
      }
      selected[key] = { value, source };
    }
    controls = Object.entries(selected).map(([key, { value, source }]) =>
      `${key}=${value}${source === 'argument' ? '' : `(${source})`}`
    ).join(' ') || 'inherited from Codex config';
    const cwd = resolve(args.cwd ?? process.cwd());
    const seconds = args.timeoutSeconds ?? config.timeoutSeconds ?? Number(process.env.DSH_CODEX_TIMEOUT_SECONDS ?? 600);
    if (!Number.isInteger(seconds) || seconds < 30 || seconds > 3600) {
      return result(false, -1, 'Invalid configured timeoutSeconds: expected an integer from 30 to 3600.');
    }
    const graceEnv = process.env.DSH_CODEX_TERMINATE_GRACE_MS;
    const terminateGraceMs = config.terminateGraceMs !== undefined ? config.terminateGraceMs
      : graceEnv === undefined ? 5000 : graceEnv.trim() ? Number(graceEnv) : NaN;
    if (!Number.isInteger(terminateGraceMs) || terminateGraceMs < 0 || terminateGraceMs > 30000) {
      return result(false, -1, 'Invalid terminateGraceMs / DSH_CODEX_TERMINATE_GRACE_MS: expected an integer from 0 to 30000.');
    }
    if (!['bypass', 'workspace-write'].includes(securityMode)) return result(false, -1, 'Invalid securityMode: expected bypass or workspace-write.');
    const codexBin = await resolveCodexBin(config);
    const nodeExec = codexBin.endsWith('.js') ? resolveNodeExec() : undefined;
    const versionCheck = await probeCodexVersion(codexBin);
    codexVersion = versionCheck.codexVersion;
    warnings.push(...versionCheck.warnings);
    warnings.push(...(await checkCodexUpdate(codexVersion, onlineCheckEnabled(config))).warnings);
    // Do not create a misspelled working directory implicitly.
    await access(cwd);
    let screenshots;
    if (mode === 'desktop' && verify !== 'none') {
      screenshots = resolve(cwd, config.screenshotDir ?? process.env.DSH_CODEX_SCREENSHOT_DIR ?? '.codex-cu');
      await mkdir(screenshots, { recursive: true });
    }
    const temp = await mkdtemp(join(tmpdir(), 'dsh-codex-cu-'));
    lastMessage = join(temp, 'last-message.txt');
    log = await open(join(temp, 'process.log'), 'wx', 0o600);
    logPath = join(temp, 'process.log');
    const verificationInstructions = verify === 'none' ? [] : [
      'Before taking any action, confirm that the current page, window, and category match the task description by checking the URL, breadcrumbs, or window title. If the context does not match, stop and report the mismatch; do not switch to or proceed with a similar target.',
      ...(verify === 'final' ? ['Verify the final result with exactly one screenshot at the end. Do not capture intermediate steps.'] : []),
      verify === 'strict'
        ? `Save screenshots as .jpg files in ${JSON.stringify(screenshots)}; create that directory if needed.`
        : `Save that image as a .jpg file in ${JSON.stringify(screenshots)}; create that directory if needed.`,
    ];
    const prompt = (mode === 'desktop' ? [
      `Operate the local ${platformLabel(PLATFORM)} desktop fully automatically. Never ask the user questions.`,
      verify === 'strict'
        ? 'Prefer your computer-use / browser plugins. Verify every operation with a screenshot.'
        : 'Prefer your computer-use / browser plugins.',
      ...verificationInstructions,
      `Finish with a brief conclusion in the same language as the task: what you did, the result${verify === 'strict' ? ', and screenshot paths' : verify === 'final' ? ', and the image path' : ''}.`,
    ] : [
      'Complete this one-shot task. Never ask the user questions.',
      'Finish with a brief conclusion in the same language as the task.',
    ]).join('\n') + '\n\n' + args.task;
    const securityArgs = securityMode === 'bypass'
      ? ['--dangerously-bypass-approvals-and-sandbox']
      : ['--sandbox', 'workspace-write'];
    // Apply resolved overrides without editing the local Codex configuration.
    const overrides = [];
    if (selected.model) overrides.push('-m', selected.model.value);
    if (selected.reasoningEffort) overrides.push('-c', `model_reasoning_effort=${JSON.stringify(selected.reasoningEffort.value)}`);
    if (selected.serviceTier) overrides.push('-c', `service_tier=${JSON.stringify(selected.serviceTier.value)}`);
    const argv = ['exec', '-C', cwd, '--skip-git-repo-check', ...securityArgs, ...overrides,
      ...(args.ephemeral === true ? ['--ephemeral'] : []), '-o', lastMessage, prompt];
    const js = codexBin.endsWith('.js');
    const status = await new Promise(resolveStatus => {
      const child = spawn(js ? nodeExec : codexBin, js ? [codexBin, ...argv] : argv, {
        cwd, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        stdio: ['ignore', log.fd, log.fd], detached: process.platform !== 'win32',
      });
      let timedOut = false;
      let forcedKill = false;
      let exited = false;
      let spawnError;
      let timer, graceTimer;
      const clearTimers = () => {
        clearTimeout(timer);
        clearTimeout(graceTimer);
      };
      const terminate = signal => {
        if (exited) return;
        const fallback = () => {
          if (!exited) {
            try { child.kill(signal); } catch {}
          }
        };
        if (PLATFORM === 'win32') {
          if (!child.pid) return fallback();
          let fellBack = false;
          const fallbackOnce = () => {
            if (fellBack) return;
            fellBack = true;
            fallback();
          };
          try {
            const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', ...(signal === 'SIGKILL' ? ['/F'] : [])], { stdio: 'ignore' });
            killer.once('error', fallbackOnce);
            killer.once('exit', code => { if (code !== 0) fallbackOnce(); });
          } catch { fallbackOnce(); }
        } else {
          try {
            if (child.pid) process.kill(-child.pid, signal);
            else fallback();
          } catch { fallback(); }
        }
      };
      timer = setTimeout(() => {
        if (exited) return;
        timedOut = true;
        if (terminateGraceMs === 0) {
          forcedKill = true;
          terminate('SIGKILL');
          return;
        }
        terminate('SIGTERM');
        graceTimer = setTimeout(() => {
          if (exited) return;
          forcedKill = true;
          terminate('SIGKILL');
        }, terminateGraceMs);
      }, seconds * 1000);
      child.once('error', error => {
        spawnError = error;
        // A failed kill can also emit error; only a failed spawn means no process.
        if (!child.pid) {
          exited = true;
          clearTimers();
        }
      });
      child.once('exit', () => {
        exited = true;
        clearTimers();
      });
      child.once('close', (code, signal) => {
        exited = true;
        clearTimers();
        resolveStatus({ code, signal, timedOut, forcedKill, spawnError });
      });
    });
    await log.close();
    log = undefined;
    if (status.timedOut) {
      const term = PLATFORM === 'win32' ? 'SIGTERM requested via taskkill /T' : 'SIGTERM requested';
      const kill = PLATFORM === 'win32' ? 'SIGKILL via taskkill /T /F' : 'SIGKILL';
      const termination = terminateGraceMs === 0
        ? `SIGKILL requested directly (terminateGraceMs=0)${PLATFORM === 'win32' ? ' via taskkill /T /F' : ''}.`
        : status.forcedKill
          ? `${term}; escalated to ${kill} after ${terminateGraceMs} ms grace period.`
          : `${term}; process exited during the ${terminateGraceMs} ms grace period.`;
      return result(false, -1, `Codex timed out after ${seconds} seconds (超时); ${termination}`);
    }
    if (status.spawnError) return result(false, -1, `Cannot start Codex: ${status.spawnError.message}`);
    let output;
    try { output = await readFile(lastMessage, 'utf8'); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const handle = await open(logPath, 'r');
      try {
        const { size } = await handle.stat();
        const buffer = Buffer.alloc(Math.min(size, 8000));
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, Math.max(0, size - buffer.length));
        output = 'Final message file missing; process log tail:\n' + buffer.subarray(0, bytesRead).toString('utf8');
      } finally { await handle.close(); }
    }
    if (status.code !== 0) return result(false, status.code ?? -1, `Codex failed (${status.signal || `exit ${status.code}`}):\n${output}`);
    return result(true, 0, output);
  } catch (error) {
    return result(false, -1, `Codex execution failed: ${error.message}`);
  } finally {
    if (log) await log.close().catch(() => {});
    if (lastMessage) await rm(lastMessage, { force: true }).catch(() => {});
  }
}

export function apply(ctx, config = {}) {
  const tool = {
    name: 'computer_use_codex',
    description: 'Delegate a one-shot local desktop task to Codex and return its brief conclusion and any screenshot paths. With mode=text, delegate a pure text task without operating the desktop. Runs autonomously without follow-up questions. Model, reasoning effort and service tier default to the local Codex configuration and can be overridden per call.',
    // Allow the maximum task timeout, 30-second grace and preflight overhead.
    timeoutMs: 3650000,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        task: { type: 'string', description: 'Task in natural language; must not be empty.' },
        mode: { type: 'string', enum: ['desktop', 'text'], description: 'Delegation mode: desktop (default) or text for a pure text task.' },
        verify: { type: 'string', enum: ['strict', 'final', 'none'], default: 'strict', description: 'Desktop screenshot verification: strict verifies every operation (default), final verifies once at the end, none adds no screenshot requirement. Ignored in text mode, where the effective value is none.' },
        ephemeral: { type: 'boolean', default: false, description: 'Pass --ephemeral to codex exec to disable session-file persistence (default false). Process logs and requested screenshots are still written.' },
        cwd: { type: 'string', description: 'Existing working directory; defaults to the current process directory.' },
        timeoutSeconds: { type: 'integer', description: 'Timeout override in seconds, 30–3600; defaults to the configured timeout (600 seconds initially).' },
        model: { type: 'string', description: 'Codex model id for this run, e.g. gpt-6.1-sol; omit to use the local Codex default.' },
        reasoningEffort: { type: 'string', description: 'Reasoning effort for this run, e.g. low, medium, high, xhigh; omit to use the local Codex default. Unknown levels fail inside Codex.' },
        serviceTier: { type: 'string', description: 'Service tier for this run, e.g. priority or default; omit to use the local Codex default.' },
      },
      required: ['task'],
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          ok: { type: 'boolean' },
          exitCode: { type: 'integer' },
          mode: { type: 'string' },
          verify: { type: 'string', enum: ['strict', 'final', 'none'], description: 'Effective screenshot verification policy; none in text mode.' },
          codexVersion: { type: 'string', description: 'Detected Codex CLI semver, or unknown if unavailable.' },
          warnings: { type: 'array', items: { type: 'string' }, description: 'Non-fatal CLI version preflight warnings.' },
          securityMode: { type: 'string' },
          controls: { type: 'string', description: 'Overrides actually applied, or "inherited from Codex config".' },
          securityNotice: { type: 'string' },
          durationMs: { type: 'integer' },
          output: { type: 'string', description: 'Final reply, at most 8000 characters including truncation notice.' },
          logPath: { type: 'string' },
        },
        required: ['ok', 'exitCode', 'mode', 'verify', 'codexVersion', 'warnings', 'durationMs', 'output'],
      },
      render: (_args, value) => [
        { type: 'text', text: `${value.mode} · ${value.controls} · ${(value.durationMs / 1000).toFixed(1)}s · ${value.ok ? 'ok' : 'failed'}` },
        { type: 'text', text: JSON.stringify(value, null, 2) },
      ],
    },
    execute: args => run(args, config),
    presentCall: args => ({
      card: 'generic',
      title: [
        `Computer use (${args.mode ?? 'desktop'})`,
        args.model ?? config.model ?? 'Codex default',
        args.reasoningEffort ?? config.reasoningEffort,
      ].filter(Boolean).join(' · '),
      kind: 'other', rawInput: args,
    }),
  };
  const statusTool = {
    name: 'computer_use_codex_status',
    description: 'Inspect Codex models, CLI and desktop app versions, authentication mode and subscription metadata. Results are cached for five minutes.',
    parameters: { type: 'object', additionalProperties: false, properties: {}, required: [] },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    execute: async () => inspectEnvironment(await resolveCodexBin(config), config),
    presentCall: () => ({ card: 'generic', title: 'Codex environment' }),
  };
  let dispose;
  let registrationStarted = false;
  const register = () => {
    if (dispose) return dispose;
    registrationStarted = true;
    const disposeTool = ctx.tools.register(tool);
    let disposeStatus;
    try { disposeStatus = ctx.tools.register(statusTool); }
    catch (error) { console.error('[codex-computer-use] Status tool registration failed:', error); }
    let disposed = false;
    dispose = () => {
      if (disposed) return;
      disposed = true;
      for (const cleanup of [disposeTool, disposeStatus]) {
        try { if (typeof cleanup === 'function') cleanup(); }
        catch (error) { console.error('[codex-computer-use] Tool cleanup failed:', error); }
      }
    };
    return dispose;
  };
  try { if (typeof ctx.effect === 'function') return ctx.effect(register); }
  catch (error) {
    // Keep primary registration failures visible; only the optional lifecycle
    // wrapper can fall back. Reuse an existing registration if it already ran.
    if (registrationStarted && !dispose) throw error;
    console.error('[codex-computer-use] Effect setup failed; retaining tools:', error);
  }
  return register();
}
