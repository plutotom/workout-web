import { api } from "@backend/api";
import { useMutation, useQuery } from "convex/react";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, Text, TextInput, View } from "react-native";

import { Button, PageHeader, Screen } from "@/components/ui";
import { colors } from "@/theme";

export default function EditProfileScreen() {
  const me = useQuery(api.routes.social.queries.me);
  if (!me)
    return (
      <Screen>
        <PageHeader back title="Edit profile" />
      </Screen>
    );
  return (
    <Editor
      key={me.id}
      initial={{
        name: me.name === "Athlete" ? "" : me.name,
        handle: me.handle ?? "",
        bio: me.bio,
      }}
    />
  );
}

function Editor({
  initial,
}: {
  initial: { name: string; handle: string; bio: string };
}) {
  const save = useMutation(api.routes.social.mutations.saveProfile);
  const [name, setName] = useState(initial.name);
  const [handle, setHandle] = useState(initial.handle);
  const [bio, setBio] = useState(initial.bio);
  const [saving, setSaving] = useState(false);
  async function submit() {
    setSaving(true);
    try {
      await save({ name, handle, bio });
      router.back();
    } catch (error) {
      Alert.alert(
        "Couldn't save profile",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <Screen>
      <PageHeader back title="Edit profile" />
      {(
        [
          ["Name", name, setName, 60],
          ["Username", handle, setHandle, 24],
          ["Bio", bio, setBio, 300],
        ] as const
      ).map(([label, value, setter, limit]) => (
        <View key={label} style={{ marginBottom: 16 }}>
          <Text style={{ color: colors.text }}>{label}</Text>
          <TextInput
            accessibilityLabel={label}
            value={value}
            onChangeText={setter}
            maxLength={limit}
            autoCapitalize={label === "Username" ? "none" : "sentences"}
            multiline={label === "Bio"}
            placeholderTextColor={colors.dim}
            style={{
              color: colors.text,
              borderColor: colors.line,
              borderWidth: 1,
              borderRadius: 12,
              padding: 14,
              marginTop: 8,
            }}
          />
        </View>
      ))}
      <Button
        label={saving ? "Saving…" : "Save profile"}
        disabled={saving}
        onPress={submit}
      />
    </Screen>
  );
}
