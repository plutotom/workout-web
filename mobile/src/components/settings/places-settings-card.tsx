import { Archive, MapPin, Pencil, Plus, Star } from "lucide-react-native";
import { useState } from "react";
import { Alert, Modal, Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button, Card, SectionTitle } from "@/components/ui";
import { useLocalData, useLocalPlaces } from "@/data/local/provider";
import type { LocalPlace } from "@/data/local/types";
import { colors, radius } from "@/theme";

export function PlacesSettingsCard() {
  const places = useLocalPlaces();
  const { createPlace, renamePlace, starPlace, archivePlace } = useLocalData();

  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [renaming, setRenaming] = useState<LocalPlace | null>(null);
  const [renameValue, setRenameValue] = useState("");

  async function handleCreate() {
    const name = newName.trim();
    if (!name) {
      Alert.alert("Give this place a name");
      return;
    }
    setSaving(true);
    try {
      await createPlace(name);
      setNewName("");
      setAdding(false);
    } catch (error) {
      Alert.alert(
        "Couldn’t add place",
        error instanceof Error ? error.message : "Try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleRename() {
    if (!renaming) return;
    const name = renameValue.trim();
    if (!name) {
      Alert.alert("Give this place a name");
      return;
    }
    setSaving(true);
    try {
      await renamePlace(renaming._id, name);
      setRenaming(null);
    } catch (error) {
      Alert.alert(
        "Couldn’t rename",
        error instanceof Error ? error.message : "Try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleStar(place: LocalPlace) {
    if (place.starred) return;
    try {
      await starPlace(place._id);
    } catch (error) {
      Alert.alert(
        "Couldn’t star place",
        error instanceof Error ? error.message : "Try again.",
      );
    }
  }

  function confirmArchive(place: LocalPlace) {
    Alert.alert(
      `Remove ${place.name}?`,
      "Past workouts keep the name. You can add this place again later.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => void handleArchive(place),
        },
      ],
    );
  }

  async function handleArchive(place: LocalPlace) {
    try {
      await archivePlace(place._id);
    } catch (error) {
      Alert.alert(
        "Couldn’t remove place",
        error instanceof Error ? error.message : "Try again.",
      );
    }
  }

  return (
    <>
      <Card>
        <MapPin color={colors.text} size={22} />
        <SectionTitle title="Places" />
        <Text style={{ color: colors.dim, fontSize: 13, lineHeight: 19 }}>
          Working weights are remembered per gym, so numbers at one place
          don&apos;t follow you to another.
        </Text>
        {(places ?? []).map((place) => (
          <View
            key={place._id}
            style={{
              minHeight: 44,
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              borderWidth: 1,
              borderColor: colors.line,
              borderRadius: radius.lg,
              paddingHorizontal: 8,
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                place.starred
                  ? "Default place"
                  : `Star ${place.name} as default`
              }
              onPress={() => void handleStar(place)}
              style={{
                width: 44,
                height: 44,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Star
                size={16}
                color={place.starred ? colors.text : colors.dim}
                fill={place.starred ? colors.text : "transparent"}
              />
            </Pressable>
            <Text
              numberOfLines={1}
              style={{
                flex: 1,
                color: colors.text,
                fontSize: 16,
                fontWeight: "600",
              }}
            >
              {place.name}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Rename ${place.name}`}
              onPress={() => {
                setRenaming(place);
                setRenameValue(place.name);
              }}
              style={{
                width: 44,
                height: 44,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Pencil size={16} color={colors.dim} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove ${place.name}`}
              onPress={() => confirmArchive(place)}
              style={{
                width: 44,
                height: 44,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Archive size={16} color={colors.dim} />
            </Pressable>
          </View>
        ))}
        {adding ? (
          <View style={{ gap: 8 }}>
            <TextInput
              value={newName}
              onChangeText={setNewName}
              placeholder="Home gym, commercial gym, hotel…"
              placeholderTextColor={colors.dim}
              autoFocus
              style={{
                minHeight: 44,
                borderWidth: 1,
                borderColor: colors.line,
                borderRadius: radius.lg,
                paddingHorizontal: 12,
                color: colors.text,
                fontSize: 16,
              }}
            />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Button
                label={saving ? "Adding…" : "Add"}
                style={{ flex: 1 }}
                disabled={saving}
                onPress={() => void handleCreate()}
              />
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
      </Card>

      <Modal
        visible={renaming !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setRenaming(null)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
          <View style={{ padding: 16, gap: 12 }}>
            <Text
              style={{ color: colors.text, fontSize: 22, fontWeight: "700" }}
            >
              Rename place
            </Text>
            <Text style={{ color: colors.dim, fontSize: 14, lineHeight: 20 }}>
              This name is stored on workouts you finish here.
            </Text>
            <TextInput
              value={renameValue}
              onChangeText={setRenameValue}
              autoFocus
              style={{
                minHeight: 44,
                borderWidth: 1,
                borderColor: colors.line,
                borderRadius: radius.lg,
                paddingHorizontal: 12,
                color: colors.text,
                fontSize: 16,
              }}
            />
            <Button
              label={saving ? "Saving…" : "Save"}
              disabled={saving}
              onPress={() => void handleRename()}
            />
            <Button
              label="Cancel"
              variant="outline"
              onPress={() => setRenaming(null)}
            />
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
}
