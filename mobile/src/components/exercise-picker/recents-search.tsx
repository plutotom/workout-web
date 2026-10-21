import { Plus, X } from "lucide-react-native";
import { useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  Text,
  View,
  type ListRenderItem,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { Exercise } from "@shared/exercises";
import { Button } from "@/components/ui";
import { useCatalog } from "@/providers/catalog-provider";
import { colors } from "@/theme";

import {
  AddFooter,
  DevPickerStyleButton,
  EmptyPicker,
  SearchField,
  SelectRow,
  useArchiveCustom,
  useExerciseUsage,
} from "./chrome";
import { CreateExercise } from "./create-exercise";
import {
  filterExercises,
  pickerTitle,
  splitRecents,
  toggleSlug,
  unusedExercises,
} from "./model";
import type { ExercisePickerProps } from "./types";

type Chip = "all" | "recent" | "custom";
type Row =
  | { kind: "header"; id: string; title: string }
  | { kind: "exercise"; id: string; exercise: Exercise };

/**
 * Compact search-first sheet. Empty query shows recent and frequent lifts
 * first; chips swap the pool instead of sorting the whole catalog.
 */
export function RecentsSearchPicker({
  visible,
  usedSlugs,
  onClose,
  onAdd,
  mode = "add",
}: ExercisePickerProps) {
  const catalog = useCatalog();
  const usage = useExerciseUsage();
  const archiveCustom = useArchiveCustom();
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState<Chip>("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const available = unusedExercises(catalog.all, usedSlugs);
  const filtered = filterExercises(available, query);
  const { recents, frequent, rest } = splitRecents(filtered, usage);

  const rows = useMemo(() => {
    const pool =
      chip === "custom"
        ? filtered.filter((exercise) => exercise.custom)
        : chip === "recent"
          ? recents
          : filtered;
    if (query.trim() || chip !== "all") {
      return pool.map(
        (exercise): Row => ({
          kind: "exercise",
          id: exercise.slug,
          exercise,
        }),
      );
    }
    const next: Row[] = [];
    function pushSection(title: string, items: Exercise[]) {
      if (items.length === 0) return;
      next.push({ kind: "header", id: `h-${title}`, title });
      for (const exercise of items) {
        next.push({ kind: "exercise", id: exercise.slug, exercise });
      }
    }
    pushSection("Recent", recents);
    pushSection("Frequent", frequent);
    pushSection("All exercises", rest);
    return next;
  }, [chip, filtered, frequent, query, recents, rest]);

  function close() {
    setSelected([]);
    setQuery("");
    setChip("all");
    setCreating(false);
    onClose();
  }

  const renderItem: ListRenderItem<Row> = ({ item }) => {
    if (item.kind === "header") {
      return (
        <Text
          style={{
            color: colors.dim,
            fontSize: 11,
            fontWeight: "700",
            letterSpacing: 1.4,
            textTransform: "uppercase",
            paddingHorizontal: 12,
            paddingTop: 18,
            paddingBottom: 6,
          }}
        >
          {item.title}
        </Text>
      );
    }
    return (
      <SelectRow
        exercise={item.exercise}
        active={selected.includes(item.exercise.slug)}
        onPress={() =>
          setSelected((current) =>
            toggleSlug(current, item.exercise.slug, mode),
          )
        }
        onLongPress={() =>
          archiveCustom(item.exercise.slug, item.exercise.name)
        }
      />
    );
  };

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
              <SearchField value={query} onChangeText={setQuery} autoFocus />
              <View style={{ flexDirection: "row", gap: 8 }}>
                {(
                  [
                    { id: "all", label: "All" },
                    { id: "recent", label: "Recent" },
                    { id: "custom", label: "Custom" },
                  ] as const
                ).map((item) => {
                  const active = chip === item.id;
                  return (
                    <Pressable
                      key={item.id}
                      onPress={() => setChip(item.id)}
                      style={{
                        minHeight: 36,
                        justifyContent: "center",
                        paddingHorizontal: 14,
                        borderRadius: 99,
                        borderWidth: 1,
                        borderColor: active ? colors.action : colors.input,
                        backgroundColor: active ? colors.action : "transparent",
                      }}
                    >
                      <Text
                        style={{
                          color: active ? colors.actionText : colors.dim,
                          fontSize: 13,
                          fontWeight: "600",
                        }}
                      >
                        {item.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Button
                label="New custom exercise"
                variant="outline"
                icon={Plus}
                onPress={() => setCreating(true)}
              />
            </View>
            {rows.length === 0 ? (
              <EmptyPicker query={query} onCreate={() => setCreating(true)} />
            ) : (
              <FlatList
                data={rows}
                keyExtractor={(item) => item.id}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
                contentContainerStyle={{ paddingBottom: 110 }}
                renderItem={renderItem}
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
