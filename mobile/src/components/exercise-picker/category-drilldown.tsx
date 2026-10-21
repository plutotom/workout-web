import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react-native";
import { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { MuscleGroup } from "@shared/exercises";
import { MUSCLE_GROUPS } from "@shared/exercises";
import { Button } from "@/components/ui";
import { useCatalog } from "@/providers/catalog-provider";
import { colors, radius } from "@/theme";

import {
  AddFooter,
  DevPickerStyleButton,
  EmptyPicker,
  SearchField,
  SelectRow,
  useArchiveCustom,
} from "./chrome";
import { CreateExercise } from "./create-exercise";
import {
  filterExercises,
  pickerTitle,
  toggleSlug,
  unusedExercises,
} from "./model";
import type { ExercisePickerProps } from "./types";

/**
 * Two-step picker: muscle tiles first, then that group's exercises.
 * Typing in search jumps straight to a flat result list.
 */
export function CategoryDrilldownPicker({
  visible,
  usedSlugs,
  onClose,
  onAdd,
  mode = "add",
}: ExercisePickerProps) {
  const catalog = useCatalog();
  const archiveCustom = useArchiveCustom();
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<MuscleGroup | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const available = unusedExercises(catalog.all, usedSlugs);
  const searching = query.trim().length > 0;
  const tiles = useMemo(
    () =>
      MUSCLE_GROUPS.map((item) => ({
        ...item,
        count: available.filter((exercise) => exercise.category === item.id)
          .length,
      })).filter((item) => item.count > 0),
    [available],
  );
  const list = searching
    ? filterExercises(available, query)
    : group
      ? available.filter((exercise) => exercise.category === group)
      : [];
  const showTiles = !searching && group === null;

  function close() {
    setSelected([]);
    setQuery("");
    setGroup(null);
    setCreating(false);
    onClose();
  }

  const title = searching
    ? pickerTitle(mode)
    : group
      ? (MUSCLE_GROUPS.find((item) => item.id === group)?.label ?? group)
      : pickerTitle(mode);

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
                gap: 12,
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
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                >
                  {group && !searching ? (
                    <Pressable
                      onPress={() => setGroup(null)}
                      hitSlop={10}
                      accessibilityLabel="Back to muscle groups"
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 19,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: colors.surface2,
                      }}
                    >
                      <ChevronLeft size={23} color={colors.text} />
                    </Pressable>
                  ) : null}
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: 24,
                      fontWeight: "700",
                    }}
                  >
                    {title}
                  </Text>
                </View>
                <Pressable onPress={close} hitSlop={12}>
                  <X color={colors.text} size={23} />
                </Pressable>
              </View>
              <DevPickerStyleButton />
              <SearchField
                value={query}
                onChangeText={setQuery}
                placeholder="Search all exercises"
              />
              <Button
                label="New custom exercise"
                variant="outline"
                icon={Plus}
                onPress={() => setCreating(true)}
              />
            </View>
            {showTiles ? (
              <FlatList
                data={tiles}
                keyExtractor={(item) => item.id}
                numColumns={2}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{
                  padding: 12,
                  gap: 10,
                  paddingBottom: 110,
                }}
                columnWrapperStyle={{ gap: 10 }}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => setGroup(item.id)}
                    style={({ pressed }) => ({
                      flex: 1,
                      minHeight: 88,
                      borderRadius: radius.lg,
                      borderWidth: 1,
                      borderColor: colors.line,
                      backgroundColor: colors.surface,
                      padding: 14,
                      justifyContent: "space-between",
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <Text
                      style={{
                        color: colors.text,
                        fontSize: 17,
                        fontWeight: "700",
                      }}
                    >
                      {item.label}
                    </Text>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <Text style={{ color: colors.dim, fontSize: 12 }}>
                        {item.count} lift{item.count === 1 ? "" : "s"}
                      </Text>
                      <ChevronRight size={16} color={colors.dim} />
                    </View>
                  </Pressable>
                )}
              />
            ) : list.length === 0 ? (
              <EmptyPicker query={query} onCreate={() => setCreating(true)} />
            ) : (
              <FlatList
                data={list}
                keyExtractor={(item) => item.slug}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
                contentContainerStyle={{ paddingBottom: 110 }}
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
            )}
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
