import { Check, MapPin, Plus, Star } from "lucide-react-native";
import { useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui";
import {
  useLocalData,
  useLastLocalSessionPlaceId,
  useLocalMachinesForLift,
  useLocalPlaces,
  useLocalTemplate,
} from "@/data/local/provider";
import type { LocalMachine, LocalPlace } from "@/data/local/types";
import { colors, radius, space } from "@/theme";

export function useStartPlace(templateId?: string) {
  const places = useLocalPlaces();
  const template = useLocalTemplate(templateId);
  const lastSessionPlaceId = useLastLocalSessionPlaceId();
  const [pickedId, setPickedId] = useState<string | null>(null);

  const selected = useMemo(() => {
    if (!places) return null;
    if (pickedId) return places.find((place) => place._id === pickedId) ?? null;
    if (template?.lastPlaceId) {
      const last = places.find((place) => place._id === template.lastPlaceId);
      if (last) return last;
    }
    if (!templateId && lastSessionPlaceId) {
      const last = places.find((place) => place._id === lastSessionPlaceId);
      if (last) return last;
    }
    return places.find((place) => place.starred) ?? places[0] ?? null;
  }, [places, pickedId, template, templateId, lastSessionPlaceId]);

  const lastPlace =
    template?.lastPlaceId && selected?._id !== template.lastPlaceId
      ? (places?.find((place) => place._id === template.lastPlaceId) ?? null)
      : null;

  return {
    places: places ?? [],
    selected,
    lastPlace,
    pick: setPickedId,
  };
}

export function PlaceChip({
  name,
  lastPlaceName,
  onPress,
}: {
  name: string | null;
  lastPlaceName?: string | null;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        borderWidth: 1,
        borderColor: colors.line,
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        paddingHorizontal: 12,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <MapPin size={16} color={colors.dim} />
      <Text
        style={{
          flex: 1,
          color: colors.text,
          fontSize: 16,
          fontWeight: "600",
        }}
        numberOfLines={1}
      >
        {name ?? "Place"}
      </Text>
      {lastPlaceName && lastPlaceName !== name ? (
        <Text style={{ color: colors.dim, fontSize: 12 }}>
          Last time · {lastPlaceName}
        </Text>
      ) : null}
    </Pressable>
  );
}

export function PlacePickerModal({
  visible,
  onClose,
  places,
  selectedPlaceId,
  lastPlaceId,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  places: LocalPlace[];
  selectedPlaceId: string | null;
  lastPlaceId?: string | null;
  onSelect: (place: LocalPlace) => void | Promise<void>;
}) {
  const { createPlace } = useLocalData();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    const name = newName.trim();
    if (!name) {
      Alert.alert("Give this place a name");
      return;
    }
    setSaving(true);
    try {
      const created = await createPlace(name);
      setNewName("");
      setAdding(false);
      await onSelect(created);
      onClose();
    } catch (error) {
      Alert.alert(
        "Couldn’t add place",
        error instanceof Error ? error.message : "Try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ padding: 16, gap: 6 }}>
          <Text style={{ color: colors.text, fontSize: 22, fontWeight: "700" }}>
            Where are you training?
          </Text>
          <Text style={{ color: colors.dim, fontSize: 14, lineHeight: 20 }}>
            Weights are remembered per place, so Home 400 stays Home 400.
          </Text>
        </View>
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled"
        >
          {places.map((place) => {
            const selected = place._id === selectedPlaceId;
            return (
              <Pressable
                key={place._id}
                onPress={() => {
                  void onSelect(place);
                  onClose();
                }}
                style={{
                  minHeight: 44,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  borderWidth: 1,
                  borderColor: selected ? colors.text : colors.line,
                  backgroundColor: selected ? colors.surface2 : colors.surface,
                  borderRadius: radius.lg,
                  paddingHorizontal: 12,
                }}
              >
                {place.starred ? (
                  <Star size={16} color={colors.text} fill={colors.text} />
                ) : (
                  <MapPin size={16} color={colors.dim} />
                )}
                <Text
                  style={{
                    flex: 1,
                    color: colors.text,
                    fontSize: 16,
                    fontWeight: "600",
                  }}
                  numberOfLines={1}
                >
                  {place.name}
                </Text>
                {place._id === lastPlaceId && !selected ? (
                  <Text style={{ color: colors.dim, fontSize: 12 }}>
                    Last time
                  </Text>
                ) : null}
                {selected ? <Check size={16} color={colors.text} /> : null}
              </Pressable>
            );
          })}
          {adding ? (
            <View
              style={{
                gap: 8,
                borderWidth: 1,
                borderColor: colors.line,
                borderRadius: radius.lg,
                padding: 12,
              }}
            >
              <Text style={{ color: colors.text, fontWeight: "600" }}>
                New place
              </Text>
              <TextInput
                value={newName}
                onChangeText={setNewName}
                placeholder="Elgin, Wheaton…"
                placeholderTextColor={colors.dim}
                autoFocus
                style={{
                  minHeight: 44,
                  borderWidth: 1,
                  borderColor: colors.line,
                  borderRadius: radius.md,
                  paddingHorizontal: 12,
                  color: colors.text,
                  fontSize: 16,
                }}
              />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Button
                    label={saving ? "Adding…" : "Add"}
                    onPress={() => void handleCreate()}
                    disabled={saving}
                  />
                </View>
                <Button
                  label="Cancel"
                  variant="outline"
                  onPress={() => {
                    setAdding(false);
                    setNewName("");
                  }}
                />
              </View>
            </View>
          ) : (
            <Button
              label="New place"
              variant="outline"
              icon={Plus}
              onPress={() => setAdding(true)}
            />
          )}
        </ScrollView>
        <View style={{ padding: 16 }}>
          <Button label="Close" variant="ghost" onPress={onClose} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

export function MachineChip({
  placeName,
  machineName,
  onPress,
}: {
  placeName: string | null;
  machineName: string | null;
  onPress: () => void;
}) {
  const label = machineName
    ? `${placeName ?? "Place"} · ${machineName}`
    : (placeName ?? "Place");
  return (
    <Pressable onPress={onPress} hitSlop={8}>
      <Text
        style={{
          color: colors.dim,
          fontSize: 12,
          fontWeight: "600",
          marginTop: 2,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function MachinePickerModal({
  visible,
  onClose,
  placeId,
  exerciseSlug,
  selectedMachineId,
  onSelect,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  placeId: string | null;
  exerciseSlug: string;
  selectedMachineId: string | null;
  onSelect: (machine: LocalMachine) => void | Promise<void>;
  onCreated: (machineId: string, name: string) => void | Promise<void>;
}) {
  const { createMachine } = useLocalData();
  const machines = useLocalMachinesForLift(placeId, exerciseSlug);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    const name = newName.trim();
    if (!name) {
      Alert.alert("Give this machine a name");
      return;
    }
    if (!placeId) {
      Alert.alert("Pick a place first");
      return;
    }
    setSaving(true);
    try {
      const created = await createMachine({
        placeId,
        exerciseSlug,
        name,
      });
      setNewName("");
      setAdding(false);
      await onCreated(created._id, created.name);
      onClose();
    } catch (error) {
      Alert.alert(
        "Couldn’t add machine",
        error instanceof Error ? error.message : "Try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ padding: 16, gap: 6 }}>
          <Text style={{ color: colors.text, fontSize: 22, fontWeight: "700" }}>
            Which machine?
          </Text>
          <Text style={{ color: colors.dim, fontSize: 14, lineHeight: 20 }}>
            Only this lift at this place. Last used is already selected.
          </Text>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
          {(machines ?? []).length === 0 && !adding ? (
            <Text style={{ color: colors.dim, fontSize: 14, lineHeight: 20 }}>
              One unnamed machine here so far. Add a second when the numbers
              differ — like the corner leg press.
            </Text>
          ) : null}
          {(machines ?? []).map((machine) => {
            const selected =
              machine._id === selectedMachineId ||
              (!selectedMachineId && machine.isDefault);
            return (
              <Pressable
                key={machine._id}
                onPress={() => {
                  void onSelect(machine);
                  onClose();
                }}
                style={{
                  minHeight: 44,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  borderWidth: 1,
                  borderColor: selected ? colors.text : colors.line,
                  backgroundColor: selected ? colors.surface2 : colors.surface,
                  borderRadius: radius.lg,
                  paddingHorizontal: 12,
                }}
              >
                <Text
                  style={{
                    flex: 1,
                    color: colors.text,
                    fontSize: 16,
                    fontWeight: "600",
                  }}
                >
                  {machine.name}
                </Text>
                {selected ? <Check size={16} color={colors.text} /> : null}
              </Pressable>
            );
          })}
          {adding ? (
            <View
              style={{
                gap: 8,
                borderWidth: 1,
                borderColor: colors.line,
                borderRadius: radius.lg,
                padding: 12,
              }}
            >
              <TextInput
                value={newName}
                onChangeText={setNewName}
                placeholder="Corner, by the cables…"
                placeholderTextColor={colors.dim}
                autoFocus
                style={{
                  minHeight: 44,
                  borderWidth: 1,
                  borderColor: colors.line,
                  borderRadius: radius.md,
                  paddingHorizontal: 12,
                  color: colors.text,
                  fontSize: 16,
                }}
              />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Button
                    label={saving ? "Adding…" : "Add"}
                    onPress={() => void handleCreate()}
                    disabled={saving}
                  />
                </View>
                <Button
                  label="Cancel"
                  variant="outline"
                  onPress={() => {
                    setAdding(false);
                    setNewName("");
                  }}
                />
              </View>
            </View>
          ) : (
            <Button
              label="New machine"
              variant="outline"
              icon={Plus}
              onPress={() => setAdding(true)}
            />
          )}
        </ScrollView>
        <View style={{ padding: space.md }}>
          <Button label="Close" variant="ghost" onPress={onClose} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}
