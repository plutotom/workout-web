import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

let handlerInstalled = false;

export function supportsIosNotifications() {
  return Platform.OS === "ios";
}

function ensureNotificationHandler() {
  if (!supportsIosNotifications() || handlerInstalled) return;
  handlerInstalled = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export async function hasNotificationPermission() {
  if (!supportsIosNotifications()) return false;
  try {
    ensureNotificationHandler();
    const permission = await Notifications.getPermissionsAsync();
    return permission.granted;
  } catch {
    return false;
  }
}

export async function requestNotificationPermission() {
  if (!supportsIosNotifications()) return false;
  try {
    ensureNotificationHandler();
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    const next = await Notifications.requestPermissionsAsync();
    return next.granted;
  } catch {
    return false;
  }
}
