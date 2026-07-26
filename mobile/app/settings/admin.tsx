import { api } from "@backend/api";
import type { Id } from "@backend/dataModel";
import { useMutation, useQuery } from "convex/react";
import { ShieldOff, Users } from "lucide-react-native";
import { useState } from "react";
import { Alert, Text, View } from "react-native";

import {
  Button,
  Card,
  EmptyState,
  Field,
  PageHeader,
  Screen,
} from "@/components/ui";
import { colors, radius } from "@/theme";

export default function AdminScreen() {
  const entitlement = useQuery(api.routes.auth.users.entitlement);
  const isAdmin = entitlement?.isAdmin === true;
  const users = useQuery(
    api.routes.admin.users.listUsers,
    isAdmin ? {} : "skip",
  );
  const setUserPlan = useMutation(api.routes.admin.users.setUserPlan);

  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<Id<"users"> | null>(null);

  const filtered =
    users?.filter((user) =>
      user.email.toLowerCase().includes(search.trim().toLowerCase()),
    ) ?? [];

  async function setPlan(userId: Id<"users">, plan: "free" | "pro") {
    setSavingId(userId);
    try {
      await setUserPlan({ userId, plan });
    } catch {
      Alert.alert("Couldn’t update plan");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <Screen>
      <PageHeader
        back
        eyebrow="ADMIN"
        title="Pro access"
        subtitle="Grant Pro to users by email. Polar subscribers stay Pro regardless."
      />

      {entitlement === undefined ? (
        <Text style={{ color: colors.dim, fontSize: 13 }}>Loading…</Text>
      ) : !isAdmin ? (
        <EmptyState
          icon={ShieldOff}
          title="Admin access required"
          description="You don’t have permission to manage Pro access."
        />
      ) : (
        <>
          <Field
            value={search}
            onChangeText={setSearch}
            placeholder="Search by email"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            returnKeyType="search"
          />

          {users === undefined ? (
            <Text style={{ color: colors.dim, fontSize: 13 }}>
              Loading users…
            </Text>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Users}
              title={search.trim() ? "No matching users" : "No users yet"}
              description={
                search.trim()
                  ? "Try a different email fragment."
                  : "Users appear here once they sign in."
              }
            />
          ) : (
            filtered.map((user) => {
              const isPro = user.plan === "pro";
              const busy = savingId === user._id;
              return (
                <Card key={user._id} style={{ gap: 12 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "flex-start",
                      gap: 12,
                    }}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        numberOfLines={1}
                        style={{
                          color: colors.text,
                          fontSize: 14,
                          fontWeight: "600",
                        }}
                      >
                        {user.email || "(no email)"}
                      </Text>
                      <Text
                        style={{
                          color: colors.dim,
                          fontSize: 11,
                          marginTop: 3,
                        }}
                      >
                        {user.role === "admin" ? "Admin · " : ""}
                        Joined {new Date(user.createdAt).toLocaleDateString()}
                      </Text>
                    </View>
                    <Text
                      style={{
                        color: isPro ? colors.actionText : colors.dim,
                        backgroundColor: isPro
                          ? colors.action
                          : colors.surface2,
                        borderRadius: radius.sm,
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        fontSize: 11,
                        fontWeight: "700",
                        overflow: "hidden",
                      }}
                    >
                      {isPro ? "PRO" : "FREE"}
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Button
                      style={{ flex: 1 }}
                      label="Grant Pro"
                      variant={isPro ? "outline" : "primary"}
                      disabled={busy || isPro}
                      onPress={() => setPlan(user._id, "pro")}
                    />
                    <Button
                      style={{ flex: 1 }}
                      label="Revoke"
                      variant="outline"
                      disabled={busy || !isPro}
                      onPress={() => setPlan(user._id, "free")}
                    />
                  </View>
                </Card>
              );
            })
          )}
        </>
      )}
    </Screen>
  );
}
