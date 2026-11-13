import { Plus, X } from "lucide-react-native";
import { useState } from "react";
import { FlatList, Modal, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { MuscleGroup } from "@shared/exercises";
import { MUSCLE_GROUPS } from "@shared/exercises";
import { Button } from "@/components/ui";
import { useCatalog } from "@/providers/catalog-provider";
import { colors } from "@/theme";

import {
  AddFooter,
  DevPickerStyleButton,
  SearchField,
  SelectRow,
  useArchiveCustom,
} from "./chrome";
import { CreateExercise } from "./create-exercise";
import { pickerTitle, toggleSlug, unusedExercises } from "./model";
import type { ExercisePickerProps } from "./types";

/** The shipping picker: page sheet, muscle chips, multi-select, confirm. */
export function CurrentExercisePicker({
  visible,
  usedSlugs,
  onClose,
  onAdd,
  mode = "add",
}: ExercisePickerProps) {
  const catalog = useCatalog();
  const archiveCustom = useArchiveCustom();
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<MuscleGroup | "all">("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const items = unusedExercises(catalog.search(query, group), usedSlugs);

  function close() {
    setSelected([]);
    setQuery("");
    setCreating(false);
    onClose();
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
        edges={["top"]}
      >
        {creating ? (
          <CreateExercise
            onCancel={() => setCreating(false)}
            onCreated={(slug) => {
              setSelected((current) =>
                mode === "replace"
                  ? [slug]
                  : current.includes(slug)
                    ? current
                    : [...current, slug],
              );
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
                  {pickerTitle(mode)}
                </Text>
                <Pressable onPress={close} hitSlop={12}>
                  <X color={colors.text} size={23} />
                </Pressable>
              </View>
              <DevPickerStyleButton />
              <SearchField value={query} onChangeText={setQuery} />
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
              keyboardDismissMode="interactive"
              renderItem={({ item }) => (
                <SelectRow
                  exercise={item}
                  active={selected.includes(item.slug)}
                  onPress={() =>
                    setSelected((current) =>
                      toggleSlug(current, item.slug, mode),
                    )
                  }
                  onLongPress={() => archiveCustom(item.slug, item.name)}
                />
              )}
            />
            <AddFooter
              mode={mode}
              selectedCount={selected.length}
              onPress={() => {
                onAdd(selected);
                close();
              }}
            />
          </>
        )}
      </SafeAreaView>
    </Modal>
  );
}
