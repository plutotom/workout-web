import { Bell, ChevronRight } from "lucide-react-native";
import { useState } from "react";
import { Alert, Modal, Pressable, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button, Card, SectionTitle } from "@/components/ui";
import { useLocalData, useLocalPreferences } from "@/data/local/provider";
import {
  requestNotificationPermission,
  supportsIosNotifications,
} from "@/lib/notifications";
import { colors, radius, space } from "@/theme";

type NotificationKey =
  | "restTimerNotificationsEnabled"
  | "appleHealthImportNotificationsEnabled";

export function NotificationSettingsCard() {
  const preferences = useLocalPreferences();
  const { setNotificationPreferences } = useLocalData();
  const [open, setOpen] = useState(false);
  const [busyKey, setBusyKey] = useState<NotificationKey | null>(null);

  if (!supportsIosNotifications()) return null;

  const restTimerEnabled = preferences?.restTimerNotificationsEnabled ?? true;
  const appleHealthEnabled =
    preferences?.appleHealthImportNotificationsEnabled ?? false;
  const enabledCount = [restTimerEnabled, appleHealthEnabled].filter(
    Boolean,
  ).length;

  async function toggle(key: NotificationKey, next: boolean) {
    if (!preferences || busyKey) return;
    setBusyKey(key);
    try {
      if (next && !(await requestNotificationPermission())) {
        Alert.alert(
          "Notifications are off",
          "Allow notifications for Grayed Lift in iPhone Settings, then try again.",
        );
        return;
      }
      await setNotificationPreferences({
        restTimerNotificationsEnabled:
          key === "restTimerNotificationsEnabled"
            ? next
            : preferences.restTimerNotificationsEnabled,
        appleHealthImportNotificationsEnabled:
          key === "appleHealthImportNotificationsEnabled"
            ? next
            : preferences.appleHealthImportNotificationsEnabled,
      });
    } catch {
      Alert.alert("Couldn’t save notification setting", "Please try again.");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <>
      <Card>
        <Bell color={colors.text} size={22} strokeWidth={2.3} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open notification settings"
          onPress={() => setOpen(true)}
          disabled={preferences === undefined}
          style={({ pressed }) => [
            { flexDirection: "row", alignItems: "center", gap: 10 },
            pressed && { opacity: 0.72 },
          ]}
        >
          <View style={{ flex: 1, gap: 5 }}>
            <SectionTitle title="Notifications" />
            <Text style={{ color: colors.dim, fontSize: 13, lineHeight: 19 }}>
              {preferences === undefined
                ? "Loading notification settings…"
                : enabledCount === 0
                  ? "Notifications are off"
                  : `${enabledCount} notification type${enabledCount === 1 ? "" : "s"} on`}
            </Text>
          </View>
          <ChevronRight color={colors.dim} size={20} />
        </Pressable>
      </Card>

      <Modal
        animationType="slide"
        transparent
        visible={open}
        onRequestClose={() => setOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.62)" }}>
          <Pressable
            accessibilityLabel="Close notification settings"
            onPress={() => setOpen(false)}
            style={{ flex: 1 }}
          />
          <SafeAreaView
            edges={["bottom"]}
            style={{
              backgroundColor: colors.surface,
              borderTopLeftRadius: radius.lg,
              borderTopRightRadius: radius.lg,
              borderTopWidth: 1,
              borderColor: colors.line,
            }}
          >
            <View style={{ padding: space.lg, gap: 18 }}>
              <View
                style={{
                  alignSelf: "center",
                  width: 38,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: colors.input,
                }}
              />
              <View style={{ gap: 6 }}>
                <Text
                  style={{
                    color: colors.text,
                    fontSize: 25,
                    fontWeight: "700",
                  }}
                >
                  Notifications
                </Text>
                <Text
                  style={{ color: colors.dim, fontSize: 13, lineHeight: 19 }}
                >
                  Choose which updates Grayed Lift can send while you are away
                  from the app.
                </Text>
              </View>
              <NotificationToggle
                label="Rest timer ends"
                description="Get a notification when a rest countdown finishes."
                value={restTimerEnabled}
                disabled={busyKey !== null}
                onChange={(next) =>
                  void toggle("restTimerNotificationsEnabled", next)
                }
              />
              <NotificationToggle
                label="Apple Health workout imports complete"
                description="Know when an automatic Apple Health workout import finishes."
                value={appleHealthEnabled}
                disabled={busyKey !== null}
                onChange={(next) =>
                  void toggle("appleHealthImportNotificationsEnabled", next)
                }
              />
              <Button
                label="Done"
                variant="outline"
                onPress={() => setOpen(false)}
              />
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    </>
  );
}

function NotificationToggle({
  label,
  description,
  value,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        borderTopWidth: 1,
        borderTopColor: colors.line,
        paddingTop: 16,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => onChange(!value)}
        style={{ flex: 1, gap: 4 }}
      >
        <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}>
          {label}
        </Text>
        <Text style={{ color: colors.dim, fontSize: 12, lineHeight: 17 }}>
          {description}
        </Text>
      </Pressable>
      <Switch
        accessibilityLabel={label}
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        trackColor={{ false: colors.input, true: colors.action }}
        thumbColor={value ? colors.actionText : colors.faint}
        ios_backgroundColor={colors.input}
      />
    </View>
  );
}
