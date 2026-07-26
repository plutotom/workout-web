import { Tabs, Redirect } from "expo-router";
import {
  Dumbbell,
  Home,
  Settings,
  TrendingUp,
  type LucideIcon,
} from "lucide-react-native";
import { View } from "react-native";

import { useMobileAuth } from "@/auth/auth-provider";
import { colors } from "@/theme";

function TabIcon({
  icon: Icon,
  focused,
}: {
  icon: LucideIcon;
  focused: boolean;
}) {
  return (
    <View style={{ alignItems: "center", gap: 5 }}>
      <View
        style={{
          width: 28,
          height: 2,
          borderRadius: 2,
          backgroundColor: focused ? colors.text : "transparent",
        }}
      />
      <Icon
        size={21}
        strokeWidth={focused ? 2.5 : 2}
        color={focused ? colors.text : colors.dim}
      />
    </View>
  );
}

export default function TabLayout() {
  const { isLoading, isAuthenticated } = useMobileAuth();
  if (!isLoading && !isAuthenticated)
    return <Redirect href="/(auth)/sign-in" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        freezeOnBlur: true,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.dim,
        tabBarStyle: {
          backgroundColor: colors.bg,
          borderTopColor: colors.line,
          height: 78,
          paddingTop: 0,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: "600", marginTop: 2 },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} icon={Home} />
          ),
        }}
      />
      <Tabs.Screen
        name="templates"
        options={{
          title: "Templates",
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} icon={Dumbbell} />
          ),
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: "Insights",
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} icon={TrendingUp} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} icon={Settings} />
          ),
        }}
      />
    </Tabs>
  );
}
