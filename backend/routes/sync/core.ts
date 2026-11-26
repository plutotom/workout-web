export const SYNC_AGGREGATE_TYPES = [
  "workout",
  "template",
  "exercise",
  "place",
  "machine",
  "settings",
] as const;

export type SyncAggregateType = (typeof SYNC_AGGREGATE_TYPES)[number];

export type SyncPushOp = {
  opId: string;
  aggregateType: SyncAggregateType;
  aggregateId: string;
  baseVersion: number;
  updatedAt: number;
  deletedAt?: number;
  doc: unknown;
};

export type SyncPushOpStatus = "applied" | "duplicate" | "conflict_server_won";

export type SyncPushResult = {
  opId: string;
  aggregateType: SyncAggregateType;
  aggregateId: string;
  status: SyncPushOpStatus;
  version: number;
  seq: number;
};

export type SyncPushResponse = {
  results: SyncPushResult[];
};

export type SyncStoredDoc = {
  id: string;
  ownerId: string;
  version: number;
  seq: number;
  updatedAt: number;
  deletedAt?: number;
  doc: unknown;
};

export type SyncAppliedOpRecord = {
  opId: string;
  ownerId: string;
  aggregateType: SyncAggregateType;
  aggregateId: string;
  version: number;
  seq: number;
  appliedAt: number;
};

export type SyncPullItem = {
  aggregateType: SyncAggregateType;
  aggregateId: string;
  version: number;
  seq: number;
  updatedAt: number;
  deletedAt?: number;
  doc: unknown;
};

export type SyncPullResponse = {
  cursor: number;
  items: SyncPullItem[];
  hasMore: boolean;
};

export interface SyncPushStore {
  getAppliedOp(
    ownerId: string,
    opId: string,
  ): Promise<SyncAppliedOpRecord | null>;
  recordAppliedOp(record: SyncAppliedOpRecord): Promise<void>;
  getDoc(
    ownerId: string,
    aggregateType: SyncAggregateType,
    aggregateId: string,
  ): Promise<SyncStoredDoc | null>;
  upsertDoc(
    aggregateType: SyncAggregateType,
    doc: SyncStoredDoc,
  ): Promise<void>;
  nextSeq(ownerId: string): Promise<number>;
}

export interface SyncPullStore {
  listDocsAfterSeq(
    ownerId: string,
    aggregateType: SyncAggregateType,
    cursor: number,
    limit: number,
  ): Promise<SyncStoredDoc[]>;
}

export const DEFAULT_PULL_LIMIT = 200;
export const MAX_PULL_LIMIT = 500;
export const MAX_PUSH_BATCH_SIZE = 200;

export function isSyncAggregateType(
  value: unknown,
): value is SyncAggregateType {
  return (
    typeof value === "string" &&
    (SYNC_AGGREGATE_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Pure push processor:
 * - Dedupes by `(ownerId, opId)` via `appliedOps`.
 * - If server `version > op.baseVersion`, newer `updatedAt` wins.
 * - Otherwise writes the doc, increments `version`, assigns the next per-owner `seq`,
 *   and records the `opId`.
 */
export async function applyPushBatch(
  store: SyncPushStore,
  ownerId: string,
  ops: readonly SyncPushOp[],
  now: number,
): Promise<SyncPushResponse> {
  const results: SyncPushResult[] = [];

  for (const op of ops) {
    const previouslyApplied = await store.getAppliedOp(ownerId, op.opId);
    if (previouslyApplied) {
      results.push({
        opId: op.opId,
        aggregateType: previouslyApplied.aggregateType,
        aggregateId: previouslyApplied.aggregateId,
        status: "duplicate",
        version: previouslyApplied.version,
        seq: previouslyApplied.seq,
      });
      continue;
    }

    const existing = await store.getDoc(
      ownerId,
      op.aggregateType,
      op.aggregateId,
    );

    if (
      existing &&
      existing.version > op.baseVersion &&
      op.updatedAt <= existing.updatedAt
    ) {
      await store.recordAppliedOp({
        opId: op.opId,
        ownerId,
        aggregateType: op.aggregateType,
        aggregateId: op.aggregateId,
        version: existing.version,
        seq: existing.seq,
        appliedAt: now,
      });
      results.push({
        opId: op.opId,
        aggregateType: op.aggregateType,
        aggregateId: op.aggregateId,
        status: "conflict_server_won",
        version: existing.version,
        seq: existing.seq,
      });
      continue;
    }

    const nextVersion = (existing?.version ?? 0) + 1;
    const seq = await store.nextSeq(ownerId);

    const stored: SyncStoredDoc = {
      id: op.aggregateId,
      ownerId,
      version: nextVersion,
      seq,
      updatedAt: op.updatedAt,
      ...(op.deletedAt !== undefined ? { deletedAt: op.deletedAt } : {}),
      doc: op.doc,
    };

    await store.upsertDoc(op.aggregateType, stored);
    await store.recordAppliedOp({
      opId: op.opId,
      ownerId,
      aggregateType: op.aggregateType,
      aggregateId: op.aggregateId,
      version: nextVersion,
      seq,
      appliedAt: now,
    });

    results.push({
      opId: op.opId,
      aggregateType: op.aggregateType,
      aggregateId: op.aggregateId,
      status: "applied",
      version: nextVersion,
      seq,
    });
  }

  return { results };
}

/**
 * Pure pull collector:
 * Collects all documents across all synced tables with `seq > cursor` (tombstones included),
 * sorts by ascending `seq`, and returns a bounded page with `hasMore`.
 */
export async function collectPullChanges(
  store: SyncPullStore,
  ownerId: string,
  cursor: number,
  limit: number = DEFAULT_PULL_LIMIT,
): Promise<SyncPullResponse> {
  const safeCursor =
    Number.isFinite(cursor) && cursor >= 0 ? Math.floor(cursor) : 0;
  const safeLimit = Math.min(
    MAX_PULL_LIMIT,
    Math.max(
      1,
      Number.isFinite(limit) ? Math.floor(limit) : DEFAULT_PULL_LIMIT,
    ),
  );
  // Request one extra per table so we can accurately determine `hasMore`.
  const perTableLimit = safeLimit + 1;

  const perTableResults = await Promise.all(
    SYNC_AGGREGATE_TYPES.map(async (aggregateType) => {
      const docs = await store.listDocsAfterSeq(
        ownerId,
        aggregateType,
        safeCursor,
        perTableLimit,
      );
      return docs.map(
        (row): SyncPullItem => ({
          aggregateType,
          aggregateId: row.id,
          version: row.version,
          seq: row.seq,
          updatedAt: row.updatedAt,
          ...(row.deletedAt !== undefined ? { deletedAt: row.deletedAt } : {}),
          doc: row.doc,
        }),
      );
    }),
  );

  const merged = perTableResults.flat().sort((a, b) => a.seq - b.seq);
  const hasMore = merged.length > safeLimit;
  const page = hasMore ? merged.slice(0, safeLimit) : merged;
  const nextCursor = page.length > 0 ? page[page.length - 1]!.seq : safeCursor;

  return {
    cursor: nextCursor,
    items: page,
    hasMore,
  };
}

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export function parsePushRequestBody(body: unknown): ParseResult<SyncPushOp[]> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Request body must be a JSON object" };
  }
  const rawOps = (body as { ops?: unknown }).ops;
  if (!Array.isArray(rawOps)) {
    return { ok: false, error: "Request body must include an 'ops' array" };
  }
  if (rawOps.length > MAX_PUSH_BATCH_SIZE) {
    return {
      ok: false,
      error: `Batch exceeds maximum of ${MAX_PUSH_BATCH_SIZE} operations`,
    };
  }

  const parsed: SyncPushOp[] = [];
  for (let i = 0; i < rawOps.length; i++) {
    const item = rawOps[i];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { ok: false, error: `ops[${i}] must be an object` };
    }
    const row = item as Record<string, unknown>;
    if (typeof row.opId !== "string" || row.opId.trim().length === 0) {
      return { ok: false, error: `ops[${i}].opId must be a non-empty string` };
    }
    if (!isSyncAggregateType(row.aggregateType)) {
      return {
        ok: false,
        error: `ops[${i}].aggregateType is invalid`,
      };
    }
    if (
      typeof row.aggregateId !== "string" ||
      row.aggregateId.trim().length === 0
    ) {
      return {
        ok: false,
        error: `ops[${i}].aggregateId must be a non-empty string`,
      };
    }
    if (
      typeof row.baseVersion !== "number" ||
      !Number.isInteger(row.baseVersion) ||
      row.baseVersion < 0
    ) {
      return {
        ok: false,
        error: `ops[${i}].baseVersion must be a non-negative integer`,
      };
    }
    if (typeof row.updatedAt !== "number" || !Number.isFinite(row.updatedAt)) {
      return {
        ok: false,
        error: `ops[${i}].updatedAt must be a finite number`,
      };
    }
    if (
      row.deletedAt !== undefined &&
      row.deletedAt !== null &&
      (typeof row.deletedAt !== "number" || !Number.isFinite(row.deletedAt))
    ) {
      return {
        ok: false,
        error: `ops[${i}].deletedAt must be a finite number when provided`,
      };
    }
    if (row.doc === undefined) {
      return { ok: false, error: `ops[${i}].doc is required` };
    }

    parsed.push({
      opId: row.opId,
      aggregateType: row.aggregateType,
      aggregateId: row.aggregateId,
      baseVersion: row.baseVersion,
      updatedAt: row.updatedAt,
      ...(typeof row.deletedAt === "number"
        ? { deletedAt: row.deletedAt }
        : {}),
      doc: row.doc,
    });
  }

  return { ok: true, value: parsed };
}

export function parsePullCursorParam(raw: string | null): ParseResult<number> {
  if (raw === null || raw.trim() === "") {
    return { ok: true, value: 0 };
  }
  const num = Number(raw);
  if (!Number.isInteger(num) || num < 0) {
    return { ok: false, error: "cursor must be a non-negative integer" };
  }
  return { ok: true, value: num };
}
