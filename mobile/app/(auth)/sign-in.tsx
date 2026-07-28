import { Dumbbell } from "lucide-react-native";
import { useState } from "react";
import { Text, View } from "react-native";
import { Redirect, router } from "expo-router";

import { useMobileAuth } from "@/auth/auth-provider";
import { Button, Screen } from "@/components/ui";
import { colors } from "@/theme";

export default function SignInScreen() {
  const { canUseApp, continueOffline, signIn } = useMobileAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (canUseApp) return <Redirect href="/dashboard" />;

  async function handleSignIn() {
    setLoading(true);
    setError(null);
    try {
      await signIn();
      router.replace("/dashboard");
    } catch {
      setError(
        "Sign-in could not be completed. Check your connection and try again — you can keep training without an account.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen
      scroll={false}
      contentStyle={{ flex: 1, justifyContent: "space-between" }}
    >
      <View style={{ paddingTop: 48 }}>
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            backgroundColor: colors.surface2,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 36,
          }}
        >
          <Dumbbell color={colors.text} size={28} />
        </View>
        <Text
          style={{
            color: colors.dim,
            fontSize: 12,
            fontWeight: "700",
            letterSpacing: 2.2,
          }}
        >
          WORKOUT
        </Text>
        <Text
          style={{
            color: colors.text,
            fontSize: 42,
            lineHeight: 45,
            fontWeight: "700",
            marginTop: 10,
          }}
        >
          Your training,{"\n"}without the noise.
        </Text>
        <Text
          style={{
            color: colors.dim,
            fontSize: 16,
            lineHeight: 24,
            marginTop: 18,
            maxWidth: 330,
          }}
        >
          Track every workout without a connection. Connect your account when
          you want your training to sync with the web.
        </Text>
      </View>

      <View style={{ gap: 12, paddingBottom: 12 }}>
        {error ? (
          <Text style={{ color: colors.danger, fontSize: 13, lineHeight: 18 }}>
            {error}
          </Text>
        ) : null}
        <Button
          label={loading ? "Opening sign in…" : "Sign in or create account"}
          onPress={handleSignIn}
          disabled={loading}
          size="lg"
        />
        <Button
          label="Use without an account"
          variant="outline"
          disabled={loading}
          size="lg"
          onPress={() =>
            void continueOffline().then(() => router.replace("/dashboard"))
          }
        />
        <Text
          style={{
            color: colors.faint,
            textAlign: "center",
            fontSize: 11,
            lineHeight: 16,
          }}
        >
          An account backs up your training and syncs it with Workout on the
          web. You can create one later — nothing is lost.
        </Text>
      </View>
    </Screen>
  );
}
