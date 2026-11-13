import type { MuscleGroup } from "@shared/exercises";
import { MUSCLE_GROUPS } from "@shared/exercises";
import { X } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { KeyboardAwareFooterLayout } from "@/components/keyboard-aware-scroll";
import { KeyboardStickyFooter } from "@/components/keyboard-sticky-footer";
import { Button, Field, Segmented } from "@/components/ui";
import { useLocalData } from "@/data/local/provider";
import { colors, radius } from "@/theme";

export function CreateExercise({
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
    <>
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

      <KeyboardAwareFooterLayout
        contentContainerStyle={{ padding: 16, gap: 20 }}
        footer={
          <KeyboardStickyFooter
            style={{
              flexDirection: "row",
              gap: 9,
              paddingHorizontal: 16,
              paddingTop: 12,
              borderTopWidth: 1,
              borderTopColor: colors.line,
              backgroundColor: colors.bg,
            }}
          >
            <Button
              label="Cancel"
              variant="outline"
              size="lg"
              onPress={onCancel}
              style={{ flex: 1 }}
            />
            <Button
              label={saving ? "Creating…" : "Create exercise"}
              size="lg"
              disabled={saving || !name.trim()}
              onPress={save}
              style={{ flex: 1 }}
            />
          </KeyboardStickyFooter>
        }
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
      </KeyboardAwareFooterLayout>
    </>
  );
}
