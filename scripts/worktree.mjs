#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import {
  assertSlug,
  choosePorts,
  formatWorktreeSummary,
  isPortAvailable,
  isManagedSupervisorCommand,
  isOwnedConvexCommand,
  parseEnv,
  readManifests,
  renderManagedEnv,
  slugFromBranch,
  stableProjectId,
  withStateLock,
  writeJsonAtomic,
} from "./worktree-lib.mjs";

const command = process.argv[2];
const argument = process.argv[3];

try {
  switch (command) {
    case "create":
      await createWorktree(argument);
      break;
    case "prepare-current":
      await prepareCurrent();
      break;
    case "start":
      await startWorktree(argument);
      break;
    case "stop":
      await stopWorktree(argument);
      break;
    case "list":
      await listWorktrees();
      break;
    case "guard-current-remove":
      await guardCurrentRemove();
      break;
    case "remove":
      await removeWorktree(argument);
      break;
    default:
      usage();
      process.exitCode = 1;
  }
} catch (error) {
  console.error(`worktree:${command ?? "unknown"}: ${error.message}`);
  process.exitCode = 1;
}

async function createWorktree(rawSlug) {
  const slug = assertSlug(rawSlug ?? "");
  const context = repositoryContext();
  const branch = `wt/${slug}`;
  const path = join(context.primaryPath, ".worktrees", slug);

  if (
    git(["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], {
      allowFailure: true,
    }).status === 0
  ) {
    throw new Error(`Branch ${branch} already exists.`);
  }
  if (existsSync(path)) throw new Error(`Path ${path} already exists.`);

  const pathTemplate = `${context.primaryPath}/.worktrees/{{ (branch | sanitize)[3:] }}`;
  run(
    "wt",
    [
      "-y",
      "--config-set",
      `worktree-path=${JSON.stringify(pathTemplate)}`,
      "switch",
      "-c",
      branch,
      "--base",
      context.defaultBranch,
      "--no-cd",
    ],
    { cwd: context.primaryPath },
  );

  console.log(`\nCreated ${branch} at ${path}`);
  console.log(`Start it with: pnpm worktree:start ${slug}`);
}

async function prepareCurrent() {
  const context = repositoryContext();
  const slug = slugFromBranch(context.branch);
  const manifestPath = manifestPathFor(context.stateRoot, slug);

  const manifest = await withStateLock(context.stateRoot, async () => {
    const manifests = readManifests(context.stateRoot);
    const existing = manifests.find((entry) => entry.slug === slug);
    if (existing) {
      if (resolve(existing.worktreePath) !== context.currentPath) {
        throw new Error(`Manifest path mismatch for ${slug}.`);
      }
      return existing;
    }

    const ports = await choosePorts(manifests);
    const created = {
      schemaVersion: 1,
      projectId: stableProjectId(context.primaryPath),
      slug,
      branch: context.branch,
      baseCommit: git(["rev-parse", "HEAD"]).stdout,
      worktreePath: context.currentPath,
      ports,
      browserOrigin: `http://localhost:${ports.frontend}`,
      callbackUrl: `http://localhost:${ports.frontend}/callback`,
      backend: { type: "convex-local-anonymous", deployment: null },
      status: "reserved",
      createdAt: new Date().toISOString(),
    };
    writeJsonAtomic(manifestPath, created);
    return created;
  });

  run("pnpm", ["install", "--frozen-lockfile"], { cwd: context.currentPath });
  const secrets = loadDevelopmentSecrets(context.primaryPath);
  const envPath = join(context.currentPath, ".env.local");
  const existingEnv = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  const existingValues = parseEnv(existingEnv);
  validateExistingWorktreeEnv(manifest, existingValues);
  const managed = {
    CONVEX_DEPLOYMENT: existingValues.CONVEX_DEPLOYMENT,
    NEXT_PUBLIC_CONVEX_URL: existingValues.NEXT_PUBLIC_CONVEX_URL,
    NEXT_PUBLIC_CONVEX_SITE_URL: existingValues.NEXT_PUBLIC_CONVEX_SITE_URL,
    WORKOS_CLIENT_ID: secrets.WORKOS_CLIENT_ID,
    WORKOS_API_KEY: secrets.WORKOS_API_KEY,
    WORKOS_COOKIE_PASSWORD: secrets.WORKOS_COOKIE_PASSWORD,
    NEXT_PUBLIC_WORKOS_REDIRECT_URI: manifest.callbackUrl,
    MCP_API_KEY_PEPPER: secrets.MCP_API_KEY_PEPPER,
  };
  writeFileSync(envPath, renderManagedEnv("", managed), {
    mode: 0o600,
  });

  run(
    "wt",
    [
      "config",
      "state",
      "vars",
      "set",
      `runtime=${JSON.stringify({
        frontend: manifest.ports.frontend,
        convexCloud: manifest.ports.convexCloud,
        convexSite: manifest.ports.convexSite,
      })}`,
      `--branch=${context.branch}`,
    ],
    { cwd: context.currentPath },
  );

  const ready = {
    ...manifest,
    status: "ready",
    preparedAt: new Date().toISOString(),
  };
  writeJsonAtomic(manifestPath, ready);
  console.log(`Prepared ${context.branch}`);
  console.log(`App: ${ready.browserOrigin}`);
  console.log(
    `Convex Local: http://127.0.0.1:${ready.ports.convexCloud} / site ${ready.ports.convexSite}`,
  );
}

async function startWorktree(rawSlug) {
  const current = repositoryContext();
  const slug = rawSlug ? assertSlug(rawSlug) : slugFromBranch(current.branch);
  let manifest = loadManifest(current.stateRoot, slug);
  const worktreeScript = join(manifest.worktreePath, "scripts", "worktree.mjs");

  if (!existsSync(worktreeScript)) {
    throw new Error(
      `Worktree script is missing from ${manifest.worktreePath}.`,
    );
  }
  if (manifest.status === "reserved") {
    run("node", [worktreeScript, "prepare-current"], {
      cwd: manifest.worktreePath,
    });
    manifest = loadManifest(current.stateRoot, slug);
  }

  await recoverPreviousRuntime(current.stateRoot, manifest);

  const occupied = [];
  for (const [name, port] of Object.entries(manifest.ports)) {
    if (!(await isPortAvailable(port))) occupied.push(`${name}:${port}`);
  }
  if (occupied.length) {
    throw new Error(
      `Required ports are already listening: ${occupied.join(", ")}`,
    );
  }

  const lifecycle = createRuntimeLifecycle(current.stateRoot, manifest);
  try {
    const envPath = join(manifest.worktreePath, ".env.local");
    const localEnv = parseEnv(readFileSync(envPath, "utf8"));
    validateExistingWorktreeEnv(manifest, localEnv);
    const childEnv = {
      ...withoutRemoteRuntime(process.env),
      ...localEnv,
      CONVEX_AGENT_MODE: "anonymous",
    };
    const convexArgs = [
      "exec",
      "convex",
      "dev",
      "--local-cloud-port",
      String(manifest.ports.convexCloud),
      "--local-site-port",
      String(manifest.ports.convexSite),
    ];

    if (!manifest.backend?.deployment) {
      await runManagedCommand(
        lifecycle,
        "convex-initialize",
        "pnpm",
        [...convexArgs, "--once", "--skip-push"],
        {
          cwd: manifest.worktreePath,
          env: childEnv,
        },
      );
      await waitForLocalBackendToStop(manifest.ports.convexCloud, 10_000);
    }

    const configuredEnv = parseEnv(readFileSync(envPath, "utf8"));
    validateLocalConvexEnv(manifest, configuredEnv);
    if (
      manifest.backend?.deployment &&
      configuredEnv.CONVEX_DEPLOYMENT !== manifest.backend.deployment
    ) {
      throw new Error(
        "Convex deployment does not match the worktree manifest.",
      );
    }

    const backendEnv = [
      "WORKOS_CLIENT_ID",
      "WORKOS_API_KEY",
      "MCP_API_KEY_PEPPER",
    ]
      .map((key) => `${key}=${localEnv[key] ?? ""}`)
      .join("\n");
    await runManagedCommand(
      lifecycle,
      "convex-env",
      "pnpm",
      ["exec", "convex", "env", "set"],
      {
        cwd: manifest.worktreePath,
        env: { ...childEnv, ...configuredEnv },
        input: `${backendEnv}\n`,
      },
    );
    await waitForLocalBackendToStop(manifest.ports.convexCloud, 10_000);

    const projectedEnv = parseEnv(readFileSync(envPath, "utf8"));
    validateLocalConvexEnv(manifest, projectedEnv);
    const refreshedEnv = {
      ...childEnv,
      ...projectedEnv,
    };
    updateManifest(current.stateRoot, slug, (latest) => ({
      ...latest,
      backend: {
        ...latest.backend,
        deployment: projectedEnv.CONVEX_DEPLOYMENT,
      },
      lastStartedAt: new Date().toISOString(),
    }));

    console.log(`Starting ${manifest.branch} at ${manifest.browserOrigin}`);
    const convexChild = spawnManagedProcess(
      lifecycle,
      "convex",
      "pnpm",
      convexArgs,
      {
        cwd: manifest.worktreePath,
        env: refreshedEnv,
      },
    );
    const convexExit = waitForChildExit(convexChild);
    await Promise.race([
      waitForLocalBackendToStart(
        manifest.ports.convexCloud,
        projectedEnv.CONVEX_DEPLOYMENT.split(":", 2)[1],
        30_000,
      ),
      convexExit.then(({ exitCode }) => {
        throw new Error(
          `Convex Local exited before startup completed (${exitCode}).`,
        );
      }),
    ]);

    const frontendChild = spawnManagedProcess(
      lifecycle,
      "frontend",
      "pnpm",
      ["exec", "next", "dev", "-p", String(manifest.ports.frontend)],
      {
        cwd: manifest.worktreePath,
        env: refreshedEnv,
      },
    );
    const frontendExit = waitForChildExit(frontendChild);
    updateManifest(current.stateRoot, slug, (latest) => ({
      ...latest,
      status: "running",
    }));

    const { exitCode } = await Promise.race([convexExit, frontendExit]);
    if (!lifecycle.stopRequested) process.exitCode = exitCode;
  } finally {
    await lifecycle.stop();
  }
}

async function stopWorktree(rawSlug) {
  const current = repositoryContext();
  const slug = rawSlug ? assertSlug(rawSlug) : slugFromBranch(current.branch);
  const manifest = loadManifest(current.stateRoot, slug);
  const runtime = manifest.runtime;

  if (
    runtime?.supervisorPid &&
    isManagedSupervisor(runtime.supervisorPid, manifest)
  ) {
    signalProcess(
      runtime.supervisorPid,
      process.platform === "win32" ? "SIGTERM" : "SIGUSR2",
    );
    try {
      await waitForAllPortsAvailable(manifest, 10_000);
    } catch {
      await terminateOwnedRuntimeGroups(manifest);
    }
  } else {
    await terminateOwnedRuntimeGroups(manifest);
  }

  await recoverOwnedConvexBackend(manifest);
  const occupied = [];
  for (const [name, port] of Object.entries(manifest.ports)) {
    if (!(await isPortAvailable(port))) occupied.push(`${name}:${port}`);
  }
  if (occupied.length) {
    throw new Error(
      `Refusing to stop unowned listeners: ${occupied.join(", ")}.`,
    );
  }

  updateManifest(current.stateRoot, slug, (latest) => ({
    ...latest,
    status: "ready",
    runtime: undefined,
    lastStoppedAt: new Date().toISOString(),
  }));
  console.log(`Stopped ${manifest.branch}.`);
}

async function recoverPreviousRuntime(stateRoot, manifest) {
  if (
    manifest.runtime?.supervisorPid &&
    isManagedSupervisor(manifest.runtime.supervisorPid, manifest)
  ) {
    throw new Error(
      `${manifest.branch} is already running (supervisor ${manifest.runtime.supervisorPid}).`,
    );
  }

  await terminateOwnedRuntimeGroups(manifest);
  await recoverOwnedConvexBackend(manifest);
  updateManifest(stateRoot, manifest.slug, (latest) => ({
    ...latest,
    status: "ready",
    runtime: undefined,
  }));
}

function createRuntimeLifecycle(stateRoot, manifest) {
  const groups = new Map();
  let stopped = false;
  const lifecycle = {
    get stopRequested() {
      return this._stopRequested;
    },
    _stopRequested: false,
    add(kind, child) {
      const pgid = child.pid;
      groups.set(pgid, { kind, pgid });
      updateRuntimeManifest();
    },
    async finish(pgid) {
      await terminateProcessGroup(pgid);
      groups.delete(pgid);
      updateRuntimeManifest();
    },
    requestStop(signal = "SIGTERM", graceful = false) {
      if (!this._stopRequested) {
        this._stopRequested = true;
        if (!graceful) {
          process.exitCode =
            signal === "SIGINT" ? 130 : signal === "SIGHUP" ? 129 : 143;
        }
      }
      for (const { pgid } of groups.values()) signalProcessGroup(pgid, signal);
    },
    async stop() {
      if (stopped) return;
      stopped = true;
      for (const { pgid } of groups.values()) {
        signalProcessGroup(pgid, "SIGTERM");
      }
      await Promise.all(
        [...groups.keys()].map((pgid) => terminateProcessGroup(pgid)),
      );
      groups.clear();
      for (const [signal, handler] of signalHandlers) {
        process.removeListener(signal, handler);
      }
      updateManifest(stateRoot, manifest.slug, (latest) => ({
        ...latest,
        status: "ready",
        runtime: undefined,
        lastStoppedAt: new Date().toISOString(),
      }));
    },
  };

  const updateRuntimeManifest = () => {
    updateManifest(stateRoot, manifest.slug, (latest) => ({
      ...latest,
      status: "starting",
      runtime: {
        supervisorPid: process.pid,
        startedAt: latest.runtime?.startedAt ?? new Date().toISOString(),
        groups: [...groups.values()],
      },
    }));
  };
  const signalHandlers = new Map();
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    const handler = () => lifecycle.requestStop(signal);
    signalHandlers.set(signal, handler);
    process.on(signal, handler);
  }
  if (process.platform !== "win32") {
    const gracefulHandler = () => lifecycle.requestStop("SIGTERM", true);
    signalHandlers.set("SIGUSR2", gracefulHandler);
    process.on("SIGUSR2", gracefulHandler);
  }
  updateRuntimeManifest();
  return lifecycle;
}

function spawnManagedProcess(lifecycle, kind, executable, args, options = {}) {
  const hasInput = options.input !== undefined;
  const child = spawn(executable, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    detached: process.platform !== "win32",
    stdio: hasInput ? ["pipe", "inherit", "inherit"] : "inherit",
  });
  lifecycle.add(kind, child);
  if (hasInput) child.stdin.end(options.input);
  return child;
}

async function runManagedCommand(
  lifecycle,
  kind,
  executable,
  args,
  options = {},
) {
  const child = spawnManagedProcess(lifecycle, kind, executable, args, options);
  const { exitCode } = await waitForChildExit(child);
  await lifecycle.finish(child.pid);
  if (exitCode !== 0) {
    throw new Error(`${executable} ${args.join(" ")} failed (${exitCode}).`);
  }
}

async function terminateProcessGroup(pgid) {
  signalProcessGroup(pgid, "SIGTERM");
  const stopped = await waitForProcessGroupToStop(pgid, 3_000);
  if (stopped) return;
  signalProcessGroup(pgid, "SIGKILL");
  await waitForProcessGroupToStop(pgid, 2_000);
}

function signalProcessGroup(pgid, signal) {
  if (!Number.isInteger(pgid) || pgid <= 1) return;
  signalProcess(process.platform === "win32" ? pgid : -pgid, signal);
}

function signalProcess(pid, signal) {
  try {
    process.kill(pid, signal);
  } catch (error) {
    if (error?.code !== "ESRCH" && error?.code !== "EPERM") throw error;
  }
}

async function waitForProcessGroupToStop(pgid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      process.kill(process.platform === "win32" ? pgid : -pgid, 0);
    } catch (error) {
      if (error?.code === "ESRCH") return true;
      if (error?.code === "EPERM") return true;
    }
    await delay(100);
  }
  return false;
}

async function terminateOwnedRuntimeGroups(manifest) {
  for (const group of manifest.runtime?.groups ?? []) {
    if (!processGroupBelongsToWorktree(group, manifest)) continue;
    await terminateProcessGroup(group.pgid);
  }
}

function processGroupBelongsToWorktree(group, manifest) {
  const processes = processesInGroup(group.pgid);
  const worktreePath = resolve(manifest.worktreePath);
  return processes.some(({ command }) => {
    if (command.includes(worktreePath)) return true;
    return (
      group.kind?.startsWith("convex") &&
      isOwnedConvexCommand(command, manifest)
    );
  });
}

function processesInGroup(pgid) {
  const result = spawnSync("ps", ["-ax", "-o", "pid=,pgid=,command="], {
    encoding: "utf8",
  });
  if (result.status !== 0) return [];
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/))
    .filter((match) => match && Number(match[2]) === pgid)
    .map((match) => ({ pid: Number(match[1]), command: match[3] }));
}

function isManagedSupervisor(pid, manifest) {
  return isManagedSupervisorCommand(processCommand(pid), manifest.slug);
}

function processCommand(pid) {
  const result = spawnSync("ps", ["-p", String(pid), "-o", "command="], {
    encoding: "utf8",
  });
  return result.status === 0 ? result.stdout.trim() : "";
}

async function recoverOwnedConvexBackend(manifest) {
  const pid = listenerPid(manifest.ports.convexCloud);
  if (!pid) return;
  const command = processCommand(pid);
  if (!isOwnedConvexCommand(command, manifest)) return;

  console.log(
    `Stopping stale Convex Local process ${pid} for ${manifest.branch}.`,
  );
  signalProcess(pid, "SIGTERM");
  try {
    await waitForLocalBackendToStop(manifest.ports.convexCloud, 5_000);
  } catch {
    if (processCommand(pid) === command) signalProcess(pid, "SIGKILL");
    await waitForLocalBackendToStop(manifest.ports.convexCloud, 5_000);
  }
}

function listenerPid(port) {
  const result = spawnSync(
    "lsof",
    ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"],
    { encoding: "utf8" },
  );
  if (result.status !== 0) return null;
  const [first] = result.stdout.trim().split(/\s+/);
  const pid = Number(first);
  return Number.isInteger(pid) && pid > 1 ? pid : null;
}

async function waitForAllPortsAvailable(manifest, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const available = await Promise.all(
      Object.values(manifest.ports).map((port) => isPortAvailable(port)),
    );
    if (available.every(Boolean)) return;
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${manifest.branch} to stop.`);
}

function updateManifest(stateRoot, slug, update) {
  const latest = loadManifest(stateRoot, slug);
  writeJsonAtomic(manifestPathFor(stateRoot, slug), update(latest));
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function waitForChildExit(child) {
  return new Promise((resolveExit) => {
    let resolved = false;
    const resolveOnce = (result) => {
      if (resolved) return;
      resolved = true;
      resolveExit(result);
    };
    child.on("error", () =>
      resolveOnce({
        exitedChild: child,
        exitCode: 1,
      }),
    );
    child.on("exit", (code, signal) =>
      resolveOnce({
        exitedChild: child,
        exitCode: code ?? (signal ? 1 : 0),
      }),
    );
  });
}

async function listWorktrees() {
  const context = repositoryContext();
  const manifests = readManifests(context.stateRoot);
  if (!manifests.length) {
    console.log("No managed Workout worktrees.");
    return;
  }

  const summaries = [];
  for (const manifest of manifests) {
    const listening = [];
    for (const [name, port] of Object.entries(manifest.ports ?? {})) {
      if (!(await isPortAvailable(port))) listening.push(name);
    }
    summaries.push(
      formatWorktreeSummary(manifest, listening, context.primaryPath),
    );
  }
  console.log(
    `Managed Workout worktrees (${summaries.length})\n\n${summaries.join("\n\n")}`,
  );
}

async function guardCurrentRemove() {
  const context = repositoryContext();
  const slug = slugFromBranch(context.branch);
  const manifest = loadManifest(context.stateRoot, slug);
  const status = git(["status", "--porcelain"], {
    cwd: context.currentPath,
  }).stdout;
  if (status) throw new Error("Refusing to remove a dirty worktree.");

  const occupied = [];
  for (const port of Object.values(manifest.ports)) {
    if (!(await isPortAvailable(port))) occupied.push(port);
  }
  if (occupied.length) {
    throw new Error(
      `Refusing to remove a running worktree (ports ${occupied.join(", ")}).`,
    );
  }
}

async function removeWorktree(rawSlug) {
  const slug = assertSlug(rawSlug ?? "");
  const context = repositoryContext();
  const manifest = loadManifest(context.stateRoot, slug);
  if (resolve(manifest.worktreePath) === context.currentPath) {
    throw new Error(
      "Run removal from another checkout, not from the target worktree.",
    );
  }

  run(
    "node",
    [
      join(manifest.worktreePath, "scripts", "worktree.mjs"),
      "guard-current-remove",
    ],
    {
      cwd: manifest.worktreePath,
    },
  );
  run(
    "wt",
    ["-y", "remove", manifest.branch, "--no-delete-branch", "--foreground"],
    { cwd: context.primaryPath },
  );
  rmSync(manifestPathFor(context.stateRoot, slug), { force: true });
  run("wt", ["config", "state", "vars", "clear", "--branch", manifest.branch], {
    cwd: context.primaryPath,
    allowFailure: true,
  });
  console.log(
    `Removed worktree ${slug}; branch ${manifest.branch} was preserved.`,
  );
}

function loadDevelopmentSecrets(primaryPath) {
  const localPath = join(primaryPath, ".env.local");
  if (!existsSync(localPath)) {
    throw new Error(`Primary development secrets are missing at ${localPath}.`);
  }
  const local = parseEnv(readFileSync(localPath, "utf8"));
  const vercelPath = join(primaryPath, ".env.vercel");
  const vercel = existsSync(vercelPath)
    ? parseEnv(readFileSync(vercelPath, "utf8"))
    : {};

  if (!local.WORKOS_API_KEY?.startsWith("sk_test_")) {
    throw new Error("Refusing to project a non-Sandbox WorkOS API key.");
  }
  for (const key of [
    "WORKOS_CLIENT_ID",
    "WORKOS_API_KEY",
    "WORKOS_COOKIE_PASSWORD",
  ]) {
    if (!local[key]) throw new Error(`Primary .env.local is missing ${key}.`);
  }

  const pepper = local.MCP_API_KEY_PEPPER || vercel.MCP_API_KEY_PEPPER;
  if (!pepper) {
    throw new Error(
      "Primary development secrets are missing MCP_API_KEY_PEPPER.",
    );
  }

  return {
    WORKOS_CLIENT_ID: local.WORKOS_CLIENT_ID,
    WORKOS_API_KEY: local.WORKOS_API_KEY,
    WORKOS_COOKIE_PASSWORD: local.WORKOS_COOKIE_PASSWORD,
    MCP_API_KEY_PEPPER: pepper,
  };
}

function withoutRemoteRuntime(environment) {
  const sanitized = { ...environment };
  for (const key of [
    "CONVEX_DEPLOYMENT",
    "CONVEX_DEPLOY_KEY",
    "CONVEX_SELF_HOSTED_URL",
    "CONVEX_SELF_HOSTED_ADMIN_KEY",
    "NEXT_PUBLIC_CONVEX_URL",
    "NEXT_PUBLIC_CONVEX_SITE_URL",
    "VERCEL_OIDC_TOKEN",
  ]) {
    delete sanitized[key];
  }
  return sanitized;
}

function validateLocalConvexEnv(manifest, environment) {
  const expectedCloud = `http://127.0.0.1:${manifest.ports.convexCloud}`;
  const expectedSite = `http://127.0.0.1:${manifest.ports.convexSite}`;
  if (!environment.CONVEX_DEPLOYMENT?.startsWith("anonymous:")) {
    throw new Error("Convex did not configure an anonymous local deployment.");
  }
  if (environment.NEXT_PUBLIC_CONVEX_URL !== expectedCloud) {
    throw new Error(
      `Convex URL mismatch: expected ${expectedCloud}, received ${environment.NEXT_PUBLIC_CONVEX_URL ?? "missing"}.`,
    );
  }
  if (environment.NEXT_PUBLIC_CONVEX_SITE_URL !== expectedSite) {
    throw new Error(
      `Convex site URL mismatch: expected ${expectedSite}, received ${environment.NEXT_PUBLIC_CONVEX_SITE_URL ?? "missing"}.`,
    );
  }
}

function validateExistingWorktreeEnv(manifest, environment) {
  const allowed = new Set([
    "CONVEX_DEPLOYMENT",
    "NEXT_PUBLIC_CONVEX_URL",
    "NEXT_PUBLIC_CONVEX_SITE_URL",
    "WORKOS_CLIENT_ID",
    "WORKOS_API_KEY",
    "WORKOS_COOKIE_PASSWORD",
    "NEXT_PUBLIC_WORKOS_REDIRECT_URI",
    "MCP_API_KEY_PEPPER",
  ]);
  const unexpected = Object.keys(environment).filter(
    (key) => !allowed.has(key),
  );
  if (unexpected.length) {
    throw new Error(
      `Refusing unexpected worktree variables: ${unexpected.join(", ")}.`,
    );
  }

  for (const key of [
    "CONVEX_DEPLOY_KEY",
    "CONVEX_SELF_HOSTED_URL",
    "CONVEX_SELF_HOSTED_ADMIN_KEY",
    "VERCEL_OIDC_TOKEN",
  ]) {
    if (environment[key]) {
      throw new Error(
        `Refusing to start with forbidden worktree variable ${key}.`,
      );
    }
  }

  const convexSelection = [
    environment.CONVEX_DEPLOYMENT,
    environment.NEXT_PUBLIC_CONVEX_URL,
    environment.NEXT_PUBLIC_CONVEX_SITE_URL,
  ];
  if (convexSelection.some(Boolean))
    validateLocalConvexEnv(manifest, environment);
}

async function waitForLocalBackendToStop(cloudPort, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let availableSince = null;
  while (Date.now() < deadline) {
    let stopped = false;
    try {
      await fetch(`http://127.0.0.1:${cloudPort}/instance_name`);
    } catch {
      stopped = true;
    }
    if (stopped) {
      availableSince ??= Date.now();
      if (Date.now() - availableSince >= 1_000) return;
    } else {
      availableSince = null;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(
    `Timed out waiting for Convex Local on port ${cloudPort} to stop.`,
  );
}

async function waitForLocalBackendToStart(
  cloudPort,
  deploymentName,
  timeoutMs,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(
        `http://127.0.0.1:${cloudPort}/instance_name`,
      );
      if (response.ok && (await response.text()) === deploymentName) return;
    } catch {
      // The foreground Convex process is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(
    `Timed out waiting for Convex Local on port ${cloudPort} to start.`,
  );
}

function repositoryContext() {
  const currentPath = git(["rev-parse", "--show-toplevel"]).stdout;
  const commonDir = git([
    "rev-parse",
    "--path-format=absolute",
    "--git-common-dir",
  ]).stdout;
  const primaryPath = dirname(commonDir);
  const branch = git(["branch", "--show-current"]).stdout;
  const remoteHead = git(["symbolic-ref", "refs/remotes/origin/HEAD"], {
    allowFailure: true,
  }).stdout;
  const defaultBranch = remoteHead
    ? remoteHead.replace("refs/remotes/origin/", "")
    : "main";
  return {
    currentPath,
    commonDir,
    primaryPath,
    branch,
    defaultBranch,
    stateRoot: join(commonDir, "dev-setup"),
  };
}

function manifestPathFor(stateRoot, slug) {
  return join(stateRoot, "worktrees", `${slug}.json`);
}

function loadManifest(stateRoot, slug) {
  const path = manifestPathFor(stateRoot, slug);
  if (!existsSync(path)) {
    throw new Error(`No managed manifest exists for ${slug}.`);
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

function git(args, options = {}) {
  return run("git", args, { quiet: true, ...options });
}

function run(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    input: options.input,
    encoding: "utf8",
    stdio: options.input ? ["pipe", "pipe", "pipe"] : "pipe",
  });
  const stdout = result.stdout?.trim() ?? "";
  const stderr = result.stderr?.trim() ?? "";
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(
      `${executable} ${args.join(" ")} failed (${result.status ?? "signal"})${stderr ? `\n${stderr}` : ""}${stdout ? `\n${stdout}` : ""}`,
    );
  }
  if (!options.quiet) {
    if (stdout) console.log(stdout);
    if (stderr) console.error(stderr);
  }
  return { status: result.status ?? 1, stdout, stderr };
}

function usage() {
  console.log(`Usage:
  pnpm worktree:create <slug>
  pnpm worktree:list
  pnpm worktree:start [slug]
  pnpm worktree:stop [slug]
  pnpm worktree:remove <slug>`);
}
