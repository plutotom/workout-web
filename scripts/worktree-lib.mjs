import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import net from "node:net";
import { dirname, join } from "node:path";

export const MANAGED_ENV_START = "# BEGIN WORKOUT WORKTREE MANAGED";
export const MANAGED_ENV_END = "# END WORKOUT WORKTREE MANAGED";
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function assertSlug(slug) {
  if (!SLUG_PATTERN.test(slug)) {
    throw new Error(
      `Invalid worktree slug "${slug}". Use lowercase letters, numbers, and single hyphens.`,
    );
  }
  return slug;
}

export function slugFromBranch(branch) {
  if (!branch.startsWith("wt/")) {
    throw new Error(`Expected a wt/<slug> branch, received "${branch}".`);
  }
  return assertSlug(branch.slice(3));
}

export function parseEnv(content) {
  const values = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index < 1) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value.replace(/\\n/g, "\n");
  }
  return values;
}

export function renderManagedEnv(existing, values) {
  const escapedStart = escapeRegExp(MANAGED_ENV_START);
  const escapedEnd = escapeRegExp(MANAGED_ENV_END);
  const withoutBlock = existing
    .replace(new RegExp(`${escapedStart}[\\s\\S]*?${escapedEnd}\\n?`, "g"), "")
    .trimEnd();
  const body = Object.entries(values)
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join("\n");
  return `${withoutBlock ? `${withoutBlock}\n\n` : ""}${MANAGED_ENV_START}\n${body}\n${MANAGED_ENV_END}\n`;
}

export async function choosePorts(manifests) {
  const reserved = new Set(
    manifests.flatMap((manifest) => Object.values(manifest.ports ?? {})),
  );

  for (let offset = 0; offset < 100; offset += 1) {
    const candidate = {
      frontend: 4271 + offset,
      convexCloud: 3210 + offset * 2,
      convexSite: 3211 + offset * 2,
    };
    const ports = Object.values(candidate);
    if (ports.some((port) => reserved.has(port))) continue;
    const availability = await Promise.all(ports.map(isPortAvailable));
    if (availability.every(Boolean)) return candidate;
  }

  throw new Error(
    "No free worktree port set is available in the configured ranges.",
  );
}

export function readManifests(stateRoot) {
  const directory = join(stateRoot, "worktrees");
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .map((name) => JSON.parse(readFileSync(join(directory, name), "utf8")));
}

export function writeJsonAtomic(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(temp, path);
}

export async function withStateLock(stateRoot, operation) {
  mkdirSync(stateRoot, { recursive: true });
  const lockPath = join(stateRoot, "lock");

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      mkdirSync(lockPath);
      writeJsonAtomic(join(lockPath, "owner.json"), {
        pid: process.pid,
        createdAt: new Date().toISOString(),
      });
      try {
        return await operation();
      } finally {
        rmSync(lockPath, { recursive: true, force: true });
      }
    } catch (error) {
      if (error?.code !== "EEXIST" || attempt > 0) throw error;
      const ownerPath = join(lockPath, "owner.json");
      const owner = existsSync(ownerPath)
        ? JSON.parse(readFileSync(ownerPath, "utf8"))
        : null;
      if (owner?.pid && processIsAlive(owner.pid)) {
        throw new Error(`Worktree state is locked by process ${owner.pid}.`);
      }
      rmSync(lockPath, { recursive: true, force: true });
    }
  }
}

export function stableProjectId(primaryPath) {
  return createHash("sha256").update(primaryPath).digest("hex").slice(0, 16);
}

export function isPortAvailable(port) {
  return Promise.all([
    isPortListening(port, "127.0.0.1"),
    isPortListening(port, "::1"),
  ]).then((listening) => {
    if (listening.some(Boolean)) return false;
    return canBindPort(port);
  });
}

function isPortListening(port, host) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    socket.unref();
    socket.setTimeout(250);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function canBindPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen({ port, exclusive: true }, () => {
      server.close(() => resolve(true));
    });
  });
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
