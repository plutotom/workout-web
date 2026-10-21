import { Plus, X } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  PanResponder,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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

type Detent = "peek" | "half" | "full";

/**
 * Bottom sheet with peek / half / full drag detents. Peek is recents-only;
 * focusing search snaps to full so the field stays above the keyboard.
 * Tap adds immediately and stays open in add mode.
 */
export function DetentSheetPicker(props: ExercisePickerProps) {
  return (
    <Modal
      visible={props.visible}
      animationType="fade"
      transparent
      onRequestClose={props.onClose}
    >
      {props.visible ? <DetentSheetBody {...props} /> : null}
    </Modal>
  );
}

function DetentSheetBody({
  usedSlugs,
  onClose,
  onAdd,
  mode = "add",
}: ExercisePickerProps) {
  const catalog = useCatalog();
  const usage = useExerciseUsage();
  const archiveCustom = useArchiveCustom();
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [detent, setDetent] = useState<Detent>("half");

  const peekH = 340;
  const halfH = Math.round(windowHeight * 0.55);
  const fullH = Math.round(windowHeight * 0.92);
  const sheetHeight =
    detent === "peek" ? peekH : detent === "half" ? halfH : fullH;

  function snapTo(next: Detent) {
    setDetent(next);
  }

  const close = useCallback(() => {
    setQuery("");
    setCreating(false);
    setDetent("half");
    onClose();
  }, [onClose]);

  function addNow(slug: string) {
    onAdd([slug]);
    setQuery("");
    if (mode === "replace") close();
  }

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderRelease: (_event, gesture) => {
          const current = sheetHeight - gesture.dy;
          if (gesture.vy > 1.4 || current < peekH * 0.7) {
            close();
            return;
          }
          const points: [Detent, number][] = [
            ["peek", peekH],
            ["half", halfH],
            ["full", fullH],
          ];
          let nearest: Detent = "half";
          let dist = Number.POSITIVE_INFINITY;
          for (const [name, value] of points) {
            const d = Math.abs(current - value);
            if (d < dist) {
              dist = d;
              nearest = name;
            }
          }
          snapTo(nearest);
        },
      }),
    [close, fullH, halfH, peekH, sheetHeight],
  );

  const available = unusedExercises(catalog.all, usedSlugs);
  const filtered = filterExercises(available, query);
  const { recents } = splitRecents(filtered, usage, 10, 0);
  const peeking = detent === "peek" && !query.trim();
  const rows = peeking ? recents : filtered;

  return (
    <View style={{ flex: 1 }}>
      <Pressable
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)" }}
        onPress={close}
      />
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: sheetHeight,
          backgroundColor: colors.bg,
          borderTopLeftRadius: radius.lg,
          borderTopRightRadius: radius.lg,
          overflow: "hidden",
          paddingBottom: insets.bottom,
        }}
      >
        {creating ? (
          <View style={{ flex: 1 }}>
            <CreateExercise
              onCancel={() => setCreating(false)}
              onCreated={(slug) => {
                setCreating(false);
                addNow(slug);
              }}
            />
          </View>
        ) : (
          <>
            <View
              {...pan.panHandlers}
              style={{ alignItems: "center", paddingTop: 10, paddingBottom: 6 }}
            >
              <Pressable
                onPress={() =>
                  snapTo(
                    detent === "peek"
                      ? "half"
                      : detent === "half"
                        ? "full"
                        : "peek",
                  )
                }
                hitSlop={12}
                style={{
                  width: 40,
                  height: 5,
                  borderRadius: 99,
                  backgroundColor: colors.input,
                }}
              />
            </View>
            <View
              style={{
                paddingHorizontal: 16,
                paddingBottom: 12,
                gap: 10,
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
                    fontSize: 22,
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
              <SearchField
                value={query}
                onChangeText={setQuery}
                onFocus={() => snapTo("full")}
              />
              <Text style={{ color: colors.dim, fontSize: 12 }}>
                {peeking
                  ? "Recent lifts · drag up for the full catalog"
                  : "Tap to add. Drag the handle to peek, half, or full."}
              </Text>
            </View>
            {rows.length === 0 ? (
              <EmptyPicker query={query} onCreate={() => setCreating(true)} />
            ) : (
              <FlatList
                data={rows}
                keyExtractor={(item) => item.slug}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
                renderItem={({ item }) => (
                  <SelectRow
                    exercise={item}
                    accessory="plus"
                    meta={`${item.category} · tap to add`}
                    onPress={() => addNow(item.slug)}
                    onLongPress={() => archiveCustom(item.slug, item.name)}
                  />
                )}
              />
            )}
            <View style={{ padding: 12 }}>
              <Button
                label="New custom exercise"
                variant="outline"
                icon={Plus}
                onPress={() => {
                  snapTo("full");
                  setCreating(true);
                }}
              />
            </View>
          </>
        )}
      </View>
    </View>
  );
}
