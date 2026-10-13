import { describe, expect, it } from "vitest";

import { resolveBootstrappedExerciseNote } from "@/data/local/exercise-notes-sync";
import { resolveBootstrappedGeneralPreferences } from "@/data/local/preferences";
import type {
  LocalGeneralPreferencePatch,
  LocalGeneralPreferences,
} from "@/data/local/types";

type WorkoutSet = {
  id: string;
  weight: number;
  reps: number;
  completed: boolean;
};

type Session = {
  id: string;
  status: "in_progress" | "completed";
  sets: WorkoutSet[];
};

type Cloud = {
  prefs: LocalGeneralPreferences;
  notes: Map<string, string>;
  sessions: Map<string, Session>;
};

type Phone = {
  prefs: LocalGeneralPreferences;
  echoPending: LocalGeneralPreferencePatch | null;
  notes: Map<string, string>;
  noteOutbox: Map<string, string>;
  prefOutbox: LocalGeneralPreferences | null;
  sessions: Map<string, Session>;
  sessionOutbox: Map<string, Session>;
};

const DEFAULT_PREFS: LocalGeneralPreferences = {
  unit: "lb",
  barWeightLb: 45,
  barWeightKg: 20,
  activeWorkoutMode: "focus",
  restTimerEnabled: true,
};

function cloneSession(session: Session): Session {
  return {
    ...session,
    sets: session.sets.map((set) => ({ ...set })),
  };
}

function createCloud(): Cloud {
  return {
    prefs: { ...DEFAULT_PREFS },
    notes: new Map([["bench-press", "old cue"]]),
    sessions: new Map(),
  };
}

function createPhone(cloud: Cloud): Phone {
  return {
    prefs: { ...cloud.prefs },
    echoPending: null,
    notes: new Map(cloud.notes),
    noteOutbox: new Map(),
    prefOutbox: null,
    sessions: new Map(),
    sessionOutbox: new Map(),
  };
}

function applyBootstrap(phone: Phone, cloud: Cloud) {
  const resolved = resolveBootstrappedGeneralPreferences({
    pending: phone.echoPending,
    local: phone.prefs,
    cloud: cloud.prefs,
  });
  phone.prefs = resolved.next;
  phone.echoPending = resolved.remainingPending;
  for (const [slug, cloudNote] of cloud.notes) {
    const next = resolveBootstrappedExerciseNote({
      pending: phone.noteOutbox.has(slug),
      local: phone.notes.get(slug),
      cloud: cloudNote,
    });
    phone.notes.set(slug, next);
  }
}

function drain(phone: Phone, cloud: Cloud, maxOps: number) {
  let remaining = maxOps;
  if (remaining > 0 && phone.prefOutbox) {
    cloud.prefs = { ...phone.prefOutbox };
    phone.prefOutbox = null;
    remaining--;
  }
  for (const [slug, notes] of [...phone.noteOutbox]) {
    if (remaining <= 0) break;
    if (notes) cloud.notes.set(slug, notes);
    else cloud.notes.delete(slug);
    phone.noteOutbox.delete(slug);
    remaining--;
  }
  for (const [id, session] of [...phone.sessionOutbox]) {
    if (remaining <= 0) break;
    cloud.sessions.set(id, cloneSession(session));
    phone.sessionOutbox.delete(id);
    remaining--;
  }
}

function writePrefs(phone: Phone, patch: Partial<LocalGeneralPreferences>) {
  phone.prefs = { ...phone.prefs, ...patch };
  phone.echoPending = { ...phone.echoPending, ...patch };
  phone.prefOutbox = { ...phone.prefs };
}

function writeNote(phone: Phone, slug: string, notes: string) {
  phone.notes.set(slug, notes);
  phone.noteOutbox.set(slug, notes);
}

function writeSession(phone: Phone, session: Session) {
  phone.sessions.set(session.id, cloneSession(session));
  phone.sessionOutbox.set(session.id, cloneSession(session));
}

function expectPhoneMatchesCloud(phone: Phone, cloud: Cloud) {
  expect(phone.prefs).toEqual(cloud.prefs);
  expect(phone.echoPending).toBeNull();
  expect(phone.prefOutbox).toBeNull();
  expect(phone.noteOutbox.size).toBe(0);
  expect(phone.sessionOutbox.size).toBe(0);
  expect([...phone.notes.entries()].sort()).toEqual(
    [...cloud.notes.entries()].sort(),
  );
  expect([...phone.sessions.keys()].sort()).toEqual(
    [...cloud.sessions.keys()].sort(),
  );
  for (const [id, session] of phone.sessions) {
    expect(cloud.sessions.get(id)).toEqual(session);
  }
}

describe("flapping connectivity", () => {
  it("keeps local session, settings, and notes across offline/online flaps, then converges", () => {
    const cloud = createCloud();
    const phone = createPhone(cloud);
    const OFFLINE_MS = 5 * 60 * 1000;
    const ONLINE_MS = 60 * 1000;
    let clock = 0;

    for (let cycle = 0; cycle < 4; cycle++) {
      clock += OFFLINE_MS;
      const mode = cycle % 2 === 0 ? "list" : "focus";
      const barWeightLb = 35 + cycle;
      const note = `pause ${cycle} at ${clock}`;
      const weight = 185 + cycle;
      writePrefs(phone, { activeWorkoutMode: mode, barWeightLb });
      writeNote(phone, "bench-press", note);
      writeSession(phone, {
        id: "session-1",
        status: "in_progress",
        sets: [
          {
            id: "set-1",
            weight,
            reps: 5,
            completed: cycle > 0,
          },
        ],
      });

      applyBootstrap(phone, cloud);
      expect(phone.prefs.activeWorkoutMode).toBe(mode);
      expect(phone.prefs.barWeightLb).toBe(barWeightLb);
      expect(phone.notes.get("bench-press")).toBe(note);
      expect(phone.sessions.get("session-1")?.sets[0]?.weight).toBe(weight);

      clock += ONLINE_MS;
      drain(phone, cloud, 1);
      applyBootstrap(phone, cloud);
      expect(phone.prefs.activeWorkoutMode).toBe(mode);
      expect(phone.notes.get("bench-press")).toBe(note);
      expect(phone.sessions.get("session-1")?.sets[0]?.weight).toBe(weight);
    }

    drain(phone, cloud, 20);
    applyBootstrap(phone, cloud);
    expectPhoneMatchesCloud(phone, cloud);
    expect(cloud.prefs.activeWorkoutMode).toBe("focus");
    expect(cloud.notes.get("bench-press")).toMatch(/pause 3 at /);
    expect(cloud.sessions.get("session-1")?.sets[0]?.weight).toBe(188);
  });

  it("does not revert a List write when a stale Focus bootstrap arrives mid-workout", () => {
    const cloud = createCloud();
    const phone = createPhone(cloud);
    writeSession(phone, {
      id: "session-1",
      status: "in_progress",
      sets: [{ id: "set-1", weight: 225, reps: 3, completed: false }],
    });
    writePrefs(phone, { activeWorkoutMode: "list" });
    applyBootstrap(phone, cloud);
    expect(phone.prefs.activeWorkoutMode).toBe("list");
    expect(cloud.prefs.activeWorkoutMode).toBe("focus");

    drain(phone, cloud, 20);
    applyBootstrap(phone, cloud);
    expect(phone.prefs.activeWorkoutMode).toBe("list");
    expect(cloud.prefs.activeWorkoutMode).toBe("list");
    expect(phone.sessions.get("session-1")?.sets[0]?.weight).toBe(225);
  });
});
