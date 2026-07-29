import { Check, Plus, Search, X } from "lucide-react-native";
import { useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { MuscleGroup } from "@shared/exercises";
import { MUSCLE_GROUPS } from "@shared/exercises";
import { useLocalCustomExercises, useLocalData } from "@/data/local/provider";
import { useCatalog } from "@/providers/catalog-provider";
import { Button, Field, Segmented } from "@/components/ui";
import { colors, radius } from "@/theme";

export function ExercisePicker({
  visible,
  usedSlugs,
  onClose,
  onAdd,
}: {
  visible: boolean;
  usedSlugs: string[];
  onClose: () => void;
  onAdd: (slugs: string[]) => void;
}) {
  const catalog = useCatalog();
  const { archiveCustomExercise } = useLocalData();
  const customExercises = useLocalCustomExercises();
  const localIdBySlug = useMemo(
    () => new Map((customExercises ?? []).map((item) => [item.slug, item._id])),
    [customExercises],
  );
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<MuscleGroup | "all">("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const used = useMemo(() => new Set(usedSlugs), [usedSlugs]);
  const items = catalog
    .search(query, group)
    .filter((exercise) => !used.has(exercise.slug));

  function close() {
    setSelected([]);
    setQuery("");
    setCreating(false);
    onClose();
  }

  function archiveCustom(slug: string, name: string) {
    const exerciseId = localIdBySlug.get(slug);
    if (!exerciseId) return;
    Alert.alert(
      "Archive custom exercise?",
      `${name} will disappear from pickers but stay in workout history.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Archive",
          style: "destructive",
          onPress: () => void archiveCustomExercise(exerciseId),
        },
      ],
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={close}
    >
      <SafeAreaView
        style={{ flex: 1, backgroundColor: colors.bg }}
        edges={["top", "bottom"]}
      >
        {creating ? (
          <CreateExercise
            onCancel={() => setCreating(false)}
            onCreated={(slug) => {
              setSelected((current) => [...current, slug]);
              setCreating(false);
            }}
          />
        ) : (
          <>
            <View
              style={{
                padding: 16,
                gap: 14,
                borderBottomWidth: 1,
                borderBottomColor: colors.line,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Text
                  style={{
                    color: colors.text,
                    fontSize: 24,
                    fontWeight: "700",
                  }}
                >
                  Add exercises
                </Text>
                <Pressable onPress={close} hitSlop={12}>
                  <X color={colors.text} size={23} />
                </Pressable>
              </View>
              <View
                style={{
                  height: 44,
                  borderRadius: radius.md,
                  borderColor: colors.input,
                  borderWidth: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 9,
                  paddingHorizontal: 12,
                }}
              >
                <Search size={17} color={colors.dim} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search exercises"
                  placeholderTextColor={colors.faint}
                  style={{ flex: 1, color: colors.text, fontSize: 15 }}
                  autoCorrect={false}
                />
              </View>
              <FlatList
                data={[{ id: "all" as const, label: "All" }, ...MUSCLE_GROUPS]}
                keyExtractor={(item) => item.id}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 7 }}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => setGroup(item.id)}
                    style={{
                      borderWidth: 1,
                      borderColor:
                        group === item.id ? colors.action : colors.input,
                      backgroundColor:
                        group === item.id ? colors.action : "transparent",
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                      borderRadius: 99,
                    }}
                  >
                    <Text
                      style={{
                        color:
                          group === item.id ? colors.actionText : colors.dim,
                        fontSize: 12,
                        fontWeight: "600",
                      }}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                )}
              />
              <Button
                label="New custom exercise"
                variant="outline"
                icon={Plus}
                onPress={() => setCreating(true)}
              />
            </View>

            <FlatList
              data={items}
              keyExtractor={(item) => item.slug}
              contentContainerStyle={{ padding: 12, paddingBottom: 110 }}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const active = selected.includes(item.slug);
                return (
                  <Pressable
                    onPress={() =>
                      setSelected((current) =>
                        active
                          ? current.filter((slug) => slug !== item.slug)
                          : [...current, item.slug],
                      )
                    }
                    onLongPress={() => archiveCustom(item.slug, item.name)}
                    style={({ pressed }) => ({
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                      paddingHorizontal: 12,
                      paddingVertical: 13,
                      borderBottomWidth: 1,
                      borderBottomColor: colors.line,
                      opacity: pressed ? 0.65 : 1,
                    })}
                  >
                    <View
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        alignItems: "center",
                        justifyContent: "center",
                        borderWidth: 1,
                        borderColor: active ? colors.action : colors.input,
                        backgroundColor: active ? colors.action : "transparent",
                      }}
                    >
                      {active ? (
                        <Check
                          size={17}
                          color={colors.actionText}
                          strokeWidth={3}
                        />
                      ) : null}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          color: colors.text,
                          fontSize: 15,
                          fontWeight: "600",
                        }}
                      >
                        {item.name}
                      </Text>
                      <Text
                        style={{
                          color: colors.dim,
                          fontSize: 11,
                          marginTop: 3,
                          textTransform: "capitalize",
                        }}
                      >
                        {item.category}
                        {item.custom ? " · custom · hold to archive" : ""}
                      </Text>
                    </View>
                  </Pressable>
                );
              }}
            />
            <View
              style={{
                position: "absolute",
                left: 12,
                right: 12,
                bottom: 12,
                paddingBottom: 4,
              }}
            >
              <Button
                label={
                  selected.length
                    ? `Add ${selected.length} exercise${selected.length === 1 ? "" : "s"}`
                    : "Select exercises"
                }
                size="lg"
                disabled={!selected.length}
                onPress={() => {
                  onAdd(selected);
                  close();
                }}
              />
            </View>
          </>
        )}
      </SafeAreaView>
    </Modal>
  );
}

function CreateExercise({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (slug: string) => void;
}) {
  const { saveCustomExercise } = useLocalData();
  const [name, setName] = useState("");
  const [short, setShort] = useState("");
  const [category, setCategory] = useState<MuscleGroup>("chest");
  const [usesBar, setUsesBar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!name.trim() || saving) return;
    setSaving(true);
    setError(null);
    let slug: string;
    try {
      // Saved to this phone straight away; the upload is queued and runs the
      // next time an account is connected.
      const result = await saveCustomExercise({
        name: name.trim(),
        short: short.trim() || undefined,
        category,
        usesBar,
      });
      slug = result.slug;
    } catch (cause) {
      // Show what actually went wrong — the old copy blamed the name, which is
      // never the reason (custom lift names are not unique).
      const message =
        cause instanceof Error && cause.message
          ? cause.message
          : "Something went wrong saving this exercise.";
      console.warn("[custom-exercise] save failed", cause);
      setError(message);
      return;
    } finally {
      setSaving(false);
    }
    // Outside the try so a throw from the caller can't be reported as a failed
    // save when the lift is already on the device.
    onCreated(slug);
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: 14,
          borderBottomWidth: 1,
          borderBottomColor: colors.line,
        }}
      >
        <Text style={{ color: colors.text, fontSize: 24, fontWeight: "700" }}>
          New custom exercise
        </Text>
        <Pressable onPress={onCancel} hitSlop={12}>
          <X color={colors.text} size={23} />
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 20 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        <Field
          label="Name"
          value={name}
          onChangeText={(value) => {
            setName(value);
            if (error) setError(null);
          }}
          placeholder="Cable Y Raise"
          autoFocus
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="done"
          maxLength={80}
          onSubmitEditing={() => void save()}
        />
        <Field
          label="Short name"
          hint="Optional — used where space is tight, like the set list."
          value={short}
          onChangeText={setShort}
          placeholder="Y Raise"
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="done"
          maxLength={80}
        />
        <View style={{ gap: 9 }}>
          <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>
            Muscle group
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
            {MUSCLE_GROUPS.map((group) => (
              <Pressable
                key={group.id}
                onPress={() => setCategory(group.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: category === group.id }}
                style={{
                  minHeight: 38,
                  justifyContent: "center",
                  paddingHorizontal: 14,
                  borderRadius: radius.pill,
                  borderWidth: 1,
                  borderColor:
                    category === group.id ? colors.action : colors.input,
                  backgroundColor:
                    category === group.id ? colors.action : "transparent",
                }}
              >
                <Text
                  style={{
                    color:
                      category === group.id ? colors.actionText : colors.dim,
                    fontWeight: "600",
                    fontSize: 13,
                  }}
                >
                  {group.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={{ gap: 9 }}>
          <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>
            Equipment
          </Text>
          <Segmented
            value={usesBar}
            options={[
              { value: false, label: "No bar" },
              { value: true, label: "Uses bar" },
            ]}
            onChange={setUsesBar}
          />
        </View>
        {error ? (
          <Text style={{ color: colors.danger, fontSize: 13, lineHeight: 18 }}>
            {error}
          </Text>
        ) : null}
      </ScrollView>

      <View
        style={{
          gap: 9,
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 12,
          borderTopWidth: 1,
          borderTopColor: colors.line,
          backgroundColor: colors.bg,
        }}
      >
        <Button
          label={saving ? "Creating…" : "Create exercise"}
          size="lg"
          disabled={saving || !name.trim()}
          onPress={save}
        />
        <Button label="Cancel" variant="ghost" onPress={onCancel} />
      </View>
    </KeyboardAvoidingView>
  );
}
