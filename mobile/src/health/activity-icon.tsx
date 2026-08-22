import { Platform, View } from "react-native";
import { SymbolView } from "expo-symbols";
import {
  Activity,
  Bike,
  Dumbbell,
  PersonStanding,
  Waves,
} from "lucide-react-native";

import { colors } from "@/theme";

const LUCIDE_FALLBACK: Record<string, typeof Activity> = {
  "figure.run": PersonStanding,
  "figure.walk": PersonStanding,
  bicycle: Bike,
  "figure.pool.swim": Waves,
  dumbbell: Dumbbell,
};

export function HealthActivityIcon({
  symbolName,
  size = 22,
  color = colors.text,
}: {
  symbolName: string;
  size?: number;
  color?: string;
}) {
  if (Platform.OS === "ios") {
    return (
      <SymbolView
        name={symbolName as "figure.run"}
        size={size}
        tintColor={color}
        fallback={
          <LucideHealthIcon symbolName={symbolName} size={size} color={color} />
        }
      />
    );
  }
  return <LucideHealthIcon symbolName={symbolName} size={size} color={color} />;
}

function LucideHealthIcon({
  symbolName,
  size,
  color,
}: {
  symbolName: string;
  size: number;
  color: string;
}) {
  const Icon = LUCIDE_FALLBACK[symbolName] ?? Activity;
  return (
    <View style={{ width: size, height: size, alignItems: "center" }}>
      <Icon size={size} color={color} />
    </View>
  );
}
