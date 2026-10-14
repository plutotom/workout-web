import { useRef, useState } from "react";
import { Text, View } from "react-native";

import { Button, Card, Field, SectionTitle, Segmented } from "@/components/ui";
import { useLocalData, useLocalPreferences } from "@/data/local/provider";
import { colors } from "@/theme";

const unitOptions = [
  { value: "lb", label: "lb" },
  { value: "kg", label: "kg" },
] as const;
const modeOptions = [
  { value: "list", label: "List", hint: "All sets" },
  { value: "focus", label: "Focus", hint: "One at a time" },
] as const;
const restOptions = [
  { value: "on", label: "On" },
  { value: "off", label: "Off" },
] as const;

export function GeneralPreferencesCard() {
  // Local-first: SQLite is what the workout reads. The outbox pushes Convex
  // when the account is reachable, so this card works offline.
  const localPrefs = useLocalPreferences();
  const { setGeneralPreferences } = useLocalData();
  const unit = localPrefs?.unit;
  const mode = localPrefs?.activeWorkoutMode;
  const rest = localPrefs
    ? localPrefs.restTimerEnabled
      ? "on"
      : "off"
    : undefined;
  const savedBar =
    unit === "kg"
      ? localPrefs?.barWeightKg
      : unit === "lb"
        ? localPrefs?.barWeightLb
        : undefined;
  const [barDraft, setBarDraft] = useState<string | null>(null);
  const bar = barDraft ?? (savedBar !== undefined ? String(savedBar) : "");
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const saveSequence = useRef(0);
  const barSaveSequence = useRef(0);

  async function persist(change: () => Promise<unknown>) {
    const sequence = ++saveSequence.current;
    setSaveState("saving");
    try {
      await change();
      if (sequence === saveSequence.current) setSaveState("saved");
    } catch {
      if (sequence === saveSequence.current) setSaveState("error");
    }
  }

  function saveBarValue(value: string, clearDraft = false) {
    if (!unit) return;
    const sequence = ++barSaveSequence.current;
    const barWeight = value === "" ? 0 : Number(value);
    const unitToSave = unit;
    void persist(async () => {
      await setGeneralPreferences(
        unitToSave === "lb"
          ? { barWeightLb: barWeight }
          : { barWeightKg: barWeight },
      );
      if (clearDraft && sequence === barSaveSequence.current) {
        setBarDraft(null);
      }
    });
  }

  return (
    <Card>
      <SectionTitle title="General" />
      <View style={{ gap: 7 }}>
        <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>
          Default unit
        </Text>
        <Segmented
          value={unit}
          options={unitOptions}
          onChange={(next) => {
            barSaveSequence.current++;
            setBarDraft(null);
            void persist(async () => {
              await setGeneralPreferences({ unit: next });
            });
          }}
        />
        <Text style={{ color: colors.dim, fontSize: 11 }}>
          New weights are entered in this unit.
        </Text>
      </View>
      <View style={{ gap: 7 }}>
        <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>
          Active workout view
        </Text>
        <Segmented
          value={mode}
          options={modeOptions}
          onChange={(next) => {
            void persist(async () => {
              await setGeneralPreferences({ activeWorkoutMode: next });
            });
          }}
        />
        <Text style={{ color: colors.dim, fontSize: 11 }}>
          Switching during a workout is safe; both views share the same session.
        </Text>
      </View>
      <View style={{ gap: 7 }}>
        <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>
          Rest timer
        </Text>
        <Segmented
          value={rest}
          options={restOptions}
          onChange={(next) => {
            void persist(async () => {
              await setGeneralPreferences({
                restTimerEnabled: next === "on",
              });
            });
          }}
        />
      </View>
      <Field
        label={unit ? `Default bar (${unit})` : "Default bar"}
        value={bar}
        onChangeText={(value) => {
          const next = value.replace(/\D/g, "");
          setBarDraft(next);
          saveBarValue(next);
        }}
        onBlur={() => {
          saveBarValue(bar, true);
        }}
        keyboardType="number-pad"
      />
      <View style={{ flexDirection: "row", gap: 8 }}>
        {(unit === "kg" ? [15, 20] : [35, 45]).map((preset) => (
          <Button
            key={preset}
            label={`${preset} ${unit ?? "lb"}`}
            variant={Number(bar) === preset ? "primary" : "outline"}
            size="sm"
            onPress={() => {
              if (!unit) return;
              const next = String(preset);
              setBarDraft(next);
              saveBarValue(next, true);
            }}
          />
        ))}
      </View>
      <Text
        accessibilityLiveRegion="polite"
        style={{
          color: saveState === "error" ? colors.danger : colors.dim,
          fontSize: 11,
        }}
      >
        {saveState === "saving"
          ? "Saving changes…"
          : saveState === "error"
            ? "Couldn’t save on this phone. Try again."
            : saveState === "saved"
              ? "Saved on this phone. Syncs when you’re online."
              : "Changes save on this phone and sync when you’re online."}
      </Text>
    </Card>
  );
}
