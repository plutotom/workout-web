import { Plus, X } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { KeyboardAwareFooterLayout } from "@/components/keyboard-aware-scroll";
import { KeyboardStickyFooter } from "@/components/keyboard-sticky-footer";
import { Button } from "@/components/ui";
import { useCatalog } from "@/providers/catalog-provider";
import { colors, radius } from "@/theme";

import {
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
  unusedExercises,
} from "./model";
import type { ExercisePickerProps } from "./types";

/**
 * Spotlight-style quick add. Search lives in a sticky composer so the
 * keyboard never covers it. Tapping a row adds immediately through onAdd;
 * in add mode the palette stays open so several lifts can be queued.
 */
export function CommandPalettePicker({
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
  const [creating, setCreating] = useState(false);

  const available = unusedExercises(catalog.all, usedSlugs);
  const filtered = filterExercises(available, query);
  const { recents } = splitRecents(filtered, usage, 6, 0);
  const rows = useMemo(() => {
    if (query.trim()) return filtered.slice(0, 20);
    return recents.length > 0 ? recents : filtered.slice(0, 12);
  }, [filtered, query, recents]);

  function close() {
    setQuery("");
    setCreating(false);
    onClose();
  }

  function addNow(slug: string) {
    onAdd([slug]);
    setQuery("");
    if (mode === "replace") close();
  }

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={close}
    >
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)" }}>
        <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
          {creating ? (
            <View style={{ flex: 1, backgroundColor: colors.bg }}>
              <CreateExercise
                onCancel={() => setCreating(false)}
                onCreated={(slug) => {
                  setCreating(false);
                  addNow(slug);
                }}
              />
            </View>
          ) : (
            <KeyboardAwareFooterLayout
              keyboardMode="composer"
              contentContainerStyle={{ flexGrow: 1, paddingTop: 8 }}
              footer={
                <KeyboardStickyFooter
                  style={{
                    paddingHorizontal: 12,
                    gap: 8,
                    backgroundColor: "transparent",
                  }}
                >
                  <SearchField
                    value={query}
                    onChangeText={setQuery}
                    autoFocus
                    placeholder="Jump to an exercise"
                  />
                  <Button
                    label={
                      query.trim()
                        ? `Create “${query.trim()}”`
                        : "New custom exercise"
                    }
                    variant="outline"
                    icon={Plus}
                    onPress={() => setCreating(true)}
                  />
                </KeyboardStickyFooter>
              }
            >
              <View
                style={{
                  marginHorizontal: 12,
                  backgroundColor: colors.surface,
                  borderRadius: radius.lg,
                  borderWidth: 1,
                  borderColor: colors.line,
                  overflow: "hidden",
                  minHeight: 220,
                }}
              >
                <View
                  style={{
                    paddingHorizontal: 14,
                    paddingTop: 14,
                    paddingBottom: 10,
                    gap: 8,
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
                        fontSize: 18,
                        fontWeight: "700",
                      }}
                    >
                      {pickerTitle(mode)}
                    </Text>
                    <Pressable onPress={close} hitSlop={12}>
                      <X color={colors.text} size={22} />
                    </Pressable>
                  </View>
                  <DevPickerStyleButton />
                  <Text style={{ color: colors.dim, fontSize: 12 }}>
                    {query.trim()
                      ? "Tap a result to add it."
                      : recents.length > 0
                        ? "Recent lifts. Type to search the catalog."
                        : "Type to search, or create a custom lift."}
                  </Text>
                </View>
                {rows.length === 0 ? (
                  <EmptyPicker
                    query={query}
                    onCreate={() => setCreating(true)}
                  />
                ) : (
                  rows.map((item) => (
                    <SelectRow
                      key={item.slug}
                      exercise={item}
                      accessory="plus"
                      meta={
                        item.custom
                          ? `${item.category} · custom · tap to add`
                          : `${item.category} · tap to add`
                      }
                      onPress={() => addNow(item.slug)}
                      onLongPress={() => archiveCustom(item.slug, item.name)}
                    />
                  ))
                )}
              </View>
            </KeyboardAwareFooterLayout>
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
}
