import { describe, expect, it } from "vitest";

import {
  applyPushBatch,
  collectPullChanges,
  parsePullCursorParam,
  parsePushRequestBody,
  type SyncAggregateType,
  type SyncAppliedOpRecord,
  type SyncPullStore,
  type SyncPushOp,
  type SyncPushStore,
  type SyncStoredDoc,
} from "./core";

class MemorySyncStore implements SyncPushStore, SyncPullStore {
  private readonly appliedOps = new Map<string, SyncAppliedOpRecord>();
  private readonly docs = new Map<string, Map<string, SyncStoredDoc>>();
  private readonly seqs = new Map<string, number>();

  private tableKey(ownerId: string, aggregateType: SyncAggregateType): string {
    return `${ownerId}:${aggregateType}`;
  }

  async getAppliedOp(
    ownerId: string,
    opId: string,
  ): Promise<SyncAppliedOpRecord | null> {
    return this.appliedOps.get(`${ownerId}:${opId}`) ?? null;
  }

  async recordAppliedOp(record: SyncAppliedOpRecord): Promise<void> {
    this.appliedOps.set(`${record.ownerId}:${record.opId}`, record);
  }

  async getDoc(
    ownerId: string,
    aggregateType: SyncAggregateType,
    aggregateId: string,
  ): Promise<SyncStoredDoc | null> {
    return (
      this.docs.get(this.tableKey(ownerId, aggregateType))?.get(aggregateId) ??
      null
    );
  }

  async upsertDoc(
    aggregateType: SyncAggregateType,
    doc: SyncStoredDoc,
  ): Promise<void> {
    const key = this.tableKey(doc.ownerId, aggregateType);
    let table = this.docs.get(key);
    if (!table) {
      table = new Map();
      this.docs.set(key, table);
    }
    table.set(doc.id, { ...doc });
  }

  async nextSeq(ownerId: string): Promise<number> {
    const next = (this.seqs.get(ownerId) ?? 0) + 1;
    this.seqs.set(ownerId, next);
    return next;
  }

  async listDocsAfterSeq(
    ownerId: string,
    aggregateType: SyncAggregateType,
    cursor: number,
    limit: number,
  ): Promise<SyncStoredDoc[]> {
    const table = this.docs.get(this.tableKey(ownerId, aggregateType));
    if (!table) return [];
    return Array.from(table.values())
      .filter((doc) => doc.seq > cursor)
      .sort((a, b) => a.seq - b.seq)
      .slice(0, limit);
  }
}

describe("applyPushBatch", () => {
  it("writes new docs, bumps version, and assigns monotonic seq per owner", async () => {
    const store = new MemorySyncStore();
    const ops: SyncPushOp[] = [
      {
        opId: "op-1",
        aggregateType: "place",
        aggregateId: "place-1",
        baseVersion: 0,
        updatedAt: 1_000,
        doc: { id: "place-1", name: "Home Gym" },
      },
      {
        opId: "op-2",
        aggregateType: "workout",
        aggregateId: "wk-1",
        baseVersion: 0,
        updatedAt: 2_000,
        doc: { workout: { id: "wk-1" }, exercises: [] },
      },
    ];

    const response = await applyPushBatch(store, "user-a", ops, 5_000);
    expect(response.results).toEqual([
      {
        opId: "op-1",
        aggregateType: "place",
        aggregateId: "place-1",
        status: "applied",
        version: 1,
        seq: 1,
      },
      {
        opId: "op-2",
        aggregateType: "workout",
        aggregateId: "wk-1",
        status: "applied",
        version: 1,
        seq: 2,
      },
    ]);

    const place = await store.getDoc("user-a", "place", "place-1");
    expect(place).toEqual({
      id: "place-1",
      ownerId: "user-a",
      version: 1,
      seq: 1,
      updatedAt: 1_000,
      doc: { id: "place-1", name: "Home Gym" },
    });
  });

  it("dedupes repeated opId without incrementing version or seq or clobbering newer state", async () => {
    const store = new MemorySyncStore();
    const firstOp: SyncPushOp = {
      opId: "op-1",
      aggregateType: "place",
      aggregateId: "place-1",
      baseVersion: 0,
      updatedAt: 1_000,
      doc: { id: "place-1", name: "Original" },
    };
    const secondOp: SyncPushOp = {
      opId: "op-2",
      aggregateType: "place",
      aggregateId: "place-1",
      baseVersion: 1,
      updatedAt: 2_000,
      doc: { id: "place-1", name: "Updated" },
    };

    await applyPushBatch(store, "user-a", [firstOp, secondOp], 3_000);

    // Replay op-1 after op-2 has already moved the doc to version 2.
    const replay = await applyPushBatch(store, "user-a", [firstOp], 4_000);
    expect(replay.results).toEqual([
      {
        opId: "op-1",
        aggregateType: "place",
        aggregateId: "place-1",
        status: "duplicate",
        version: 1,
        seq: 1,
      },
    ]);

    const stored = await store.getDoc("user-a", "place", "place-1");
    expect(stored?.version).toBe(2);
    expect(stored?.seq).toBe(2);
    expect(stored?.doc).toEqual({ id: "place-1", name: "Updated" });
  });

  it("resolves version conflicts by letting newer updatedAt win", async () => {
    const store = new MemorySyncStore();
    await applyPushBatch(
      store,
      "user-a",
      [
        {
          opId: "op-v1",
          aggregateType: "template",
          aggregateId: "tpl-1",
          baseVersion: 0,
          updatedAt: 1_000,
          doc: { template: { id: "tpl-1", name: "V1" }, exercises: [] },
        },
        {
          opId: "op-v2",
          aggregateType: "template",
          aggregateId: "tpl-1",
          baseVersion: 1,
          updatedAt: 2_000,
          doc: { template: { id: "tpl-1", name: "V2" }, exercises: [] },
        },
      ],
      2_500,
    );

    // Stale offline edit (baseVersion 1 < server version 2) with older updatedAt loses.
    const stalePush = await applyPushBatch(
      store,
      "user-a",
      [
        {
          opId: "op-stale",
          aggregateType: "template",
          aggregateId: "tpl-1",
          baseVersion: 1,
          updatedAt: 1_500,
          doc: { template: { id: "tpl-1", name: "Stale" }, exercises: [] },
        },
      ],
      3_000,
    );
    expect(stalePush.results[0]).toEqual({
      opId: "op-stale",
      aggregateType: "template",
      aggregateId: "tpl-1",
      status: "conflict_server_won",
      version: 2,
      seq: 2,
    });
    expect((await store.getDoc("user-a", "template", "tpl-1"))?.doc).toEqual({
      template: { id: "tpl-1", name: "V2" },
      exercises: [],
    });

    // Replaying the stale opId returns duplicate.
    const staleReplay = await applyPushBatch(
      store,
      "user-a",
      [
        {
          opId: "op-stale",
          aggregateType: "template",
          aggregateId: "tpl-1",
          baseVersion: 1,
          updatedAt: 1_500,
          doc: { template: { id: "tpl-1", name: "Stale" }, exercises: [] },
        },
      ],
      3_100,
    );
    expect(staleReplay.results[0]?.status).toBe("duplicate");

    // Concurrent edit with baseVersion 1 < server version 2, but newer updatedAt, wins.
    const newerPush = await applyPushBatch(
      store,
      "user-a",
      [
        {
          opId: "op-newer",
          aggregateType: "template",
          aggregateId: "tpl-1",
          baseVersion: 1,
          updatedAt: 3_500,
          doc: { template: { id: "tpl-1", name: "Newer Wins" }, exercises: [] },
        },
      ],
      4_000,
    );
    expect(newerPush.results[0]).toEqual({
      opId: "op-newer",
      aggregateType: "template",
      aggregateId: "tpl-1",
      status: "applied",
      version: 3,
      seq: 3,
    });
    expect((await store.getDoc("user-a", "template", "tpl-1"))?.doc).toEqual({
      template: { id: "tpl-1", name: "Newer Wins" },
      exercises: [],
    });
  });

  it("isolates seq, appliedOps, and documents between owners", async () => {
    const store = new MemorySyncStore();
    const sharedOp: SyncPushOp = {
      opId: "op-same",
      aggregateType: "settings",
      aggregateId: "settings-1",
      baseVersion: 0,
      updatedAt: 1_000,
      doc: { defaultUnit: "lb" },
    };

    const resA = await applyPushBatch(store, "user-a", [sharedOp], 1_000);
    const resB = await applyPushBatch(store, "user-b", [sharedOp], 1_000);

    expect(resA.results[0]?.status).toBe("applied");
    expect(resA.results[0]?.seq).toBe(1);
    expect(resB.results[0]?.status).toBe("applied");
    expect(resB.results[0]?.seq).toBe(1);
  });
});

describe("collectPullChanges", () => {
  it("returns all items with seq > cursor sorted by seq, including tombstones", async () => {
    const store = new MemorySyncStore();
    await applyPushBatch(
      store,
      "user-a",
      [
        {
          opId: "op-1",
          aggregateType: "place",
          aggregateId: "p-1",
          baseVersion: 0,
          updatedAt: 1_000,
          doc: { id: "p-1", name: "Gym" },
        },
        {
          opId: "op-2",
          aggregateType: "workout",
          aggregateId: "wk-1",
          baseVersion: 0,
          updatedAt: 2_000,
          doc: { workout: { id: "wk-1" }, exercises: [] },
        },
        {
          opId: "op-3",
          aggregateType: "place",
          aggregateId: "p-1",
          baseVersion: 1,
          updatedAt: 3_000,
          deletedAt: 3_000,
          doc: { id: "p-1", name: "Gym", deletedAt: 3_000 },
        },
      ],
      4_000,
    );

    const fullPull = await collectPullChanges(store, "user-a", 0);
    expect(fullPull.hasMore).toBe(false);
    expect(fullPull.cursor).toBe(3);
    expect(
      fullPull.items.map((item) => [item.aggregateType, item.seq]),
    ).toEqual([
      ["workout", 2],
      ["place", 3],
    ]);
    expect(fullPull.items[1]?.deletedAt).toBe(3_000);

    const incremental = await collectPullChanges(store, "user-a", 2);
    expect(incremental.cursor).toBe(3);
    expect(incremental.items).toHaveLength(1);
    expect(incremental.items[0]?.aggregateId).toBe("p-1");
    expect(incremental.items[0]?.deletedAt).toBe(3_000);

    const caughtUp = await collectPullChanges(store, "user-a", 3);
    expect(caughtUp).toEqual({ cursor: 3, items: [], hasMore: false });
  });

  it("paginates cleanly when total items exceed limit", async () => {
    const store = new MemorySyncStore();
    await applyPushBatch(
      store,
      "user-a",
      [
        {
          opId: "op-1",
          aggregateType: "exercise",
          aggregateId: "e-1",
          baseVersion: 0,
          updatedAt: 100,
          doc: { id: "e-1" },
        },
        {
          opId: "op-2",
          aggregateType: "machine",
          aggregateId: "m-1",
          baseVersion: 0,
          updatedAt: 200,
          doc: { id: "m-1" },
        },
        {
          opId: "op-3",
          aggregateType: "settings",
          aggregateId: "user-a",
          baseVersion: 0,
          updatedAt: 300,
          doc: { ownerId: "user-a" },
        },
      ],
      400,
    );

    const page1 = await collectPullChanges(store, "user-a", 0, 2);
    expect(page1.hasMore).toBe(true);
    expect(page1.cursor).toBe(2);
    expect(page1.items.map((i) => i.seq)).toEqual([1, 2]);

    const page2 = await collectPullChanges(store, "user-a", page1.cursor, 2);
    expect(page2.hasMore).toBe(false);
    expect(page2.cursor).toBe(3);
    expect(page2.items.map((i) => i.seq)).toEqual([3]);
  });
});

describe("request parsing", () => {
  it("validates push request payloads", () => {
    expect(parsePushRequestBody(null).ok).toBe(false);
    expect(parsePushRequestBody({ ops: "bad" }).ok).toBe(false);
    expect(
      parsePushRequestBody({
        ops: [
          {
            opId: "op-1",
            aggregateType: "invalid",
            aggregateId: "x",
            baseVersion: 0,
            updatedAt: 1,
            doc: {},
          },
        ],
      }).ok,
    ).toBe(false);

    const valid = parsePushRequestBody({
      ops: [
        {
          opId: "op-1",
          aggregateType: "workout",
          aggregateId: "wk-1",
          baseVersion: 0,
          updatedAt: 1_000,
          deletedAt: null,
          doc: { workout: { id: "wk-1" } },
        },
      ],
    });
    expect(valid.ok).toBe(true);
    if (valid.ok) {
      expect(valid.value[0]?.deletedAt).toBeUndefined();
    }
  });

  it("validates pull cursor query parameter", () => {
    expect(parsePullCursorParam(null)).toEqual({ ok: true, value: 0 });
    expect(parsePullCursorParam("")).toEqual({ ok: true, value: 0 });
    expect(parsePullCursorParam("42")).toEqual({ ok: true, value: 42 });
    expect(parsePullCursorParam("-1").ok).toBe(false);
    expect(parsePullCursorParam("abc").ok).toBe(false);
    expect(parsePullCursorParam("1.5").ok).toBe(false);
  });
});
