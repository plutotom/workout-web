import { Minus, Plus, X } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { formatClock } from "@/lib/rest-timer";
import { colors, radius } from "@/theme";

export function RestBar({
  remaining,
  label,
  onAdd,
  onClear,
}: {
  remaining: number;
  label: string;
  onAdd: (seconds: number) => void;
  onClear: () => void;
}) {
  return (
    <View
      style={{
        position: "absolute",
        left: 12,
        right: 12,
        bottom: 12,
        minHeight: 66,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.input,
        backgroundColor: colors.surface2,
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 14,
        gap: 12,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: colors.text,
            fontSize: 22,
            fontWeight: "700",
            fontVariant: ["tabular-nums"],
          }}
        >
          {formatClock(remaining)}
        </Text>
        <Text
          numberOfLines={1}
          style={{ color: colors.dim, fontSize: 10, marginTop: 2 }}
        >
          {label}
        </Text>
      </View>
      <Pressable onPress={() => onAdd(-15)} hitSlop={7}>
        <Minus size={19} color={colors.dim} />
      </Pressable>
      <Pressable onPress={() => onAdd(15)} hitSlop={7}>
        <Plus size={19} color={colors.text} />
      </Pressable>
      <Pressable onPress={onClear} hitSlop={7}>
        <X size={19} color={colors.dim} />
      </Pressable>
    </View>
  );
}
