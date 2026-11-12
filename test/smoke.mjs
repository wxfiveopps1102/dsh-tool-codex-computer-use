import { mkdtemp, writeFile, readFile, chmod, rm, access, readdir, mkdir, copyFile, realpath, symlink } from 'node:fs/promises';
import { join, dirname, basename, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
const root = new URL('../', import.meta.url);
const check = (v, message) => { if (!v) throw new Error(message); };
const isWindows = process.platform === 'win32';
let fixture;
const logs = [];
const savedEnv = { ...process.env };
const savedFetch = globalThis.fetch;
const savedNow = Date.now;
let fetchCalls = 0;
let fetchVersion = '0.167.2';
let fetchFailure = false;
process.env.DSH_CODEX_OFFLINE = '1';
globalThis.fetch = async (url, options) => {
  fetchCalls++;
  check(process.env.DSH_CODEX_OFFLINE !== '1', 'fetch must not run offline');
  check(url === 'https://registry.npmjs.org/@openai/codex/latest', 'npm latest URL');
  check(options.signal instanceof AbortSignal, 'fetch abort signal');
  if (fetchFailure) throw new Error('fake network timeout');
  return { ok: true, json: async () => ({ version: fetchVersion }) };
};
for (const key of ['DSH_CODEX_BIN', 'DSH_PROFILE_DIR', 'DSH_CODEX_SECURITY_MODE', 'DSH_CODEX_TIMEOUT_SECONDS', 'DSH_CODEX_TERMINATE_GRACE_MS', 'DSH_CODEX_SCREENSHOT_DIR', 'DSH_CODEX_MODEL', 'DSH_CODEX_REASONING_EFFORT', 'DSH_CODEX_SERVICE_TIER']) delete process.env[key];
try {
  // The plugin imports no Host package: it builds the registry definition itself,
  // so it loads straight from the workspace, before and after installation.
  const { apply, name, inject, platformLabel } = await import(new URL('index.js', root));
  check(name === 'tool-computer-use-codex' && inject[0] === 'tools', 'exports');
  const platforms = [['darwin', 'macOS'], ['win32', 'Windows'], ['linux', 'Linux']];
  for (const [platform, label] of platforms) check(platformLabel(platform) === label, 'platform label: ' + platform);
  let captured, statusTool;
  const registrations = [];
  const ctx = { tools: { register(def) {
    check(def.output?.schema?.type === 'object' && typeof def.output.render === 'function', 'Host requires output.schema and output.render: ' + def.name);
    registrations.push(def.name);
    if (def.name === 'computer_use_codex_status') statusTool = def;
    else captured = def;
  } } };
  apply(ctx, {});
  check(registrations.join(',') === 'computer_use_codex,computer_use_codex_status', 'main tool registers first');
  check(statusTool.output.schema.additionalProperties === true, 'status output accepts environment fields');
  const statusValue = { models: [], codexVersion: '0.167.2' };
  check(JSON.stringify(statusTool.output.render({}, statusValue)) ===
    JSON.stringify([{ type: 'text', text: JSON.stringify(statusValue, null, 2) }]), 'status JSON renderer');
  const registrationErrors = [];
  const originalError = console.error;
  try {
    console.error = (...args) => registrationErrors.push(args);
    let mainRegistered = false, mainDisposed = false;
    const cleanup = apply({ tools: { register(def) {
      if (def.name === 'computer_use_codex_status') throw new Error('status registration rejected');
      mainRegistered = true;
      return () => { mainDisposed = true; };
    } } });
    check(mainRegistered && !mainDisposed && registrationErrors.length === 1, 'status failure preserves main tool and logs once');
    cleanup();
    check(mainDisposed, 'main tool remains disposable after status failure');
    for (const phase of ['before', 'after']) {
      const registered = [], disposed = [];
      const cleanup = apply({
        effect(register) {
          if (phase === 'after') register();
          throw new Error('effect failed ' + phase);
        },
        tools: { register(def) {
          registered.push(def.name);
          return () => { disposed.push(def.name); if (def.name === 'computer_use_codex') throw new Error('cleanup failed'); };
        } },
      });
      check(registered.join(',') === 'computer_use_codex,computer_use_codex_status', 'effect fallback registers once: ' + phase);
      cleanup();
      cleanup();
      check(disposed.join(',') === registered.join(','), 'cleanup failure does not skip status or repeat cleanup: ' + phase);
    }
    let attempts = 0;
    const mainError = new Error('main registration rejected');
    try {
      apply({ effect: register => register(), tools: { register() { attempts++; throw mainError; } } });
      throw new Error('expected main registration error');
    } catch (error) { check(error === mainError && attempts === 1, 'main registration failure stays visible without retry'); }
  } finally { console.error = originalError; }
  console.log('OK: required tool outputs, main-first registration, status/effect/cleanup failure isolation');
  check(captured.name === 'computer_use_codex', 'name');
  check(captured.description.includes('local desktop task') && !captured.description.includes('macOS'), 'platform-neutral tool description');
  check(captured.parameters.properties.task.type === 'string' && captured.parameters.required.includes('task'), 'required task');
  check(captured.parameters.additionalProperties === false && captured.output.schema.additionalProperties === false, 'closed schemas');
  check(captured.parameters.properties.mode.type === 'string' &&
    JSON.stringify(captured.parameters.properties.mode.enum) === '["desktop","text"]' &&
    !captured.parameters.required.includes('mode'), 'optional mode parameter');
  check(captured.output.schema.properties.mode.type === 'string' && captured.output.schema.required.includes('mode'), 'mode output schema');
  check(captured.output.schema.properties.codexVersion.type === 'string' &&
    captured.output.schema.properties.warnings.type === 'array' && captured.output.schema.properties.warnings.items.type === 'string' &&
    ['codexVersion', 'warnings'].every(key => captured.output.schema.required.includes(key)), 'version output schema');
  check(captured.presentCall({}).title === 'Computer use (desktop) · Codex default', 'default title');
  const callArgs = { mode: 'text', model: 'gpt-6-astra', reasoningEffort: 'low' };
  const callCard = captured.presentCall(callArgs);
  check(callCard.title === 'Computer use (text) · gpt-6-astra · low', 'argument title');
  check(callCard.card === 'generic' && callCard.kind === 'other' && callCard.rawInput === callArgs, 'call card metadata unchanged');
  let configuredTool;
  apply({ tools: { register(def) {
    if (def.name === 'computer_use_codex') configuredTool = def;
  } } }, { model: 'gpt-6.1-sol', reasoningEffort: 'high' });
  check(configuredTool.presentCall({}).title === 'Computer use (desktop) · gpt-6.1-sol · high', 'config title');
  check(configuredTool.presentCall(callArgs).title === callCard.title, 'title arguments override config');
  check(configuredTool.presentCall({ model: 'gpt-6-astra' }).title === 'Computer use (desktop) · gpt-6-astra · high', 'title retains configured effort');
  check(configuredTool.presentCall({ reasoningEffort: 'low' }).title === 'Computer use (desktop) · gpt-6.1-sol · low', 'title retains configured model');
  const fakeValue = {
    mode: 'desktop', controls: 'model=gpt-6.1-sol(config) reasoningEffort=high(config) serviceTier=priority(config)',
    durationMs: 52345, ok: true, output: 'FAKE OK',
  };
  const rendered = captured.output.render({}, fakeValue);
  check(rendered.length === 2 && rendered.every(part => part.type === 'text'), 'summary and JSON text parts');
  check(rendered[0].text === 'desktop · ' + fakeValue.controls + ' · 52.3s · ok', 'render controls, seconds and success');
  check(rendered[1].text === JSON.stringify(fakeValue, null, 2), 'complete formatted JSON renderer');
  check(captured.output.render({}, { ...fakeValue, mode: 'text', durationMs: 0, ok: false })[0].text ===
    'text · ' + fakeValue.controls + ' · 0.0s · failed', 'render mode, zero duration and failure');
  console.log('OK: call titles, config precedence, summary and complete JSON rendering');
  fixture = await realpath(await mkdtemp(join(tmpdir(), 'dsh-codex-smoke-')));
  process.env.TMPDIR = fixture;
  process.env.TEMP = fixture;
  process.env.TMP = fixture;
  process.env.CODEX_HOME = fixture;
  const writeFixtureFile = async (target, contents) => {
    check(resolve(target).startsWith(fixture + sep), 'write outside fixture');
    const parent = await realpath(dirname(target));
    check(parent === fixture || parent.startsWith(fixture + sep), 'write through outside directory');
    // Remove an existing fixture entry first so writeFile cannot follow a symlink.
    await rm(target, { force: true });
    await writeFile(target, contents, { flag: 'wx' });
  };
  // Node 20 also needs explicit ESM mode for the disposable .js entry points.
  await writeFixtureFile(join(fixture, 'package.json'), '{"type":"module"}\n');
  const runtimeDir = join(fixture, 'runtime.app', 'Contents', 'MacOS');
  await mkdir(runtimeDir, { recursive: true });
  const nodeExec = join(runtimeDir, basename(process.execPath));
  await copyFile(process.execPath, nodeExec);
  await chmod(nodeExec, 0o700);
  if (process.platform === 'darwin' && process.versions.electron) {
    // The copied Mach-O resolves Electron via @executable_path/../Frameworks.
    await symlink(join(dirname(process.execPath), '..', 'Frameworks'), join(dirname(runtimeDir), 'Frameworks'));
    await copyFile(join(dirname(process.execPath), '..', 'Info.plist'), join(dirname(runtimeDir), 'Info.plist'));
    // A relocated Electron launcher needs a valid standalone signature.
    // Sign only the disposable copy, never the installed application.
    const signed = spawnSync('/usr/bin/codesign', ['--force', '--sign', '-', nodeExec], { encoding: 'utf8' });
    check(!signed.error && signed.status === 0, 'sign copied runtime: ' + (signed.error?.message ?? signed.stderr));
  }
  process.env.DSH_NODE_EXECUTABLE = nodeExec;
  const cliPath = label => join(fixture, label + (isWindows ? '.js' : ''));
  const fake = cliPath('fake-codex');
  const versionHandler = (version = 'codex-cli 0.153.4', exitCode = 0) =>
    `if [ "$1" = '--version' ]; then\n printf x >> "$0.versions"\n printf '%s\\n' '${version}'\n exit ${exitCode}\nfi\n`;
  const parser = `printf '%s\\n' "$@"\ncat\nout=''\nwhile [ "$#" -gt 0 ]; do\n if [ "$1" = '-o' ]; then shift; out="$1"; fi\n shift\ndone\n`;
  const writeCli = async (entry, {
    body = 'printf "FAKE OK" > "$out"\n', jsBody = "writeFileSync(out, 'FAKE OK');",
    version = 'codex-cli 0.153.4', versionExitCode = 0, handlers = '', jsHandlers = '',
  } = {}, useJs = isWindows) => {
    if (useJs) {
      // .js entries go through the plugin's Node launcher; no shell or .cmd shim.
      await writeFixtureFile(entry, `
import { appendFileSync, writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
if (args[0] === '--version') {
  appendFileSync(process.argv[1] + '.versions', 'x');
  console.log(${JSON.stringify(version)});
  process.exit(${versionExitCode});
}
${jsHandlers}
if (args[0] !== 'exec') process.exit(7);
process.stdout.write(args.join('\\n') + '\\n');
const outputIndex = args.indexOf('-o');
if (outputIndex < 0 || !args[outputIndex + 1]) process.exit(7);
const out = args[outputIndex + 1];
${jsBody}
`);
    } else {
      await writeFixtureFile(entry, '#!/bin/sh\n' + versionHandler(version, versionExitCode) + handlers + parser + body);
      await chmod(entry, 0o700);
    }
  };
  const script = async (body, jsBody) => {
    await writeCli(fake, { body, jsBody });
    apply(ctx, { codexBin: fake });
  };
  const execute = async (args = {}, tool = captured) => {
    const result = await tool.execute({ task: 'say ok', cwd: fixture, ...args }, {});
    if (result.logPath) logs.push(dirname(result.logPath));
    check(Number.isInteger(result.durationMs) && result.durationMs >= 0, 'duration');
    check(result.output.length <= 8000, 'length');
    check(typeof result.mode === 'string', 'mode output type');
    check(typeof result.codexVersion === 'string' && Array.isArray(result.warnings) &&
      result.warnings.every(warning => typeof warning === 'string'), 'version output types');
    return result;
  };
  await script('printf "FAKE OK" > "$out"\n');
  const oldCwd = process.cwd();
  let success;
  try { process.chdir(fixture); success = await captured.execute({ task: 'say ok' }, {}); }
  finally { process.chdir(oldCwd); }
  logs.push(dirname(success.logPath));
  check(success.ok && success.exitCode === 0 && success.output.includes('FAKE OK') && success.durationMs >= 0, 'fake CLI success');
  const hasUpgradeWarning = result => result.warnings.some(warning => warning.includes('升级') && warning.includes('npm 最新'));
  check(success.codexVersion === '0.153.4' && !hasUpgradeWarning(success) && fetchCalls === 0, 'offline CLI probe without fetch or upgrade warning');
  const log = await readFile(success.logPath, 'utf8');
  for (const flag of ['exec', '-C', '--skip-git-repo-check', '--dangerously-bypass-approvals-and-sandbox', '-o', '.codex-cu', 'Never ask', 'same language', 'say ok']) check(log.includes(flag), 'argv/prompt: ' + flag);
  await access(join(fixture, '.codex-cu'));
  check(success.mode === 'desktop', 'default desktop mode');
  const promptFromLog = contents => contents.split('\n-o\n')[1].split('\n').slice(1).join('\n');
  check(promptFromLog(log).startsWith(`Operate the local ${platformLabel(process.platform)} desktop fully automatically.`), 'native desktop platform prompt');
  await rm(join(fixture, '.codex-cu'), { recursive: true });
  const desktop = await execute({ mode: 'desktop' });
  check(desktop.ok && desktop.mode === 'desktop' &&
    promptFromLog(await readFile(desktop.logPath, 'utf8')) === promptFromLog(log), 'default and explicit desktop prompts match');
  await access(join(fixture, '.codex-cu'));
  const textCwd = join(fixture, 'text-task');
  await mkdir(textCwd);
  const textResult = await execute({ mode: 'text', cwd: textCwd });
  const textPrompt = promptFromLog(await readFile(textResult.logPath, 'utf8'));
  check(textResult.ok && textResult.mode === 'text' && textResult.output === 'FAKE OK' &&
    textResult.controls === success.controls && textResult.securityMode === success.securityMode, 'text result and inherited controls');
  check(!/desktop|\.codex-cu|screenshot|computer-use|browser/i.test(textPrompt), 'text prompt has no desktop or screenshot instructions');
  for (const phrase of ['one-shot', 'Never ask', 'brief conclusion', 'same language', 'say ok']) {
    check(textPrompt.includes(phrase), 'text prompt: ' + phrase);
  }
  check(textPrompt === 'Complete this one-shot task. Never ask the user questions.\n' +
    'Finish with a brief conclusion in the same language as the task.\n\nsay ok\n', 'text prompt unchanged');
  const checkAbsent = async target => {
    try { await access(target); }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
    throw new Error('unexpected directory: ' + target);
  };
  await checkAbsent(join(textCwd, '.codex-cu'));
  apply(ctx, { codexBin: fake, screenshotDir: 'unused-shots', securityMode: 'workspace-write' });
  const textConfigured = await execute({ mode: 'text', cwd: textCwd, model: 'call-model' });
  check(textConfigured.ok && textConfigured.controls === 'model=call-model' &&
    (await readFile(textConfigured.logPath, 'utf8')).includes('--sandbox\nworkspace-write'), 'text controls and security mode');
  await checkAbsent(join(textCwd, 'unused-shots'));
  apply(ctx, { codexBin: fake });
  for (const mode of ['invalid', '', 'Desktop', null, 1, {}, { toString: null }, ['text']]) {
    const invalid = await execute({ mode, cwd: textCwd });
    check(!invalid.ok && invalid.exitCode === -1 && invalid.output.includes('Invalid mode') && !invalid.logPath, 'invalid mode returns failure');
  }
  await checkAbsent(join(textCwd, '.codex-cu'));
  console.log('OK: default/explicit desktop, text prompt, no text screenshot directories, invalid modes');
  // Capture each platform's prompt with the fake CLI on this host. Restore the
  // real platform before execution; this does not validate Windows desktop use.
  const platformBin = cliPath('platform-codex');
  await copyFile(fake, platformBin);
  await chmod(platformBin, 0o700);
  const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');
  for (const [platform, label] of platforms) {
    const entry = new URL('index.js', root);
    entry.searchParams.set('smokePlatform', platform);
    let platformModule;
    try {
      Object.defineProperty(process, 'platform', { value: platform });
      platformModule = await import(entry);
    } finally {
      Object.defineProperty(process, 'platform', platformDescriptor);
    }
    platformModule.apply(ctx, { codexBin: platformBin });
    const desktopResult = await execute({ mode: 'desktop' });
    check(desktopResult.ok, 'simulated platform desktop result: ' + platform);
    const desktopPrompt = promptFromLog(await readFile(desktopResult.logPath, 'utf8'));
    check(desktopPrompt.includes('desktop') && desktopPrompt.startsWith(`Operate the local ${label} desktop`), 'simulated platform desktop prompt: ' + platform);
    if (platform !== 'darwin') check(!desktopPrompt.includes('macOS'), 'no hard-coded macOS in desktop prompt: ' + platform);
    const platformText = await execute({ mode: 'text', cwd: textCwd });
    check(platformText.ok && promptFromLog(await readFile(platformText.logPath, 'utf8')) === textPrompt, 'platform-independent text prompt: ' + platform);
  }
  apply(ctx, { codexBin: fake });
  console.log('OK: platform labels and simulated macOS/Windows/Linux prompts via fake CLI');
  check(!success.output.includes('--skip'), 'log separation');
  const tuned = await captured.execute({ task: 'say ok', cwd: fixture, model: 'gpt-6.1-sol', reasoningEffort: 'high', serviceTier: 'default' }, {});
  logs.push(dirname(tuned.logPath));
  const tunedLog = await readFile(tuned.logPath, 'utf8');
  for (const flag of ['-m', 'gpt-6.1-sol', 'model_reasoning_effort="high"', 'service_tier="default"']) {
    check(tunedLog.includes(flag), 'override argv: ' + flag);
  }
  check(tuned.controls === 'model=gpt-6.1-sol reasoningEffort=high serviceTier=default', 'controls: ' + tuned.controls);
  check(success.controls === 'inherited from Codex config', 'default controls: ' + success.controls);
  for (const args of [{}, { task: '' }, { task: 'ok', extra: true }, { task: 'ok', timeoutSeconds: 29 }, { task: 'ok', timeoutSeconds: 3601 }, { task: 'ok', timeoutSeconds: 30.5 }]) {
    let rejected = false;
    try { await captured.execute(args, {}); } catch { rejected = true; }
    check(rejected, 'invalid arguments');
  }
  for (const [key, value] of Object.entries({ model: 5, reasoningEffort: 'High', serviceTier: '' })) {
    const invalid = await execute({ [key]: value });
    check(!invalid.ok && invalid.output.includes(key) && invalid.output.includes('argument'), 'invalid argument: ' + key);
  }
  const defaults = { model: 'gpt-6.1-sol', reasoningEffort: 'high', serviceTier: 'priority' };
  const hasOverrides = (argv, model, effort, tier) => argv.includes(`\n-m\n${model}\n`) &&
    argv.includes(`\n-c\nmodel_reasoning_effort="${effort}"\n`) && argv.includes(`\n-c\nservice_tier="${tier}"\n`);
  process.env.DSH_CODEX_MODEL = 'env-model';
  process.env.DSH_CODEX_REASONING_EFFORT = 'low';
  process.env.DSH_CODEX_SERVICE_TIER = 'default';
  apply(ctx, { codexBin: fake, ...defaults });
  const configured = await execute();
  check(configured.ok && hasOverrides(await readFile(configured.logPath, 'utf8'), ...Object.values(defaults)) &&
    configured.controls === 'model=gpt-6.1-sol(config) reasoningEffort=high(config) serviceTier=priority(config)', 'config defaults beat environment');
  const overridden = await execute({ model: 'call-model', reasoningEffort: 'medium', serviceTier: 'default' });
  check(overridden.ok && hasOverrides(await readFile(overridden.logPath, 'utf8'), 'call-model', 'medium', 'default') &&
    overridden.controls === 'model=call-model reasoningEffort=medium serviceTier=default', 'arguments override config');
  apply(ctx, { codexBin: fake });
  const environment = await execute();
  check(environment.ok && hasOverrides(await readFile(environment.logPath, 'utf8'), 'env-model', 'low', 'default') &&
    environment.controls === 'model=env-model(environment) reasoningEffort=low(environment) serviceTier=default(environment)', 'environment defaults');
  for (const key of ['DSH_CODEX_MODEL', 'DSH_CODEX_REASONING_EFFORT', 'DSH_CODEX_SERVICE_TIER']) delete process.env[key];
  check(success.ok && !log.split('\n').includes('-m') && !log.split('\n').includes('-c') &&
    success.controls === 'inherited from Codex config', 'no explicit controls inherits Codex config');
  apply(ctx, { codexBin: fake, model: 'BAD MODEL' });
  const invalidConfig = await execute();
  check(!invalidConfig.ok && invalidConfig.output.includes('model') && invalidConfig.output.includes('config'), 'invalid config returns failure');
  console.log('OK: registration, CLI argv, prompt, log, validation');
  check(await readFile(fake + '.versions', 'utf8') === 'x', 'version cached across calls and registrations');
  success.warnings.push('caller mutation');
  apply(ctx, { codexBin: fake });
  check(!(await execute()).warnings.includes('caller mutation'), 'cached warnings are not shared with callers');
  const modelData = { models: [
    { slug: 'model-one', displayName: 'Model One', supportedReasoningEfforts: [{ effort: 'high' }], serviceTiers: [{ id: 'default' }] },
    { slug: 'model-two', display_name: 'Model Two', supported_reasoning_levels: [{ reasoningEffort: 'low' }], service_tiers: [{ id: 'priority' }] },
  ] };
  const doctorData = { codexVersion: '0.153.4', checks: {
    'desktop.app.version': { details: { version: '1.2.3' } },
    'auth.credentials': { details: { 'stored auth mode': 'chatgpt' } },
  } };
  const statusEntry = async (label, failOnline = false, failBundled = false, useJs = isWindows) => {
    const entry = join(fixture, `status-${label}${useJs ? '.js' : ''}`);
    await writeCli(entry, { handlers: `
if [ "$1" = 'debug' ]; then
 printf '%s\\n' "$*" >> "$0.calls"
 if [ "$3" = '--bundled' ]; then
  ${failBundled ? 'exit 8' : ':'}
 else
  ${failOnline ? 'exit 7' : ':'}
 fi
 printf '%s\\n' '${JSON.stringify(modelData)}'
 exit 0
fi
if [ "$1" = 'doctor' ]; then
 printf '%s\\n' '${JSON.stringify(doctorData)}'
 exit 0
fi
`, jsHandlers: `
if (args[0] === 'debug' && args[1] === 'models') {
  appendFileSync(process.argv[1] + '.calls', args.join(' ') + '\\n');
  if (args.includes('--bundled') ? ${failBundled} : ${failOnline}) process.exit(args.includes('--bundled') ? 8 : 7);
  console.log(${JSON.stringify(JSON.stringify(modelData))});
  process.exit(0);
}
if (args[0] === 'doctor' && args[1] === '--json') {
  console.log(${JSON.stringify(JSON.stringify(doctorData))});
  process.exit(0);
}
` }, useJs);
    return entry;
  };
  const authPayload = Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_plan_type: 'test' } })).toString('base64url');
  await writeFixtureFile(join(fixture, 'auth.json'), JSON.stringify({ tokens: { id_token: `header.${authPayload}.signature` } }));
  const statusBin = await statusEntry('success');
  apply(ctx, { codexBin: statusBin });
  const offlineStatus = await statusTool.execute();
  check(offlineStatus.platform === process.platform, 'status platform matches process.platform');
  check(offlineStatus.platformLabel === platformLabel(process.platform), 'status platform label matches platformLabel');
  check(typeof offlineStatus.osVersion === 'string' && offlineStatus.osVersion.trim().length > 0, 'status OS version is a non-empty string');
  console.log('OK: status platform metadata ' + JSON.stringify({
    platform: offlineStatus.platform, platformLabel: offlineStatus.platformLabel, osVersion: offlineStatus.osVersion,
  }));
  check(offlineStatus.latestCodexVersion === null && offlineStatus.upToDate === null && fetchCalls === 0, 'offline status never fetches');
  check(await readFile(statusBin + '.calls', 'utf8') === 'debug models --bundled\n', 'offline models skip online refresh');
  check(offlineStatus.warnings.some(warning => warning.includes('离线目录')), 'offline model warning');
  delete process.env.DSH_CODEX_OFFLINE;
  apply(ctx, { codexBin: statusBin, onlineCheck: false });
  check((await statusTool.execute()).latestCodexVersion === null && fetchCalls === 0, 'config disables fetch');
  check(!hasUpgradeWarning(await execute({ mode: 'text' })) && fetchCalls === 0, 'config disables execution update check');
  apply(ctx, { codexBin: statusBin });
  const onlineStatuses = await Promise.all([statusTool.execute(), statusTool.execute()]);
  const onlineStatus = onlineStatuses[0];
  check(onlineStatuses.every(result => result.latestCodexVersion === '0.167.2' && result.upToDate === false) && fetchCalls === 1, 'concurrent latest version cache');
  check(JSON.stringify(onlineStatus.models) === JSON.stringify([
    { slug: 'model-one', displayName: 'Model One', efforts: ['high'], serviceTiers: ['default'] },
    { slug: 'model-two', displayName: 'Model Two', efforts: ['low'], serviceTiers: ['priority'] },
  ]), 'parse both model formats');
  check(await readFile(statusBin + '.calls', 'utf8') === 'debug models --bundled\ndebug models\n', 'online models refresh by default');
  const upgradeMessage = '旧 CLI（0.153.4），npm 最新 0.167.2，建议升级。';
  check(onlineStatus.warnings.includes(upgradeMessage) &&
    (await execute({ mode: 'text' })).warnings.includes(upgradeMessage), 'status and execution share version warnings');
  onlineStatus.warnings.push('caller mutation');
  check(!(await statusTool.execute()).warnings.includes('caller mutation'), 'status cache isolates warnings');
  process.env.DSH_CODEX_OFFLINE = '1';
  const disabledAgain = await statusTool.execute();
  check(disabledAgain.latestCodexVersion === null && disabledAgain.upToDate === null && !hasUpgradeWarning(disabledAgain) && fetchCalls === 1, 'offline hides cached online version');
  delete process.env.DSH_CODEX_OFFLINE;
  const fallbackBin = await statusEntry('fallback', true);
  apply(ctx, { codexBin: fallbackBin });
  const fallbackStatus = await statusTool.execute();
  check(fallbackStatus.models.length === 2 && fallbackStatus.warnings.some(warning => warning.includes('回退') && warning.includes('离线目录')), 'bundled fallback warning');
  check(await readFile(fallbackBin + '.calls', 'utf8') === 'debug models\ndebug models --bundled\n', 'bundled fallback order');
  apply(ctx, { codexBin: await statusEntry('failure', true, true) });
  const failedStatus = await statusTool.execute();
  check(failedStatus.models.length === 0 && failedStatus.warnings.some(warning => warning.includes('model inspection failed')), 'both model probes fail non-fatally');
  console.log('OK: offline/config switches, no network, model parsing, bundled fallback, shared update warnings');
  for (const [label, versionOutput, exitCode, expected, upgrade] of [
    ['new', 'codex-cli 0.170.0', 0, '0.170.0', false],
    ['older-patch', 'codex-cli 0.167.0', 0, '0.167.0', true],
    ['equal', 'codex-cli 0.167.2', 0, '0.167.2', false],
    ['build', 'codex-cli 0.167.2+build.2', 0, '0.167.2+build.2', false],
    ['latest-prerelease', 'codex-cli 0.167.2-rc.1', 0, '0.167.2-rc.1', true],
    ['prerelease', 'codex-cli 0.167.0-rc.1+build.2', 0, '0.167.0-rc.1+build.2', true],
    ['prerelease-hyphen', 'codex-cli 0.167.0--', 0, '0.167.0--', true],
    ['major', 'codex-cli 1.0.0', 0, '1.0.0', false],
    ['failure', 'codex-cli 0.170.0', 7, 'unknown', false],
    ['unparseable', 'version unavailable', 0, 'unknown', false],
    ['invalid-suffix', 'codex-cli 0.167.0-', 0, 'unknown', false],
    ['invalid-prerelease', 'codex-cli 0.167.0-01', 0, 'unknown', false],
  ]) {
    const entry = cliPath(`fake-${label}`);
    await writeCli(entry, { version: versionOutput, versionExitCode: exitCode });
    apply(ctx, { codexBin: entry });
    const results = await Promise.all([execute(), execute()]);
    for (const result of results) {
      check(result.ok && result.output === 'FAKE OK' && result.codexVersion === expected, 'version preflight: ' + label);
      check(hasUpgradeWarning(result) === upgrade, 'version upgrade warning: ' + label);
      if (expected === 'unknown') check(result.warnings.some(warning => /版本探测失败/.test(warning)), 'non-fatal version warning: ' + label);
      else if (!upgrade) check(result.warnings.length === 0, 'no version warning: ' + label);
    }
    // An equivalent path must reuse the result, including a failed probe.
    apply(ctx, { codexBin: join(fixture, '.') + '/./' + basename(entry) });
    check((await execute()).codexVersion === expected, 'cached version: ' + label);
    check(await readFile(entry + '.versions', 'utf8') === 'x', 'one probe per resolved path: ' + label);
  }
  console.log('OK: CLI versions, upgrade warnings, non-fatal probes, path cache and concurrent calls');
  check(fetchCalls === 1, 'latest version shared across binary paths and tools');
  apply(ctx, { codexBin: statusBin });
  let clockOffset = 6 * 60 * 60 * 1000 + 1000;
  Date.now = () => savedNow() + clockOffset;
  fetchFailure = true;
  const unavailable = await statusTool.execute();
  check(unavailable.latestCodexVersion === null && unavailable.upToDate === null && !hasUpgradeWarning(unavailable) && fetchCalls === 2, 'expired cache and non-fatal fetch failure');
  check(!hasUpgradeWarning(await execute({ mode: 'text' })) && fetchCalls === 2, 'failed fetch cached across tools');
  clockOffset += 5 * 60 * 60 * 1000;
  await statusTool.execute();
  check(fetchCalls === 2, 'failure cached for six hours');
  clockOffset += 60 * 60 * 1000 + 1000;
  fetchFailure = false;
  fetchVersion = '0.153.4';
  const recovered = await statusTool.execute();
  check(recovered.latestCodexVersion === fetchVersion && recovered.upToDate === true && !hasUpgradeWarning(recovered) && fetchCalls === 3, 'retry after failure TTL and equal version');
  clockOffset += 6 * 60 * 60 * 1000 + 1000;
  fetchVersion = 'not-semver';
  const malformed = await statusTool.execute();
  check(malformed.latestCodexVersion === null && malformed.upToDate === null && !hasUpgradeWarning(malformed) && fetchCalls === 4, 'invalid registry version ignored');
  Date.now = savedNow;
  process.env.DSH_CODEX_OFFLINE = '1';
  console.log('OK: six-hour success/failure cache, expiry, recovery, malformed version');
  // Exercise the Windows JS fixture generator on POSIX too, without pretending
  // this validates native Windows process launching or taskkill behavior.
  const portableBin = await statusEntry('portable', false, false, true);
  apply(ctx, { codexBin: portableBin });
  const portableStatus = await statusTool.execute();
  const portableResult = await execute({ mode: 'text' });
  check(portableStatus.models.length === 2 && portableStatus.codexVersion === doctorData.codexVersion &&
    portableResult.ok && portableResult.output === 'FAKE OK' && portableResult.codexVersion === '0.153.4',
    'JS fixture supports --version, debug models, doctor --json and exec');
  await writeCli(portableBin, { jsBody: "await new Promise(resolve => setTimeout(resolve, 50)); writeFileSync(out, 'JS DELAYED FAILURE'); process.exit(7);" }, true);
  const portableFailure = await execute({ mode: 'text' });
  check(!portableFailure.ok && portableFailure.exitCode === 7 && portableFailure.output.includes('JS DELAYED FAILURE'), 'JS fixture delay and exit code');
  console.log('OK: portable JS fake CLI commands, output file, delay and nonzero exit');
  await script('printf "FINAL FAILURE" > "$out"\nexit 7\n', "writeFileSync(out, 'FINAL FAILURE'); process.exit(7);");
  const failed = await execute();
  check(!failed.ok && failed.exitCode === 7 && failed.output.includes('FINAL FAILURE'), 'nonzero');
  await script('printf "TAIL FALLBACK" >&2\n', "process.stderr.write('TAIL FALLBACK\\n');");
  check((await execute()).output.includes('TAIL FALLBACK'), 'fallback');
  await script('i=0\nwhile [ "$i" -lt 10000 ]; do printf x; i=$((i + 1)); done > "$out"\n', "writeFileSync(out, 'x'.repeat(10000));");
  const long = await execute();
  const match = long.output.match(/…\[truncated, (\d+) chars omitted\]$/);
  check(long.ok && match && long.output.indexOf('…') + Number(match[1]) === 10000, 'truncation');
  apply(ctx, { codexBin: join(fixture, 'missing') });
  check(!(await execute()).ok, 'missing entry');
  if (isWindows) {
    // Windows ignores POSIX executable bits; use an invalid native entry instead.
    const invalidExecutable = join(fixture, 'invalid-codex.exe');
    await writeFixtureFile(invalidExecutable, 'not a Windows executable');
    apply(ctx, { codexBin: invalidExecutable });
  } else {
    await chmod(fake, 0o600);
    apply(ctx, { codexBin: fake });
  }
  check(!(await execute()).ok, 'spawn error');
  const js = join(fixture, 'fake.js');
  await writeFixtureFile(js, `
import { writeFile, realpath } from 'node:fs/promises';
import { resolve, dirname, sep } from 'node:path';
const a = process.argv;
if (process.env.ELECTRON_RUN_AS_NODE !== '1') process.exit(9);
if (a[2] === '--version') { console.log('codex-cli 0.170.0'); process.exit(0); }
const i = a.indexOf('-o'); if (i < 0 || i + 1 >= a.length) process.exit(7);
const target = resolve(a[i + 1]);
const fixture = ${JSON.stringify(fixture)};
if (target === resolve(a[0]) || target === ${JSON.stringify(process.execPath)} || !target.startsWith(fixture + sep)) process.exit(7);
const parent = await realpath(dirname(target));
if (parent !== fixture && !parent.startsWith(fixture + sep)) process.exit(7);
await writeFile(target, 'FAKE JS OK', { flag: 'wx' });
`);
  const runtimeContents = await readFile(nodeExec);
  for (const args of [[], ['-o'], ['-o', nodeExec]]) {
    const rejected = spawnSync(nodeExec, [js, ...args], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8', timeout: 5000,
    });
    check(!rejected.error && rejected.status === 7, 'unsafe JS output rejected: ' + JSON.stringify({ args, status: rejected.status, signal: rejected.signal, error: rejected.error?.message, stderr: rejected.stderr }));
  }
  check(runtimeContents.equals(await readFile(nodeExec)), 'copied runtime unchanged');
  process.env.DSH_NODE_EXECUTABLE = '';
  apply(ctx, { codexBin: js });
  check((await execute()).output.includes('No Node runtime'), 'empty runtime rejected');
  process.env.DSH_NODE_EXECUTABLE = nodeExec;
  apply(ctx, { codexBin: js });
  const jsResult = await execute();
  check(jsResult.ok && jsResult.output === 'FAKE JS OK', 'js entry: ' + jsResult.output);
  check(jsResult.codexVersion === '0.170.0' && jsResult.warnings.length === 0, 'JS entry version through Node');
  // Only fake executables are used, including PATH and profile resolution.
  await script('printf "FAKE OK" > "$out"\n');
  const pathBin = join(fixture, 'codex');
  if (isWindows) {
    // The resolver currently looks for literal `codex`, not npm's codex.cmd.
    // A selected, non-executable file must fail rather than fall back to profile.
    await writeFixtureFile(pathBin, 'not a Windows executable');
  } else {
    await copyFile(fake, pathBin);
    await chmod(pathBin, 0o700);
  }
  const profileDir = join(fixture, 'profile');
  const profileEntry = join(profileDir, 'node_modules/@openai/codex/bin/codex.js');
  await mkdir(dirname(profileEntry), { recursive: true });
  await copyFile(js, profileEntry);
  const originalPath = process.env.PATH;
  process.env.PATH = fixture;
  process.env.DSH_PROFILE_DIR = profileDir;
  process.env.DSH_CODEX_BIN = js;
  apply(ctx, { codexBin: fake });
  check((await execute()).output === 'FAKE OK', 'config beats env');
  apply(ctx, {});
  check((await execute()).output === 'FAKE JS OK', 'env beats PATH');
  delete process.env.DSH_CODEX_BIN;
  const pathResult = await execute();
  check(isWindows ? !pathResult.ok && pathResult.output.includes('Cannot start Codex')
    : pathResult.output === 'FAKE OK', 'PATH beats profile without fallback');
  process.env.PATH = '';
  const profileFallback = await execute();
  check(profileFallback.ok && profileFallback.output === 'FAKE JS OK', 'profile fallback from DSH_PROFILE_DIR');
  delete process.env.DSH_PROFILE_DIR;
  const unconfigured = await execute();
  check(!unconfigured.ok && unconfigured.exitCode === -1 &&
    unconfigured.output.includes('找不到 Codex 入口，请设置 codexBin / DSH_CODEX_BIN / PATH'),
    'missing DSH_PROFILE_DIR and empty PATH returns readable error');
  const emptyProfile = join(fixture, 'empty-profile');
  await mkdir(emptyProfile, { recursive: true });
  process.env.DSH_PROFILE_DIR = emptyProfile;
  const missing = await execute();
  check(!missing.ok && missing.output.includes('Cannot use the profile Codex entry'), 'unusable profile entry');
  process.env.DSH_CODEX_BIN = join(fixture, 'missing');
  process.env.PATH = fixture;
  check(!(await execute()).ok, 'invalid explicit env never falls back');
  delete process.env.DSH_CODEX_BIN;
  if (originalPath === undefined) delete process.env.PATH;
  else process.env.PATH = originalPath;
  process.env.DSH_CODEX_SECURITY_MODE = 'workspace-write';
  apply(ctx, { codexBin: fake, screenshotDir: 'shots' });
  const conservative = await execute();
  const conservativeLog = await readFile(conservative.logPath, 'utf8');
  check(conservative.ok && conservative.securityMode === 'workspace-write' && conservative.securityNotice.includes('may fail'), 'conservative output');
  check(conservativeLog.includes('--sandbox\nworkspace-write') && !conservativeLog.includes('--dangerously-bypass'), 'conservative argv');
  await access(join(fixture, 'shots'));
  apply(ctx, { codexBin: fake, securityMode: 'bypass' });
  const bypass = await execute();
  check(bypass.securityMode === 'bypass' && (await readFile(bypass.logPath, 'utf8')).includes('--dangerously-bypass'), 'config mode beats env');
  apply(ctx, { codexBin: fake, securityMode: 'invalid' });
  check(!(await execute()).ok, 'invalid security mode');
  delete process.env.DSH_CODEX_SECURITY_MODE;
  console.log('OK: config > env > PATH > profile, missing configuration, bypass/workspace-write, screenshot override');
  console.log('OK: nonzero exit, fallback, truncation, missing entry, spawn failure, JS entry');
  for (const terminateGraceMs of [0, 1, 1000, 5000, 30000]) {
    apply(ctx, { codexBin: js, terminateGraceMs });
    const configuredGrace = await execute({ mode: 'text' });
    check(configuredGrace.ok && configuredGrace.output === 'FAKE JS OK' &&
      !/SIGTERM|SIGKILL/.test(configuredGrace.output), 'valid terminateGraceMs config: ' + terminateGraceMs);
  }
  for (const terminateGraceMs of [-1, 30001, 0.5, NaN, Infinity, '1000', '', null, false, {}, []]) {
    apply(ctx, { codexBin: js, terminateGraceMs });
    const invalidGrace = await execute({ mode: 'text' });
    check(!invalidGrace.ok && invalidGrace.exitCode === -1 && !invalidGrace.logPath &&
      invalidGrace.output.includes('terminateGraceMs'), 'invalid terminateGraceMs config: ' + String(terminateGraceMs));
  }
  for (const value of ['0', '1000', '30000']) {
    process.env.DSH_CODEX_TERMINATE_GRACE_MS = value;
    apply(ctx, { codexBin: js });
    check((await execute({ mode: 'text' })).ok, 'valid terminateGraceMs environment: ' + value);
  }
  for (const value of ['', ' ', '-1', '30001', '0.5', 'NaN', 'Infinity', 'invalid']) {
    process.env.DSH_CODEX_TERMINATE_GRACE_MS = value;
    apply(ctx, { codexBin: js });
    const invalidGrace = await execute({ mode: 'text' });
    check(!invalidGrace.ok && invalidGrace.exitCode === -1 && !invalidGrace.logPath &&
      invalidGrace.output.includes('terminateGraceMs'), 'invalid terminateGraceMs environment: ' + JSON.stringify(value));
  }
  process.env.DSH_CODEX_TERMINATE_GRACE_MS = 'invalid';
  apply(ctx, { codexBin: js, terminateGraceMs: 0 });
  check((await execute({ mode: 'text' })).ok, 'zero terminateGraceMs config beats invalid environment');
  process.env.DSH_CODEX_TERMINATE_GRACE_MS = '1000';
  apply(ctx, { codexBin: js, terminateGraceMs: -1 });
  check(!(await execute({ mode: 'text' })).ok, 'invalid terminateGraceMs config does not fall back to environment');
  delete process.env.DSH_CODEX_TERMINATE_GRACE_MS;
  console.log('OK: terminateGraceMs boundaries, invalid values, environment and config precedence');
  // Separate fake JS CLIs use only the disposable runtime and fixture directories.
  // Capture each registration explicitly so all real timeout cases can run together.
  const timeoutCase = async (label, graceful, config) => {
    const caseDir = join(fixture, 'timeout-' + label);
    await mkdir(caseDir);
    const entry = join(caseDir, 'fake-codex.js');
    await writeFixtureFile(entry, `
import { writeFileSync, writeSync } from 'node:fs';
if (process.env.ELECTRON_RUN_AS_NODE !== '1') process.exit(9);
if (process.argv[2] === '--version') { console.log('codex-cli 0.170.0'); process.exit(0); }
const outputIndex = process.argv.indexOf('-o');
if (outputIndex < 0 || !process.argv[outputIndex + 1]) process.exit(7);
process.on('SIGTERM', () => {
  writeSync(1, 'FAKE SIGTERM RECEIVED\\n');
  ${graceful ? `writeFileSync(process.argv[outputIndex + 1], 'FAKE GRACEFUL EXIT 0', { flag: 'wx' });
  writeSync(1, 'FAKE EXIT 0\\n');
  process.exit(0);` : '// Deliberately remain alive until the timeout escalates.'}
});
writeSync(1, 'FAKE READY\\n');
setInterval(() => {}, 1000);
`);
    let timeoutTool;
    apply({ tools: { register(def) {
      if (def.name === 'computer_use_codex') timeoutTool = def;
    } } }, { codexBin: entry, ...config });
    const timedOut = await execute({ mode: 'text', cwd: caseDir, timeoutSeconds: 30 }, timeoutTool);
    const processLog = await readFile(timedOut.logPath, 'utf8');
    check(!timedOut.ok && timedOut.exitCode === -1 && /timed out|超时/i.test(timedOut.output), label + ' timeout remains failure');
    check(processLog.includes('FAKE READY'), label + ' fake CLI started');
    return { result: timedOut, log: processLog };
  };
  const timeoutCases = await Promise.allSettled([
    timeoutCase('graceful', true, {}),
    timeoutCase('escalated', false, { terminateGraceMs: 1000 }),
    timeoutCase('immediate', false, { terminateGraceMs: 0 }),
  ]);
  for (const outcome of timeoutCases) if (outcome.status === 'rejected') throw outcome.reason;
  const [gracefulTimeout, escalatedTimeout, immediateTimeout] = timeoutCases.map(outcome => outcome.value);
  if (isWindows) {
    // taskkill (or child.kill fallback) does not deliver POSIX SIGTERM handlers.
    // Either exit during grace or forced termination is valid on Windows.
    for (const timedOut of [gracefulTimeout, escalatedTimeout]) {
      check(timedOut.result.durationMs >= 29000 && timedOut.result.durationMs < 40000,
        'Windows timeout remains bounded: ' + timedOut.result.durationMs);
      check(timedOut.result.output.includes('SIGTERM requested via taskkill /T'), 'Windows tree termination requested');
    }
  } else {
    check(gracefulTimeout.result.durationMs >= 29000 && gracefulTimeout.result.durationMs < 35000,
      'graceful timeout returns near 30 seconds: ' + gracefulTimeout.result.durationMs);
    check(gracefulTimeout.result.output.includes('SIGTERM requested') && !gracefulTimeout.result.output.includes('SIGKILL') &&
      gracefulTimeout.log.includes('FAKE SIGTERM RECEIVED') && gracefulTimeout.log.includes('FAKE EXIT 0'),
      'default grace allows SIGTERM handler to exit zero but preserves timeout failure');
    check(escalatedTimeout.result.durationMs >= 30900 && escalatedTimeout.result.durationMs < 37000,
      'escalated timeout returns near 31 seconds: ' + escalatedTimeout.result.durationMs);
    check(escalatedTimeout.result.output.includes('SIGTERM') && escalatedTimeout.result.output.includes('escalated to SIGKILL') &&
      escalatedTimeout.log.includes('FAKE SIGTERM RECEIVED') && !escalatedTimeout.log.includes('FAKE EXIT 0'),
      'ignored SIGTERM escalates to SIGKILL after configured grace');
  }
  check(immediateTimeout.result.durationMs >= 29000 && immediateTimeout.result.durationMs < 35000,
    'zero-grace timeout returns near 30 seconds: ' + immediateTimeout.result.durationMs);
  check(immediateTimeout.result.output.includes('SIGKILL requested directly') && !immediateTimeout.result.output.includes('SIGTERM') &&
    !immediateTimeout.log.includes('FAKE SIGTERM RECEIVED'), 'zero grace skips SIGTERM and requests SIGKILL directly');
  if (isWindows) check(immediateTimeout.result.output.includes('via taskkill /T /F'), 'Windows direct forced tree termination');
  console.log(isWindows
    ? 'OK: concurrent real Windows timeouts, taskkill grace/forced termination, direct forced termination'
    : 'OK: concurrent real timeouts, SIGTERM exit zero (~30s), SIGKILL escalation (~31s), direct SIGKILL (~30s)');
  const manifest = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
  check(!manifest.dependencies && manifest.dsh.bundle.patch === './cordis.patch.yml', 'manifest');
  check(manifest.name === 'dsh-tool-codex-computer-use' && !manifest.private && manifest.license === 'MIT' && manifest.engines.node === '>=20' && manifest.keywords.includes('dsh-plugin'), 'public metadata');
  for (const file of manifest.files) {
    if (!file.includes('*')) {
      await access(new URL(file, root));
      continue;
    }
    const parts = file.split('/');
    const pattern = parts.pop();
    const [prefix, suffix] = pattern.split('*');
    const entries = await readdir(new URL(parts.join('/') || './', root), { withFileTypes: true });
    check(entries.some(entry => entry.isFile() && entry.name.startsWith(prefix) && entry.name.endsWith(suffix) &&
      entry.name.length >= prefix.length + suffix.length), 'no packaged files match: ' + file);
  }
  const patch = await readFile(new URL('cordis.patch.yml', root), 'utf8');
  check(patch.includes("name: 'dsh-tool-codex-computer-use'") && !patch.includes('@local/'), 'published bundle target');
  for (const file of ['README.md', 'README.zh.md', 'docs/DETAIL.md']) {
    const doc = await readFile(new URL(file, root), 'utf8');
    check(doc.includes('47537') && doc.includes('calculator-7x8-56.png') && doc.includes('workspace-write'), 'documented evidence and security: ' + file);
  }
  console.log('OK: public metadata, packaged files, bundle target, documented real evidence');
  for (const lang of ['en', 'zh']) {
    const locale = JSON.parse(await readFile(new URL(`locale/${lang}.json`, root), 'utf8'));
    check(locale.meta.title && locale.meta.description, 'locale');
    await access(new URL(locale.meta.detail, root));
  }
  const icon = await readFile(new URL('icon.svg', root), 'utf8');
  check(Buffer.byteLength(icon) <= 262144 && icon.includes('<svg') && !/<image|<script|base64/.test(icon), 'icon');
  console.log('PASS');
} catch (error) {
  console.error('FAIL: ' + error.message);
  process.exitCode = 1;
} finally {
  globalThis.fetch = savedFetch;
  Date.now = savedNow;
  for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
  Object.assign(process.env, savedEnv);
  if (fixture) await rm(fixture, { recursive: true, force: true });
  for (const path of new Set(logs)) await rm(path, { recursive: true, force: true });
}
