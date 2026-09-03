import type { MuscleGroup } from "@shared/exercises";
import { MUSCLE_GROUPS } from "@shared/exercises";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { X } from "lucide-react-native";

import { useLocalData } from "@/data/local/provider";
import { Button, Field, Segmented } from "@/components/ui";
import { colors, radius } from "@/theme";

export type EditableCustomExercise = {
  exerciseId: string;
  name: string;
  short?: string;
  category: MuscleGroup;
  usesBar: boolean;
};

export function CustomExerciseEditor({
  visible,
  onClose,
  onSaved,
  exercise,
  defaultGroup = "chest",
}: {
  visible: boolean;
  onClose: () => void;
  onSaved?: (slug: string) => void;
  exercise?: EditableCustomExercise;
  defaultGroup?: MuscleGroup;
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView
        style={{ flex: 1, backgroundColor: colors.bg }}
        edges={["top", "bottom"]}
      >
        <EditorBody
          exercise={exercise}
          defaultGroup={defaultGroup}
          onCancel={onClose}
          onSaved={(slug) => {
            onSaved?.(slug);
            onClose();
          }}
        />
      </SafeAreaView>
    </Modal>
  );
}

function EditorBody({
  exercise,
  defaultGroup,
  onCancel,
  onSaved,
}: {
  exercise?: EditableCustomExercise;
  defaultGroup: MuscleGroup;
  onCancel: () => void;
  onSaved: (slug: string) => void;
}) {
  const { saveCustomExercise } = useLocalData();
  const editing = exercise !== undefined;
  const [name, setName] = useState(exercise?.name ?? "");
  const [short, setShort] = useState(exercise?.short ?? "");
  const [category, setCategory] = useState<MuscleGroup>(
    exercise?.category ?? defaultGroup,
  );
  const [usesBar, setUsesBar] = useState(exercise?.usesBar ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!name.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const result = await saveCustomExercise({
        exerciseId: exercise?.exerciseId,
        name: name.trim(),
        short: short.trim() || undefined,
        category,
        usesBar,
      });
      onSaved(result.slug);
    } catch (cause) {
      const message =
        cause instanceof Error && cause.message
          ? cause.message
          : editing
            ? "Couldn't update exercise"
            : "Couldn't create exercise";
      setError(message);
    } finally {
      setSaving(false);
    }
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
          {editing ? "Edit exercise" : "New custom exercise"}
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
          hint="Optional — used where space is tight."
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
          label={
            saving
              ? editing
                ? "Saving…"
                : "Creating…"
              : editing
                ? "Save"
                : "Create exercise"
          }
          size="lg"
          disabled={saving || !name.trim()}
          onPress={save}
        />
        <Button label="Cancel" variant="ghost" onPress={onCancel} />
      </View>
    </KeyboardAvoidingView>
  );
}
