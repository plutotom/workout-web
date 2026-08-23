import { normalizeSessionKind } from "./health_sessions";

export type PushSessionLookup<Id extends string = string> = {
  _id: Id;
  sessionKind?: string | null;
};

export type PushSessionResolution<Id extends string = string> =
  | { action: "insert" }
  | {
      action: "apply";
      targetId: Id;
      ignoreStale: boolean;
      deleteSessionId?: Id;
      unlinkSessionId?: Id;
    }
  | { action: "skip"; targetId: Id };

/**
 * Pick the server row a session snapshot should land on.
 *
 * A Health UUID is one workout. Reuse that row across devices, apply a tracked
 * log onto a Health summary, and never clobber a detailed workout with an
 * import stub. If the device's own session and a Health-keyed row both exist,
 * keep the device row and drop or unlink the extra Health row.
 */
export function resolvePushSessionTarget<Id extends string>(args: {
  existingByClient: PushSessionLookup<Id> | null;
  existingByExternal: PushSessionLookup<Id> | null;
  incomingKind?: string | null;
}): PushSessionResolution<Id> {
  const { existingByClient, existingByExternal } = args;
  const incomingKind = normalizeSessionKind(args.incomingKind);

  if (!existingByClient && !existingByExternal) {
    return { action: "insert" };
  }

  if (
    existingByClient &&
    existingByExternal &&
    existingByClient._id !== existingByExternal._id
  ) {
    const otherKind = normalizeSessionKind(existingByExternal.sessionKind);
    if (otherKind === "health_summary") {
      return {
        action: "apply",
        targetId: existingByClient._id,
        ignoreStale: false,
        deleteSessionId: existingByExternal._id,
      };
    }
    return {
      action: "apply",
      targetId: existingByClient._id,
      ignoreStale: false,
      unlinkSessionId: existingByExternal._id,
    };
  }

  if (!existingByClient && existingByExternal) {
    const existingKind = normalizeSessionKind(existingByExternal.sessionKind);
    if (existingKind === "tracked" && incomingKind === "health_summary") {
      return { action: "skip", targetId: existingByExternal._id };
    }
    return {
      action: "apply",
      targetId: existingByExternal._id,
      ignoreStale:
        existingKind === "health_summary" && incomingKind === "tracked",
    };
  }

  const target = existingByClient ?? existingByExternal;
  if (!target) return { action: "insert" };
  return {
    action: "apply",
    targetId: target._id,
    ignoreStale: false,
  };
}

export function resolveReceiptRemoteSessionId<Id extends string>(args: {
  existingByClient: { _id: Id } | null;
  existingByExternal: { _id: Id } | null;
}): Id | null {
  return args.existingByClient?._id ?? args.existingByExternal?._id ?? null;
}
