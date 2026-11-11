import { useSQLiteContext } from "expo-sqlite";
import { readPlateComposition } from "@/data/local/plate-compositions";
import type { StoredPlateComposition } from "@shared/plates/composition";
import * as Haptics from "expo-haptics";
import { CircleDot, Minus, Plus, RotateCcw, X } from "lucide-react-native";
import { useEffect, useMemo, useReducer, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  createPlateSession,
  hasLoadedPlates,
  perSideFromPlateCounts,
  plateModeOptions,
  reducePlateSession,
  sessionConfig,
  sessionTotal,
  snapshotPlateComposition,
} from "@shared/plates/composition";
import {
  BAR_PRESETS,
  solveWeightToPlates,
  STANDARD_PLATES,
  type PlateConfig,
  type PlateCount,
  type Unit,
} from "@shared/plates/solver";
import { KeyboardAwareFooterLayout } from "@/components/keyboard-aware-scroll";
import { KeyboardStickyFooter } from "@/components/keyboard-sticky-footer";
import { Button, Field, Segmented } from "@/components/ui";
import { colors, radius, space } from "@/theme";

const barOptions = [
  { value: "on", label: "Include bar" },
  { value: "off", label: "Plates only" },
] as const;

function formatWeight(value: number) {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/0$/, "");
}

type PlateModalProps = {
  visible: boolean;
  target: number;
  unit: Unit;
  barWeight: number;
  compositionId?: string;
  setId?: string;
  exerciseSlug?: string;
  stored?: StoredPlateComposition | null;
  onClose: () => void;
  onApply?: (weight: number, composition: StoredPlateComposition) => void;
};

export function PlateModal(props: PlateModalProps) {
  return (
    <Modal
      visible={props.visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={props.onClose}
    >
      {props.visible ? (
        <StoredPlateCalculator
          key={JSON.stringify([
            props.setId,
            props.exerciseSlug,
            props.target,
            props.unit,
          ])}
          {...props}
        />
      ) : null}
    </Modal>
  );
}

function StoredPlateCalculator(props: PlateModalProps) {
  const db = useSQLiteContext();
  const [loaded, setLoaded] = useState<{
    key: string;
    stored: StoredPlateComposition | null;
  } | null>(null);
  const [loadError, setLoadError] = useState(false);
  const loadKey = JSON.stringify([
    props.setId,
    props.exerciseSlug,
    props.target,
    props.unit,
  ]);
  useEffect(() => {
    let cancelled = false;
    if (props.visible) {
      const read =
        props.setId && props.exerciseSlug
          ? readPlateComposition(db, props.setId, props.exerciseSlug)
          : Promise.resolve(null);
      void read
        .then((stored) => {
          if (!cancelled) setLoaded({ key: loadKey, stored });
        })
        .catch(() => {
          if (!cancelled) setLoadError(true);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [db, props.visible, props.setId, props.exerciseSlug, loadKey]);
  const { visible, compositionId, ...calculatorProps } = props;
  return (
    <>
      {visible && loaded?.key === loadKey ? (
        <PlateCalculator
          key={compositionId ?? "anonymous"}
          compositionId={compositionId}
          {...calculatorProps}
          stored={loaded.stored}
        />
      ) : visible ? (
        <View style={{ padding: space.lg }}>
          <Text>
            {loadError
              ? "Couldn’t load saved plates. Close and try again."
              : "Loading plates…"}
          </Text>
          <Button label="Close" onPress={props.onClose} />
        </View>
      ) : null}
    </>
  );
}

function PlateCalculator({
  target,
  unit,
  barWeight,
  stored,
  onClose,
  onApply,
}: Omit<PlateModalProps, "visible">) {
  const [state, dispatch] = useReducer(
    reducePlateSession,
    {
      target,
      unit,
      barWeight,
      stored,
    },
    createPlateSession,
  );
  const plates = STANDARD_PLATES[unit].plates;
  const config: PlateConfig = useMemo(
    () => sessionConfig(state, plates),
    [plates, state],
  );
  const numericTarget = Number(state.draft) || 0;
  const hasTarget = state.draft.trim() !== "";
  const result = useMemo(
    () => solveWeightToPlates(numericTarget, config),
    [config, numericTarget],
  );
  const selectedPlates = perSideFromPlateCounts(state.counts, config.plates);
  const builtTotal = sessionTotal(state, config.plates);
  const hasPlates = hasLoadedPlates(state.counts);
  const canApply =
    builtTotal > 0 &&
    (state.mode === "toWeight" || hasPlates || (hasTarget && result.feasible));
  const modeOptions = plateModeOptions(hasPlates || builtTotal > 0);

  function changeCount(plate: number, delta: number) {
    void Haptics.selectionAsync();
    dispatch({ type: "changeCount", plate, delta });
  }

  function selectBar(next: number) {
    void Haptics.selectionAsync();
    dispatch({ type: "selectBar", bar: next });
  }

  function dismiss() {
    onClose();
  }

  function closeWithResult() {
    if (onApply) onApply(builtTotal, snapshotPlateComposition(state));
    onClose();
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.safe}>
      <View style={styles.header}>
        <View style={styles.heading}>
          <View style={styles.iconWell}>
            <CircleDot color={colors.text} size={21} strokeWidth={2.4} />
          </View>
          <View>
            <Text style={styles.eyebrow}>BARBELL TOOL</Text>
            <Text style={styles.title}>Plate calculator</Text>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close plate calculator"
          hitSlop={10}
          onPress={dismiss}
          style={({ pressed }) => [styles.close, pressed && styles.pressed]}
        >
          <X color={colors.text} size={21} />
        </Pressable>
      </View>

      <Segmented
        value={state.mode}
        options={modeOptions}
        onChange={(mode) => dispatch({ type: "setMode", mode })}
      />

      <KeyboardAwareFooterLayout
        contentContainerStyle={styles.content}
        footer={
          <KeyboardStickyFooter style={styles.footer}>
            <View>
              <Text style={styles.footerLabel}>LOADED TOTAL</Text>
              <Text style={styles.footerTotal}>
                {formatWeight(builtTotal)}
                <Text style={styles.footerUnit}> {unit}</Text>
              </Text>
            </View>
            <Button
              style={{ minWidth: 148 }}
              size="lg"
              label={
                onApply ? `Use ${formatWeight(builtTotal)} ${unit}` : "Done"
              }
              disabled={onApply ? !canApply : false}
              onPress={onApply ? closeWithResult : dismiss}
            />
          </KeyboardStickyFooter>
        }
      >
        {state.mode === "toPlates" ? (
          <WeightToPlates
            draft={state.draft}
            setDraft={(value) => dispatch({ type: "setTargetDraft", value })}
            unit={unit}
            config={config}
            hasTarget={hasTarget}
            hasPlates={hasPlates}
            result={result}
            selectedPlates={selectedPlates}
            counts={state.counts}
            total={builtTotal}
            onChangeCount={changeCount}
          />
        ) : (
          <PlatesToWeight
            unit={unit}
            config={config}
            counts={state.counts}
            selectedPlates={selectedPlates}
            total={builtTotal}
            onChangeCount={changeCount}
            onClear={() => dispatch({ type: "clearPlates" })}
          />
        )}

        <View style={styles.controlCard}>
          <View>
            <Text style={styles.sectionLabel}>BAR SETUP</Text>
            <Text style={styles.controlHint}>
              Changes here apply to this calculation only.
            </Text>
          </View>
          <Segmented
            value={state.countBar ? "on" : "off"}
            options={barOptions}
            onChange={(next) =>
              dispatch({ type: "setCountBar", countBar: next === "on" })
            }
          />
          {state.countBar ? (
            <>
              <View style={styles.presetRow}>
                {BAR_PRESETS[unit].map((preset) => {
                  const active = state.bar === preset;
                  return (
                    <Pressable
                      key={preset}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={`${formatWeight(preset)} ${unit} bar`}
                      onPress={() => selectBar(preset)}
                      style={({ pressed }) => [
                        styles.preset,
                        active && styles.presetActive,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.presetText,
                          active && styles.presetTextActive,
                        ]}
                      >
                        {formatWeight(preset)} {unit}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Field
                label={`Custom bar (${unit})`}
                value={state.barDraft}
                keyboardType="decimal-pad"
                onChangeText={(value) =>
                  dispatch({ type: "setBarDraft", value })
                }
                selectTextOnFocus
              />
            </>
          ) : null}
        </View>
      </KeyboardAwareFooterLayout>
    </SafeAreaView>
  );
}

function WeightToPlates({
  draft,
  setDraft,
  unit,
  config,
  hasTarget,
  hasPlates,
  result,
  selectedPlates,
  counts,
  total,
  onChangeCount,
}: {
  draft: string;
  setDraft: (value: string) => void;
  unit: Unit;
  config: PlateConfig;
  hasTarget: boolean;
  hasPlates: boolean;
  result: ReturnType<typeof solveWeightToPlates>;
  selectedPlates: PlateCount[];
  counts: Record<number, number>;
  total: number;
  onChangeCount: (plate: number, delta: number) => void;
}) {
  const exact = !hasTarget || Math.abs(total - (Number(draft) || 0)) < 1e-6;
  return (
    <View style={{ gap: space.md }}>
      <Field
        label={`Target weight (${unit})`}
        value={draft}
        onChangeText={setDraft}
        keyboardType="decimal-pad"
        placeholder={unit === "lb" ? "225" : "100"}
        selectTextOnFocus
      />

      {!hasTarget && !hasPlates ? (
        <View style={styles.emptyResult}>
          <CircleDot color={colors.faint} size={28} />
          <Text style={styles.emptyTitle}>Enter the weight on the bar</Text>
          <Text style={styles.emptyCopy}>
            We’ll show exactly what to load on each side. Tap a plate to edit
            it.
          </Text>
        </View>
      ) : hasTarget && !result.feasible && !hasPlates ? (
        <View style={[styles.resultCard, styles.errorCard]}>
          <Text style={styles.sectionLabel}>BELOW BAR WEIGHT</Text>
          <Text style={styles.errorTitle}>
            The empty bar already weighs {formatWeight(config.bar)} {unit}.
          </Text>
          <Text style={styles.controlHint}>
            Choose a lighter bar or switch to plates only.
          </Text>
        </View>
      ) : (
        <View style={styles.resultCard}>
          <ResultHeader
            label={exact ? "EXACT LOAD" : "CLOSEST LOAD"}
            total={total}
            unit={unit}
            detail={
              exact
                ? `${formatWeight((total - config.bar) / 2)} ${unit} per side`
                : `${formatWeight(result.remainder)} ${unit} below target`
            }
          />
          <PlateStack
            plates={selectedPlates}
            unit={unit}
            onRemovePlate={onChangeCount}
          />
          <PlateChips
            plates={selectedPlates}
            unit={unit}
            onRemove={onChangeCount}
          />
          {selectedPlates.length === 0 ? (
            <Text style={styles.barOnly}>Empty bar—no plates needed.</Text>
          ) : (
            <Text style={styles.controlHint}>
              Tap a plate to take it off, then add a replacement below.
            </Text>
          )}
        </View>
      )}

      <View>
        <Text style={styles.sectionLabel}>PLATES PER SIDE</Text>
        <Text style={styles.controlHint}>
          Add or replace plates; we mirror the other side.
        </Text>
      </View>
      <View style={styles.plateGrid}>
        {config.plates.map((plate) => (
          <PlateStepper
            key={plate}
            plate={plate}
            unit={unit}
            count={counts[plate] ?? 0}
            onMinus={() => onChangeCount(plate, -1)}
            onPlus={() => onChangeCount(plate, 1)}
          />
        ))}
      </View>
    </View>
  );
}

function PlatesToWeight({
  unit,
  config,
  counts,
  selectedPlates,
  total,
  onChangeCount,
  onClear,
}: {
  unit: Unit;
  config: PlateConfig;
  counts: Record<number, number>;
  selectedPlates: PlateCount[];
  total: number;
  onChangeCount: (plate: number, delta: number) => void;
  onClear: () => void;
}) {
  const perSide = (total - config.bar) / 2;
  return (
    <View style={{ gap: space.md }}>
      <View style={styles.resultCard}>
        <ResultHeader
          label="BAR TOTAL"
          total={total}
          unit={unit}
          detail={`${formatWeight(config.bar)} ${unit} bar · ${formatWeight(perSide)} ${unit} per side`}
        />
        <PlateStack
          plates={selectedPlates}
          unit={unit}
          onRemovePlate={onChangeCount}
        />
        <PlateChips
          plates={selectedPlates}
          unit={unit}
          onRemove={onChangeCount}
        />
      </View>

      <View style={styles.builderHeader}>
        <View>
          <Text style={styles.sectionLabel}>PLATES PER SIDE</Text>
          <Text style={styles.controlHint}>
            Tap a plate to remove it, or use + / − to replace.
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear selected plates"
          disabled={selectedPlates.length === 0}
          onPress={onClear}
          style={({ pressed }) => [
            styles.clear,
            selectedPlates.length === 0 && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          <RotateCcw color={colors.dim} size={14} />
          <Text style={styles.clearText}>Reset</Text>
        </Pressable>
      </View>

      <View style={styles.plateGrid}>
        {config.plates.map((plate) => (
          <PlateStepper
            key={plate}
            plate={plate}
            unit={unit}
            count={counts[plate] ?? 0}
            onMinus={() => onChangeCount(plate, -1)}
            onPlus={() => onChangeCount(plate, 1)}
          />
        ))}
      </View>
    </View>
  );
}

function ResultHeader({
  label,
  total,
  unit,
  detail,
}: {
  label: string;
  total: number;
  unit: Unit;
  detail: string;
}) {
  return (
    <View style={styles.resultHeader}>
      <View>
        <Text style={styles.sectionLabel}>{label}</Text>
        <Text style={styles.resultDetail}>{detail}</Text>
      </View>
      <Text style={styles.resultTotal}>
        {formatWeight(total)}
        <Text style={styles.resultUnit}> {unit}</Text>
      </Text>
    </View>
  );
}

function PlateStack({
  plates,
  unit,
  onRemovePlate,
}: {
  plates: PlateCount[];
  unit: Unit;
  onRemovePlate?: (plate: number, delta: number) => void;
}) {
  const maxPlate = STANDARD_PLATES[unit].plates[0];
  const visualPlates = plates.flatMap(({ plate, count }) =>
    Array.from({ length: Math.min(count, 6) }, (_, index) => ({
      plate,
      key: `${plate}-${index}`,
    })),
  );
  return (
    <View style={styles.stackFrame}>
      <View style={styles.sleeveCap} />
      <View style={styles.sleeve} />
      <ScrollView
        horizontal
        bounces={false}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.stackPlates}
      >
        {visualPlates.map(({ plate, key }, index) => {
          const ratio = plate / maxPlate;
          const plateView = (
            <View
              style={[
                styles.visualPlate,
                {
                  height: 42 + ratio * 38,
                  backgroundColor: plateColors[index % plateColors.length],
                },
              ]}
            />
          );
          if (!onRemovePlate) {
            return (
              <View
                key={key}
                accessibilityLabel={`${formatWeight(plate)} ${unit} plate`}
              >
                {plateView}
              </View>
            );
          }
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${formatWeight(plate)} ${unit} plate from sleeve`}
              onPress={() => onRemovePlate(plate, -1)}
              style={({ pressed }) => pressed && styles.pressed}
            >
              {plateView}
            </Pressable>
          );
        })}
        {visualPlates.length === 0 ? (
          <Text style={styles.emptySleeve}>EMPTY SLEEVE</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

function PlateChips({
  plates,
  unit,
  onRemove,
}: {
  plates: PlateCount[];
  unit: Unit;
  onRemove?: (plate: number, delta: number) => void;
}) {
  if (!plates.length) return null;
  return (
    <View style={styles.chips}>
      {plates.map(({ plate, count }) => {
        const body = (
          <>
            <Text style={styles.chipValue}>
              {formatWeight(plate)} {unit}
            </Text>
            <Text style={styles.chipCount}>×{count}</Text>
          </>
        );
        if (!onRemove) {
          return (
            <View key={plate} style={styles.chip}>
              {body}
            </View>
          );
        }
        return (
          <Pressable
            key={plate}
            accessibilityRole="button"
            accessibilityLabel={`Tap to remove one ${formatWeight(plate)} ${unit} plate per side`}
            onPress={() => onRemove(plate, -1)}
            style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
          >
            {body}
          </Pressable>
        );
      })}
    </View>
  );
}

function PlateStepper({
  plate,
  unit,
  count,
  onMinus,
  onPlus,
}: {
  plate: number;
  unit: Unit;
  count: number;
  onMinus: () => void;
  onPlus: () => void;
}) {
  return (
    <View style={[styles.stepper, count > 0 && styles.stepperActive]}>
      <View style={styles.stepperTitle}>
        <View style={styles.miniPlate}>
          <Text style={styles.miniPlateText}>{formatWeight(plate)}</Text>
        </View>
        <Text style={styles.stepperUnit}>{unit}</Text>
      </View>
      <View style={styles.stepperControls}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove one ${formatWeight(plate)} ${unit} plate per side`}
          disabled={count === 0}
          onPress={onMinus}
          style={({ pressed }) => [
            styles.stepperButton,
            count === 0 && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          <Minus color={colors.text} size={17} />
        </Pressable>
        <Text style={styles.stepperCount}>{count}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Add one ${formatWeight(plate)} ${unit} plate per side`}
          onPress={onPlus}
          style={({ pressed }) => [
            styles.stepperButton,
            pressed && styles.pressed,
          ]}
        >
          <Plus color={colors.text} size={17} />
        </Pressable>
      </View>
    </View>
  );
}

const plateColors = [colors.g1, colors.g2, colors.g3, colors.g4];

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
  },
  header: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space.md,
  },
  heading: { flexDirection: "row", alignItems: "center", gap: 11 },
  iconWell: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: colors.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrow: {
    color: colors.dim,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.8,
  },
  title: {
    color: colors.text,
    fontSize: 23,
    fontWeight: "700",
    letterSpacing: -0.5,
    marginTop: 2,
  },
  close: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface2,
  },
  content: { paddingVertical: space.lg, paddingBottom: 30, gap: space.lg },
  resultCard: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.lg,
  },
  errorCard: { borderColor: `${colors.danger}66` },
  sectionLabel: {
    color: colors.dim,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.7,
  },
  resultHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: space.md,
  },
  resultTotal: {
    color: colors.text,
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: -1,
    fontVariant: ["tabular-nums"],
  },
  resultUnit: { color: colors.dim, fontSize: 13, fontWeight: "700" },
  resultDetail: { color: colors.dim, fontSize: 11, marginTop: 5 },
  errorTitle: { color: colors.text, fontSize: 18, fontWeight: "700" },
  stackFrame: {
    height: 92,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
  },
  sleeveCap: {
    width: 11,
    height: 52,
    backgroundColor: colors.g2,
    borderRadius: 3,
  },
  sleeve: { width: 52, height: 12, backgroundColor: colors.g3 },
  stackPlates: {
    minWidth: 150,
    height: 92,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingRight: 20,
  },
  visualPlate: {
    width: 14,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.28)",
  },
  emptySleeve: {
    color: colors.faint,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginLeft: 12,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.surface2,
    borderRadius: radius.sm,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  chipValue: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  chipCount: { color: colors.dim, fontSize: 11, fontWeight: "700" },
  barOnly: { color: colors.dim, fontSize: 12 },
  emptyResult: {
    minHeight: 218,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.input,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    padding: 30,
    gap: 8,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  emptyCopy: {
    color: colors.dim,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
  builderHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  clear: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 9,
  },
  clearText: { color: colors.dim, fontSize: 12, fontWeight: "600" },
  controlHint: {
    color: colors.dim,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
  },
  plateGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  stepper: {
    width: "48.5%",
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: 11,
    gap: 10,
  },
  stepperActive: { borderColor: colors.g3 },
  stepperTitle: { flexDirection: "row", alignItems: "center", gap: 7 },
  miniPlate: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 3,
    borderColor: colors.g2,
    alignItems: "center",
    justifyContent: "center",
  },
  miniPlateText: {
    color: colors.text,
    fontSize: 9,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  stepperUnit: { color: colors.dim, fontSize: 11, fontWeight: "700" },
  stepperControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  stepperButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.input,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperCount: {
    color: colors.text,
    minWidth: 24,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  controlCard: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.md,
  },
  presetRow: { flexDirection: "row", gap: 8 },
  preset: {
    flex: 1,
    minHeight: 39,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.input,
    alignItems: "center",
    justifyContent: "center",
  },
  presetActive: {
    backgroundColor: colors.action,
    borderColor: colors.action,
  },
  presetText: { color: colors.text, fontSize: 12, fontWeight: "700" },
  presetTextActive: { color: colors.actionText },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    minHeight: 84,
    paddingTop: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    backgroundColor: colors.bg,
  },
  footerLabel: {
    color: colors.dim,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  footerTotal: {
    color: colors.text,
    fontSize: 25,
    fontWeight: "800",
    letterSpacing: -0.7,
    fontVariant: ["tabular-nums"],
    marginTop: 2,
  },
  footerUnit: { color: colors.dim, fontSize: 12 },
  disabled: { opacity: 0.35 },
  pressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
});
