import { Link, Stack } from "expo-router";
import { Text, View } from "react-native";

import { Button } from "@/components/ui";
import { colors } from "@/theme";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Not found", headerShown: true }} />
      <View
        style={{
          flex: 1,
          backgroundColor: colors.bg,
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          gap: 16,
        }}
      >
        <Text style={{ color: colors.text, fontSize: 22, fontWeight: "700" }}>
          Screen not found
        </Text>
        <Text
          style={{
            color: colors.dim,
            fontSize: 14,
            textAlign: "center",
            lineHeight: 20,
          }}
        >
          That route isn’t in this build. Head home and try again — a stale deep
          link or old Metro cache can cause this.
        </Text>
        <Link href="/" asChild>
          <Button label="Go home" />
        </Link>
      </View>
    </>
  );
}
