import { api } from "@backend/api";
import { useMutation, useQuery } from "convex/react";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { useMobileAuth } from "@/auth/auth-provider";
import { Button, PageHeader, Screen } from "@/components/ui";
import { colors } from "@/theme";

export default function PeopleScreen() {
  const { isAuthenticated } = useMobileAuth();
  const [search, setSearch] = useState("");
  const ensureDiscoverable = useMutation(
    api.routes.social.mutations.ensureDiscoverable,
  );
  useEffect(() => {
    if (isAuthenticated) {
      void ensureDiscoverable().catch((error) => {
        console.warn("[social] couldn't assign a discoverable username", error);
      });
    }
  }, [isAuthenticated, ensureDiscoverable]);

  const people = useQuery(
    api.routes.social.queries.search,
    isAuthenticated ? { query: search } : "skip",
  );
  const me = useQuery(
    api.routes.social.queries.me,
    isAuthenticated ? {} : "skip",
  );
  const showSuggestions = search.trim().length === 0;
  return (
    <Screen>
      <PageHeader
        back
        title="Find athletes"
        subtitle="Search by name or username"
      />
      <TextInput
        accessibilityLabel="Search athletes"
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="Name or @username"
        placeholderTextColor={colors.dim}
        value={search}
        onChangeText={setSearch}
        style={{
          color: colors.text,
          borderColor: colors.line,
          borderWidth: 1,
          borderRadius: 12,
          padding: 14,
          marginBottom: 14,
        }}
      />
      {showSuggestions && (people?.length ?? 0) > 0 ? (
        <Text
          style={{
            color: colors.dim,
            fontSize: 12,
            fontWeight: "600",
            letterSpacing: 1,
            marginBottom: 10,
          }}
        >
          SUGGESTED ATHLETES
        </Text>
      ) : null}
      {people?.map((person) => (
        <Pressable
          key={person.id}
          onPress={() =>
            router.push({
              pathname: "/social/profile/[userId]",
              params: { userId: person.id },
            })
          }
          style={{
            paddingVertical: 14,
            borderBottomWidth: 1,
            borderBottomColor: colors.line,
          }}
        >
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}>
            {person.name}
          </Text>
          <Text style={{ color: colors.dim }}>@{person.handle}</Text>
        </Pressable>
      ))}
      {search.trim() && people?.length === 0 ? (
        <Text style={{ color: colors.dim }}>No athletes found.</Text>
      ) : null}
      {!search.trim() && people?.length === 0 ? (
        <View style={{ gap: 12, marginTop: 8 }}>
          <Text style={{ color: colors.dim, lineHeight: 20 }}>
            No athletes to show yet. Athletes need a username before they appear
            here — set yours so friends can find you.
          </Text>
          {me ? (
            <Button
              label="Edit your profile"
              variant="outline"
              onPress={() => router.push("/social/edit-profile")}
            />
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}
