import { api } from "@backend/api";
import { useQuery } from "convex/react";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Text, TextInput } from "react-native";

import { PageHeader, Screen } from "@/components/ui";
import { colors } from "@/theme";

export default function PeopleScreen() {
  const [search, setSearch] = useState("");
  const people = useQuery(api.routes.social.queries.search, { handle: search });
  return (
    <Screen>
      <PageHeader back title="Find athletes" subtitle="Search by username" />
      <TextInput
        accessibilityLabel="Search usernames"
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="Username"
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
      {search && people?.length === 0 ? (
        <Text style={{ color: colors.dim }}>No athletes found.</Text>
      ) : null}
    </Screen>
  );
}
