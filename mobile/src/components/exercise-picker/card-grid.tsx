import { Check, Plus, X } from "lucide-react-native";
import { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { Exercise } from "@shared/exercises";
import { Button } from "@/components/ui";
import { useCatalog } from "@/providers/catalog-provider";
import { colors, radius } from "@/theme";

import {
  AddFooter,
  DevPickerStyleButton,
  EmptyPicker,
  SearchField,
  useArchiveCustom,
} from "./chrome";
import { CreateExercise } from "./create-exercise";
import {
  EQUIPMENT_GROUPS,
  equipmentOf,
  filterExercises,
  pickerTitle,
  toggleSlug,
  unusedExercises,
  type EquipmentKind,
} from "./model";
import type { ExercisePickerProps } from "./types";

/**
 * Two-column cards filtered by equipment chips instead of sort controls.
 * Multi-select, then confirm — same add path as the current picker.
 */
export function CardGridPicker({
  visible,
  usedSlugs,
  onClose,
  onAdd,
  mode = "add",
}: ExercisePickerProps) {
  const catalog = useCatalog();
  const archiveCustom = useArchiveCustom();
  const [query, setQuery] = useState("");
  const [equipment, setEquipment] = useState<EquipmentKind | "all">("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const available = unusedExercises(catalog.all, usedSlugs);
  const filtered = useMemo(() => {
    const byQuery = filterExercises(available, query);
    if (equipment === "all") return byQuery;
    return byQuery.filter((exercise) => equipmentOf(exercise) === equipment);
  }, [available, equipment, query]);

  function close() {
    setSelected([]);
    setQuery("");
    setEquipment("all");
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
                data={
                  [
                    { id: "all" as const, label: "All" },
                    ...EQUIPMENT_GROUPS,
                  ] as const
                }
                keyExtractor={(item) => item.id}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 7 }}
                renderItem={({ item }) => {
                  const active = equipment === item.id;
                  return (
                    <Pressable
                      onPress={() => setEquipment(item.id)}
                      style={{
                        borderWidth: 1,
                        borderColor: active ? colors.action : colors.input,
                        backgroundColor: active ? colors.action : "transparent",
                        paddingHorizontal: 12,
                        paddingVertical: 7,
                        borderRadius: 99,
                      }}
                    >
                      <Text
                        style={{
                          color: active ? colors.actionText : colors.dim,
                          fontSize: 12,
                          fontWeight: "600",
                        }}
                      >
                        {item.label}
                      </Text>
                    </Pressable>
                  );
                }}
              />
              <Button
                label="New custom exercise"
                variant="outline"
                icon={Plus}
                onPress={() => setCreating(true)}
              />
            </View>
            {filtered.length === 0 ? (
              <EmptyPicker query={query} onCreate={() => setCreating(true)} />
            ) : (
              <FlatList
                data={filtered}
                keyExtractor={(item) => item.slug}
                numColumns={2}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
                contentContainerStyle={{
                  padding: 12,
                  gap: 10,
                  paddingBottom: 110,
                }}
                columnWrapperStyle={{ gap: 10 }}
                renderItem={({ item }) => (
                  <GridCard
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

function GridCard({
  exercise,
  active,
  onPress,
  onLongPress,
}: {
  exercise: Exercise;
  active: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const gear = EQUIPMENT_GROUPS.find(
    (group) => group.id === equipmentOf(exercise),
  )?.label;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 108,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: active ? colors.action : colors.line,
        backgroundColor: active ? colors.action : colors.surface,
        padding: 12,
        gap: 8,
        opacity: pressed ? 0.75 : 1,
      })}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <Text
          style={{
            color: active ? colors.actionText : colors.dim,
            fontSize: 11,
            fontWeight: "700",
            textTransform: "uppercase",
            letterSpacing: 0.6,
          }}
        >
          {gear}
        </Text>
        {active ? (
          <Check size={16} color={colors.actionText} strokeWidth={3} />
        ) : null}
      </View>
      <Text
        style={{
          color: active ? colors.actionText : colors.text,
          fontSize: 15,
          fontWeight: "700",
        }}
        numberOfLines={3}
      >
        {exercise.name}
      </Text>
      <Text
        style={{
          color: active ? colors.actionText : colors.faint,
          fontSize: 11,
          textTransform: "capitalize",
          marginTop: "auto",
        }}
      >
        {exercise.category}
        {exercise.custom ? " · custom" : ""}
      </Text>
    </Pressable>
  );
}
