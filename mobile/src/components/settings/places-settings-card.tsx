import { api } from "@backend/api";
import type { Id } from "@backend/dataModel";
import { useMutation } from "convex/react";
import { Archive, MapPin, Pencil, Plus, Star } from "lucide-react-native";
import { useState } from "react";
import { Alert, Modal, Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useMobileAuth } from "@/auth/auth-provider";
import { Button, Card, SectionTitle } from "@/components/ui";
import { useLocalData, useLocalPlaces } from "@/data/local/provider";
import type { LocalPlace } from "@/data/local/types";
import { colors, radius } from "@/theme";

export function PlacesSettingsCard() {
  const { isAuthenticated } = useMobileAuth();
  const places = useLocalPlaces();
  const { adoptPlace, starPlace, archivePlace } = useLocalData();
  const createRemote = useMutation(api.routes.places.mutations.create);
  const renameRemote = useMutation(api.routes.places.mutations.rename);
  const starRemote = useMutation(api.routes.places.mutations.star);
  const archiveRemote = useMutation(api.routes.places.mutations.archive);

  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [renaming, setRenaming] = useState<LocalPlace | null>(null);
  const [renameValue, setRenameValue] = useState("");

  function requireOnline(): boolean {
    if (isAuthenticated) return true;
    Alert.alert(
      "Connect to manage places",
      "New places and edits need an account so they sync to every device.",
    );
    return false;
  }

  function requireRemoteId(place: LocalPlace): place is LocalPlace & {
    remoteId: string;
  } {
    if (place.remoteId) return true;
    Alert.alert(
      "This place hasn’t synced yet",
      "Connect and try again when you’re online.",
    );
    return false;
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name) {
      Alert.alert("Give this place a name");
      return;
    }
    if (!requireOnline()) return;
    setSaving(true);
    try {
      const id = await createRemote({ name });
      await adoptPlace({
        id,
        remoteId: id,
        name,
        starred: false,
      });
      setNewName("");
      setAdding(false);
    } catch (error) {
      Alert.alert(
        "Couldn’t add place",
        error instanceof Error
          ? error.message
          : "Try again when you’re online.",
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
    if (!requireOnline()) return;
    if (!requireRemoteId(renaming)) return;
    setSaving(true);
    try {
      await renameRemote({
        placeId: renaming.remoteId as Id<"places">,
        name,
      });
      await adoptPlace({
        id: renaming._id,
        remoteId: renaming.remoteId,
        name,
        starred: renaming.starred,
      });
      setRenaming(null);
    } catch (error) {
      Alert.alert(
        "Couldn’t rename",
        error instanceof Error
          ? error.message
          : "Try again when you’re online.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleStar(place: LocalPlace) {
    if (place.starred) return;
    if (!requireOnline()) return;
    if (!requireRemoteId(place)) return;
    try {
      await starRemote({ placeId: place.remoteId as Id<"places"> });
      await starPlace(place._id);
    } catch (error) {
      Alert.alert(
        "Couldn’t star place",
        error instanceof Error
          ? error.message
          : "Try again when you’re online.",
      );
    }
  }

  function confirmArchive(place: LocalPlace) {
    if (place.starred) {
      Alert.alert("Star another place before removing Home");
      return;
    }
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
    if (!requireOnline()) return;
    if (!requireRemoteId(place)) return;
    try {
      await archiveRemote({ placeId: place.remoteId as Id<"places"> });
      await archivePlace(place._id);
    } catch (error) {
      Alert.alert(
        "Couldn’t remove place",
        error instanceof Error
          ? error.message
          : "Try again when you’re online.",
      );
    }
  }

  return (
    <>
      <Card>
        <MapPin color={colors.text} size={22} />
        <SectionTitle title="Places" />
        <Text style={{ color: colors.dim, fontSize: 13, lineHeight: 19 }}>
          Home, Elgin, Wheaton — working weights are remembered per place.
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
                place.starred ? "Starred home place" : `Star ${place.name}`
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
              disabled={place.starred}
              onPress={() => confirmArchive(place)}
              style={{
                width: 44,
                height: 44,
                alignItems: "center",
                justifyContent: "center",
                opacity: place.starred ? 0.35 : 1,
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
              placeholder="Elgin, Wheaton…"
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
            onPress={() => {
              if (!requireOnline()) return;
              setAdding(true);
            }}
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
