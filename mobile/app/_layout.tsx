import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import "react-native-gesture-handler";
import "react-native-reanimated";

import { AppProviders } from "@/providers/app-providers";
import { colors } from "@/theme";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <AppProviders>
            <StatusBar style="light" />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.bg },
                animation: "slide_from_right",
                freezeOnBlur: true,
              }}
            >
              <Stack.Screen name="index" />
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="template/[id]" />
              <Stack.Screen name="template/preview/[id]" />
              <Stack.Screen name="template/history/[id]" />
              <Stack.Screen name="workout/[sessionId]" />
              <Stack.Screen name="workout/recap/[sessionId]" />
              <Stack.Screen name="exercises/index" />
              <Stack.Screen name="exercises/[slug]" />
              <Stack.Screen name="insights/lifts" />
              <Stack.Screen name="insights/sessions" />
              <Stack.Screen name="insights/exercise/[slug]" />
              <Stack.Screen name="week" />
              <Stack.Screen name="settings/health" />
              <Stack.Screen name="+not-found" />
            </Stack>
          </AppProviders>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
