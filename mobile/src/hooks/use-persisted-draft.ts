import { useRef, useState } from "react";

/** A field draft whose successful write can precede the next SQLite read. */
export function usePersistedDraft(source: string) {
  const [draft, setDraft] = useState({
    source,
    baseline: source,
    value: source,
    pending: null as { sequence: number; value: string } | null,
  });
  const saveSequence = useRef(0);
  const acknowledgedSequence = useRef(0);

  if (draft.source !== source) {
    setDraft({
      source,
      baseline: source,
      value:
        !draft.pending && draft.value === draft.baseline ? source : draft.value,
      pending: draft.pending,
    });
  }

  function change(value: string) {
    setDraft((current) => ({ ...current, value }));
  }

  // Capture the submitted draft before awaiting persistence. A later edit or
  // save must survive this acknowledgement; a new source supersedes old reads.
  function prepareSave(savedValue = draft.value, submittedValue = draft.value) {
    const sequence = ++saveSequence.current;
    setDraft((current) => ({
      ...current,
      pending: { sequence, value: savedValue },
    }));
    return {
      acknowledge() {
        if (sequence < acknowledgedSequence.current) return;
        acknowledgedSequence.current = sequence;
        setDraft((current) => {
          const baseline =
            current.source === source ? savedValue : current.source;
          const pending =
            current.pending?.sequence === sequence ? null : current.pending;
          return {
            ...current,
            baseline,
            pending,
            value:
              !pending && current.value === submittedValue
                ? baseline
                : current.value,
          };
        });
      },
      reject() {
        setDraft((current) =>
          current.pending?.sequence === sequence
            ? { ...current, pending: null }
            : current,
        );
      },
    };
  }

  return {
    value: draft.value,
    baseline: draft.pending?.value ?? draft.baseline,
    dirty: draft.value !== (draft.pending?.value ?? draft.baseline),
    change,
    prepareSave,
  };
}
