import { Plus, X } from "lucide-react-native";
import { useMemo, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  SectionList,
  Text,
  View,
  type SectionList as SectionListType,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

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
} from "./chrome";
import { CreateExercise } from "./create-exercise";
import {
  MUSCLE_INDEX,
  filterExercises,
  pickerTitle,
  sectionsByMuscle,
  toggleSlug,
  unusedExercises,
} from "./model";
import type { ExercisePickerProps } from "./types";

/**
 * Contacts-style list: muscle sections with sticky headers and a jump index
 * on the right thumb edge.
 */
export function SectionedIndexPicker({
  visible,
  usedSlugs,
  onClose,
  onAdd,
  mode = "add",
}: ExercisePickerProps) {
  const catalog = useCatalog();
  const archiveCustom = useArchiveCustom();
  const listRef = useRef<SectionListType>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const available = unusedExercises(catalog.all, usedSlugs);
  const filtered = filterExercises(available, query);
  const sections = useMemo(() => sectionsByMuscle(filtered), [filtered]);

  function close() {
    setSelected([]);
    setQuery("");
    setCreating(false);
    onClose();
  }

  function jumpTo(sectionIndex: number) {
    try {
      listRef.current?.scrollToLocation({
        sectionIndex,
        itemIndex: 0,
        viewOffset: 0,
        animated: true,
      });
    } catch {
      // SectionList throws if the section isn't mounted yet.
    }
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
              <Button
                label="New custom exercise"
                variant="outline"
                icon={Plus}
                onPress={() => setCreating(true)}
              />
            </View>
            {sections.length === 0 ? (
              <EmptyPicker query={query} onCreate={() => setCreating(true)} />
            ) : (
              <View style={{ flex: 1, flexDirection: "row" }}>
                <SectionList
                  ref={listRef}
                  style={{ flex: 1 }}
                  sections={sections}
                  keyExtractor={(item) => item.slug}
                  stickySectionHeadersEnabled
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="interactive"
                  contentContainerStyle={{ paddingBottom: 110 }}
                  onScrollToIndexFailed={() => undefined}
                  renderSectionHeader={({ section }) => (
                    <View
                      style={{
                        backgroundColor: colors.bg,
                        paddingHorizontal: 16,
                        paddingVertical: 8,
                        borderBottomWidth: 1,
                        borderBottomColor: colors.line,
                      }}
                    >
                      <Text
                        style={{
                          color: colors.text,
                          fontSize: 13,
                          fontWeight: "700",
                        }}
                      >
                        {section.title}
                      </Text>
                    </View>
                  )}
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
                <View
                  style={{
                    width: 36,
                    paddingTop: 8,
                    alignItems: "center",
                    gap: 2,
                  }}
                >
                  {MUSCLE_INDEX.map((entry) => {
                    const sectionIndex = sections.findIndex(
                      (section) => section.id === entry.id,
                    );
                    const enabled = sectionIndex >= 0;
                    return (
                      <Pressable
                        key={entry.id}
                        disabled={!enabled}
                        onPress={() => jumpTo(sectionIndex)}
                        hitSlop={4}
                        style={{
                          minHeight: 28,
                          minWidth: 28,
                          alignItems: "center",
                          justifyContent: "center",
                          opacity: enabled ? 1 : 0.28,
                        }}
                      >
                        <Text
                          style={{
                            color: colors.dim,
                            fontSize: 10,
                            fontWeight: "700",
                          }}
                        >
                          {entry.key}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
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
