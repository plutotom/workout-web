import {
  Check,
  ChevronDown,
  ChevronRight,
  Trash2,
  X,
} from "lucide-react-native";
import { useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { KeyboardStickyFooter } from "@/components/keyboard-sticky-footer";
import { Button, Card, Field } from "@/components/ui";
import { useCatalog } from "@/providers/catalog-provider";
import { colors, radius } from "@/theme";
import {
  createNoteConversionPreview,
  reviewNoteConversionPreview,
  type NoteConversionPreview,
  type NotePreviewExercise,
  type NotePreviewSet,
} from "@shared/note-conversion-preview";
import type { NoteUnit } from "@shared/note-workouts";
import { convertWeight } from "@shared/workout-export";

/** Reviews a disposable draft; only explicit confirmation saves its sets. */
export function NoteConversionPreviewSheet({
  noteBody,
  noteUnit,
  targetUnit = noteUnit ?? "lb",
  onConfirm,
  onClose,
}: {
  noteBody: string;
  noteUnit?: NoteUnit | null;
  targetUnit?: NoteUnit;
  onConfirm: (
    draft: NoteConversionPreview,
    targetUnit: NoteUnit,
  ) => Promise<void>;
  onClose: () => void;
}) {
  const catalog = useCatalog();
  const [draft, setDraft] = useState<NoteConversionPreview | null>(() =>
    noteUnit
      ? createNoteConversionPreview(noteBody, noteUnit, catalog.all)
      : null,
  );
  const [edited, setEdited] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [visibleLineCount, setVisibleLineCount] = useState(50);
  const nextId = useRef(0);
  const review = useMemo(
    () =>
      draft ? reviewNoteConversionPreview(draft, catalog.all, targetUnit) : [],
    [draft, catalog, targetUnit],
  );
  const selectedGroup = draft?.exercises.find(
    (group) => group.id === selecting,
  );
  const choices = useMemo(() => {
    const suggestions = new Set(selectedGroup?.candidates);
    return [...catalog.search(query, "all")].sort(
      (a, b) =>
        Number(suggestions.has(b.slug)) - Number(suggestions.has(a.slug)),
    );
  }, [catalog, query, selectedGroup]);

  function change(
    update: (current: NoteConversionPreview) => NoteConversionPreview,
  ) {
    setDraft((current) => (current ? update(current) : current));
    setEdited(true);
    setError(null);
  }

  function changeGroup(
    id: string,
    update: (group: NotePreviewExercise) => NotePreviewExercise,
  ) {
    change((current) => ({
      ...current,
      exercises: current.exercises.map((group) =>
        group.id === id ? update(group) : group,
      ),
    }));
  }

  function close() {
    if (saving) return;
    Keyboard.dismiss();
    if (selecting !== null) {
      setSelecting(null);
      return;
    }
    if (!edited) return onClose();
    Alert.alert(
      "Discard preview edits?",
      "Your saved workout and original note stay the same.",
      [
        { text: "Keep reviewing", style: "cancel" },
        { text: "Discard edits", style: "destructive", onPress: onClose },
      ],
    );
  }

  async function confirm() {
    if (!draft || review.length || saving) return;
    setSaving(true);
    setError(null);
    Keyboard.dismiss();
    try {
      await onConfirm(draft, targetUnit);
      onClose();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Couldn’t convert your note. Try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  function chooseExercise(id: string) {
    Keyboard.dismiss();
    setQuery("");
    setSelecting(id);
  }

  function addSet(groupId: string) {
    if (!draft) return;
    const id = `manual-set-${nextId.current++}`;
    const set: NotePreviewSet = {
      id,
      reps: "",
      weight: "",
      unit: draft.noteUnit,
      failedAttempt: false,
      weightNotation: "plain",
      source: { line: 0, text: "Added in preview" },
    };
    changeGroup(groupId, (group) => ({ ...group, sets: [...group.sets, set] }));
  }

  function addExercise() {
    const id = `manual-exercise-${nextId.current++}`;
    change((current) => ({
      ...current,
      exercises: [
        ...current.exercises,
        { id, name: "", slug: null, candidates: [], sets: [] },
      ],
    }));
    chooseExercise(id);
  }

  const setCount =
    draft?.exercises.reduce((sum, group) => sum + group.sets.length, 0) ?? 0;
  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={close}
    >
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <View style={styles.header}>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={styles.eyebrow}>NOTE → SETS · PRO</Text>
            <Text style={styles.title}>
              {selecting !== null ? "Choose exercise" : "Conversion preview"}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              selecting !== null ? "Back to preview" : "Close preview"
            }
            onPress={close}
            disabled={saving}
            style={styles.iconButton}
          >
            <X size={21} color={colors.dim} />
          </Pressable>
        </View>
        {selecting !== null ? (
          <>
            <View style={{ paddingHorizontal: 16, gap: 12, paddingBottom: 12 }}>
              <Text style={styles.description}>
                Match “{selectedGroup?.name || "New exercise"}” to one of your
                lifts.
              </Text>
              <Field
                value={query}
                onChangeText={setQuery}
                placeholder="Search your exercises"
                accessibilityLabel="Search exercises"
                autoFocus
                autoCorrect={false}
              />
            </View>
            <FlatList
              data={choices}
              keyExtractor={(exercise) => exercise.slug}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              contentContainerStyle={{
                paddingHorizontal: 16,
                paddingBottom: 16,
              }}
              ListEmptyComponent={
                <Text style={styles.description}>
                  No matching exercises. Try another name.
                </Text>
              }
              renderItem={({ item }) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Choose ${item.name}`}
                  onPress={() => {
                    changeGroup(selecting, (group) => ({
                      ...group,
                      slug: item.slug,
                    }));
                    Keyboard.dismiss();
                    setSelecting(null);
                  }}
                  style={styles.choice}
                >
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={styles.exerciseName}>{item.name}</Text>
                    {selectedGroup?.candidates.includes(item.slug) ? (
                      <Text style={styles.source}>
                        Possible match from your note
                      </Text>
                    ) : null}
                  </View>
                  {item.slug === selectedGroup?.slug ? (
                    <Check size={20} color={colors.success} />
                  ) : (
                    <ChevronRight size={18} color={colors.faint} />
                  )}
                </Pressable>
              )}
            />
          </>
        ) : (
          <ScrollView
            pointerEvents={saving ? "none" : "auto"}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            automaticallyAdjustKeyboardInsets
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.description}>
              Review the lifts and completed sets from your note. Confirm to log
              them in this workout and keep your original note.
            </Text>
            <Card style={{ gap: 12 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  showOriginal ? "Hide original note" : "View original note"
                }
                accessibilityState={{ expanded: showOriginal }}
                onPress={() => setShowOriginal((value) => !value)}
                style={styles.row}
              >
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.exerciseName}>Original note</Text>
                  <Text style={styles.source}>
                    {draft?.noteUnit
                      ? `Written in ${draft.noteUnit}`
                      : "Written unit needs confirmation"}
                  </Text>
                </View>
                {showOriginal ? (
                  <ChevronDown color={colors.dim} size={20} />
                ) : (
                  <ChevronRight color={colors.dim} size={20} />
                )}
              </Pressable>
              {showOriginal ? (
                <Text selectable style={styles.note}>
                  {noteBody}
                </Text>
              ) : null}
            </Card>
            {!draft ? (
              <Card style={{ gap: 12 }}>
                <Text style={styles.exerciseName}>
                  Which unit did you write in?
                </Text>
                <Text style={styles.description}>
                  This note has no saved unit. Choose the unit you used for its
                  numbers.
                </Text>
                <View style={styles.row}>
                  {(["lb", "kg"] as const).map((unit) => (
                    <Button
                      key={unit}
                      label={unit === "lb" ? "Pounds (lb)" : "Kilograms (kg)"}
                      variant="outline"
                      style={{ flex: 1 }}
                      onPress={() =>
                        setDraft(
                          createNoteConversionPreview(
                            noteBody,
                            unit,
                            catalog.all,
                          ),
                        )
                      }
                    />
                  ))}
                </View>
              </Card>
            ) : (
              <>
                <View style={styles.summary}>
                  <Text style={styles.eyebrow}>
                    {draft.exercises.length} LIFTS · {setCount} SETS
                  </Text>
                  <Text
                    accessibilityLiveRegion="polite"
                    style={[
                      styles.source,
                      { color: review.length ? colors.dim : colors.success },
                    ]}
                  >
                    {review.length
                      ? `${review.length} ${review.length === 1 ? "item needs" : "items need"} review`
                      : "All items reviewed"}
                  </Text>
                  <Text style={styles.description}>
                    Sets will be saved in {targetUnit}. Other units convert to
                    the nearest whole {targetUnit}.
                  </Text>
                </View>
                {draft.noteUnit === "lb" &&
                draft.exercises.some((group) =>
                  group.sets.some(
                    (set) =>
                      set.weightNotation === "plates-per-side" &&
                      set.unit === "lb",
                  ),
                ) ? (
                  <Text style={styles.description}>
                    Plate sums include a 45 lb bar and plates on each side. Edit
                    the total weight if you used a different bar.
                  </Text>
                ) : null}
                {review
                  .filter((item) => !item.exerciseId && !item.lineId)
                  .map((item) => (
                    <Text key={item.message} style={styles.warning}>
                      {item.message}
                    </Text>
                  ))}
                {draft.exercises.slice(0, 50).map((group, index) => {
                  const groupReview = review.filter(
                    (item) => item.exerciseId === group.id,
                  );
                  const exercise = group.slug
                    ? catalog.get(group.slug)
                    : undefined;
                  return (
                    <Card key={group.id} style={{ gap: 16 }}>
                      <View style={styles.row}>
                        <View style={{ flex: 1, gap: 5 }}>
                          <Text style={styles.eyebrow}>
                            LIFT {String(index + 1).padStart(2, "0")}
                          </Text>
                          <Text style={styles.source}>
                            From note: {group.name || "No heading"}
                          </Text>
                        </View>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${group.name || "exercise"} from preview`}
                          onPress={() =>
                            change((current) => ({
                              ...current,
                              exercises: current.exercises.filter(
                                (item) => item.id !== group.id,
                              ),
                            }))
                          }
                          style={styles.iconButton}
                        >
                          <Trash2 size={18} color={colors.dim} />
                        </Pressable>
                      </View>
                      <Button
                        label={exercise?.name ?? "Choose exercise"}
                        variant="outline"
                        onPress={() => chooseExercise(group.id)}
                      />
                      {groupReview
                        .filter((item) => !item.setId)
                        .map((item) => (
                          <Text key={item.message} style={styles.warning}>
                            {item.message}
                          </Text>
                        ))}
                      {group.sets.slice(0, 20).map((set, setIndex) => (
                        <PreviewSetRow
                          key={set.id}
                          set={set}
                          targetUnit={targetUnit}
                          saving={saving}
                          index={setIndex}
                          exerciseName={exercise?.name ?? group.name}
                          perDumbbell={
                            exercise
                              ? /\(dumbbell\)/i.test(exercise.name)
                              : set.weightNotation === "per-dumbbell"
                          }
                          issues={groupReview
                            .filter((item) => item.setId === set.id)
                            .map((item) => item.message)}
                          onChange={(update) =>
                            changeGroup(group.id, (current) => ({
                              ...current,
                              sets: current.sets.map((row) =>
                                row.id === set.id ? { ...row, ...update } : row,
                              ),
                            }))
                          }
                          onRemove={() =>
                            changeGroup(group.id, (current) => ({
                              ...current,
                              sets: current.sets.filter(
                                (row) => row.id !== set.id,
                              ),
                            }))
                          }
                        />
                      ))}
                      {group.sets.length > 20 ? (
                        <>
                          <Text style={styles.description}>
                            {group.sets.length - 20} more sets are in the
                            original note. The preview shows the first 20.
                          </Text>
                          <Button
                            label="Keep extra sets as note only"
                            variant="outline"
                            size="sm"
                            onPress={() =>
                              changeGroup(group.id, (current) => ({
                                ...current,
                                sets: current.sets.slice(0, 20),
                              }))
                            }
                          />
                        </>
                      ) : null}
                      <Button
                        label="Add set"
                        variant="ghost"
                        size="sm"
                        disabled={group.sets.length >= 20}
                        onPress={() => addSet(group.id)}
                      />
                    </Card>
                  );
                })}
                {draft.exercises.length > 50 ? (
                  <>
                    <Text style={styles.description}>
                      {draft.exercises.length - 50} more exercises are in the
                      original note. The preview shows the first 50.
                    </Text>
                    <Button
                      label="Keep extra exercises as note only"
                      variant="outline"
                      onPress={() =>
                        change((current) => ({
                          ...current,
                          exercises: current.exercises.slice(0, 50),
                        }))
                      }
                    />
                  </>
                ) : null}
                <Button
                  label="Add exercise"
                  variant="outline"
                  disabled={draft.exercises.length >= 50}
                  onPress={addExercise}
                />
                {draft.unparsed.length ? (
                  <Card style={{ gap: 16 }}>
                    <Text style={styles.exerciseName}>Lines to review</Text>
                    <Text style={styles.description}>
                      Add any missed sets above, or keep these lines as notes.
                      Your original text is always preserved.
                    </Text>
                    {draft.unparsed.slice(0, visibleLineCount).map((line) => (
                      <View key={line.id} style={{ gap: 8 }}>
                        <Text style={styles.eyebrow}>
                          LINE {line.source.line}
                        </Text>
                        <Text selectable style={styles.note}>
                          {line.source.text}
                        </Text>
                        <Text style={styles.source}>{line.message}</Text>
                        <ReviewCheckbox
                          checked={line.keptAsNote}
                          label="Keep as note only"
                          onPress={() =>
                            change((current) => ({
                              ...current,
                              unparsed: current.unparsed.map((item) =>
                                item.id === line.id
                                  ? { ...item, keptAsNote: !item.keptAsNote }
                                  : item,
                              ),
                            }))
                          }
                        />
                      </View>
                    ))}
                    {draft.unparsed.length > visibleLineCount ? (
                      <Button
                        label={`Show more lines (${draft.unparsed.length - visibleLineCount} remaining)`}
                        variant="outline"
                        size="sm"
                        onPress={() =>
                          setVisibleLineCount((count) => count + 50)
                        }
                      />
                    ) : null}
                  </Card>
                ) : null}
              </>
            )}
          </ScrollView>
        )}
        <KeyboardStickyFooter style={styles.footer}>
          {error ? (
            <Text accessibilityRole="alert" style={styles.warning}>
              {error}
            </Text>
          ) : null}
          {selecting !== null || !draft ? (
            <Button
              label={selecting !== null ? "Back to preview" : "Close preview"}
              size="lg"
              onPress={close}
            />
          ) : (
            <View style={styles.row}>
              <Button
                label="Cancel"
                variant="outline"
                size="lg"
                disabled={saving}
                style={{ flex: 1 }}
                onPress={close}
              />
              <Button
                label={saving ? "Converting…" : "Confirm conversion"}
                size="lg"
                disabled={saving || review.length > 0}
                style={{ flex: 2 }}
                onPress={confirm}
              />
            </View>
          )}
        </KeyboardStickyFooter>
      </SafeAreaView>
    </Modal>
  );
}

function PreviewSetRow({
  set,
  targetUnit,
  saving,
  index,
  exerciseName,
  perDumbbell,
  issues,
  onChange,
  onRemove,
}: {
  set: NotePreviewSet;
  targetUnit: NoteUnit;
  saving: boolean;
  index: number;
  exerciseName: string;
  perDumbbell: boolean;
  issues: string[];
  onChange: (update: Partial<NotePreviewSet>) => void;
  onRemove: () => void;
}) {
  return (
    <View style={styles.set}>
      <View style={styles.row}>
        <Text style={[styles.eyebrow, { flex: 1 }]}>SET {index + 1}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove set ${index + 1} for ${exerciseName}`}
          onPress={onRemove}
          style={styles.iconButton}
        >
          <Trash2 size={16} color={colors.faint} />
        </Pressable>
      </View>
      <View style={[styles.row, { alignItems: "flex-end" }]}>
        <View style={{ flex: 1 }}>
          <Field
            label="Completed reps"
            accessibilityLabel={`Completed reps, ${exerciseName}, set ${index + 1}`}
            value={set.reps}
            onChangeText={(reps) => onChange({ reps })}
            keyboardType="number-pad"
            editable={!saving}
            placeholder="Reps"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Field
            label={perDumbbell ? "Weight per dumbbell" : "Weight"}
            accessibilityLabel={`Weight in ${set.unit}, ${exerciseName}, set ${index + 1}`}
            value={set.weight}
            onChangeText={(weight) => onChange({ weight })}
            keyboardType="decimal-pad"
            editable={!saving}
            placeholder="0"
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Weight unit ${set.unit}. Switch to ${set.unit === "lb" ? "kg" : "lb"}`}
          onPress={() => onChange({ unit: set.unit === "lb" ? "kg" : "lb" })}
          style={styles.unit}
        >
          <Text style={styles.exerciseName}>{set.unit}</Text>
        </Pressable>
      </View>
      {set.unit !== targetUnit &&
      set.weight.trim() &&
      Number.isFinite(Number(set.weight)) ? (
        <Text style={styles.source}>
          Saved as {convertWeight(Number(set.weight), set.unit, targetUnit)}{" "}
          {targetUnit} (nearest whole {targetUnit})
        </Text>
      ) : null}
      <Text selectable style={styles.source}>
        {set.source.line
          ? `Line ${set.source.line}: ${set.source.text.trim()}`
          : set.source.text}
      </Text>
      {set.weightNotation === "plates-per-side" ? (
        <Text style={styles.source}>
          Enter total weight, including the bar.
        </Text>
      ) : null}
      <ReviewCheckbox
        checked={set.failedAttempt}
        label="Failed attempt after completed reps"
        onPress={() => onChange({ failedAttempt: !set.failedAttempt })}
      />
      {issues.map((message) => (
        <Text key={message} style={styles.warning}>
          {message}
        </Text>
      ))}
    </View>
  );
}

function ReviewCheckbox({
  checked,
  label,
  onPress,
}: {
  checked: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked }}
      onPress={onPress}
      style={styles.checkboxRow}
    >
      <View
        style={[
          styles.checkbox,
          checked && { borderColor: colors.text, backgroundColor: colors.text },
        ]}
      >
        {checked ? <Check size={14} color={colors.bg} /> : null}
      </View>
      <Text
        style={[
          styles.source,
          { flex: 1, color: checked ? colors.text : colors.dim },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    paddingBottom: 20,
  },
  title: {
    color: colors.text,
    fontSize: 27,
    fontWeight: "700",
    letterSpacing: -0.6,
  },
  eyebrow: {
    color: colors.dim,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.4,
  },
  content: { padding: 16, paddingTop: 0, gap: 20, flexGrow: 1 },
  description: { color: colors.dim, fontSize: 13, lineHeight: 20 },
  source: { color: colors.dim, fontSize: 12, lineHeight: 18 },
  note: { color: colors.text, fontSize: 15, lineHeight: 24 },
  exerciseName: { color: colors.text, fontSize: 15, fontWeight: "600" },
  row: { flexDirection: "row", gap: 10, alignItems: "center" },
  summary: { gap: 6, paddingHorizontal: 2 },
  warning: { color: colors.danger, fontSize: 12, lineHeight: 18 },
  set: {
    gap: 10,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  unit: {
    minWidth: 44,
    height: 46,
    borderWidth: 1,
    borderColor: colors.input,
    borderRadius: radius.md,
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  checkbox: {
    width: 19,
    height: 19,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: colors.input,
    justifyContent: "center",
    alignItems: "center",
  },
  choice: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
    backgroundColor: colors.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
});
