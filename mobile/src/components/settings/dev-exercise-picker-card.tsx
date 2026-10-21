import { Check } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { useExercisePickerStyle } from "@/components/exercise-picker/chrome";
import { Card, SectionTitle } from "@/components/ui";
import {
  EXERCISE_PICKER_STYLES,
  exercisePickerStyleAllowed,
  writeExercisePickerStyle,
} from "@/lib/exercise-picker-style";
import { colors, radius } from "@/theme";

export function DevExercisePickerCard() {
  const style = useExercisePickerStyle();
  if (!exercisePickerStyleAllowed()) return null;

  return (
    <Card>
      <SectionTitle title="Dev · Add exercise picker" />
      <Text style={{ color: colors.dim, fontSize: 13, lineHeight: 19 }}>
        Exploration only. Production always uses Current. Flip this, then open
        Add exercise (or Replace) on a workout or template.
      </Text>
      <View style={{ gap: 8 }}>
        {EXERCISE_PICKER_STYLES.map((option) => {
          const active = option.id === style;
          return (
            <Pressable
              key={option.id}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => writeExercisePickerStyle(option.id)}
              style={{
                minHeight: 52,
                borderWidth: 1,
                borderColor: active ? colors.action : colors.input,
                backgroundColor: active ? colors.action : "transparent",
                borderRadius: radius.md,
                paddingHorizontal: 12,
                paddingVertical: 10,
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
              }}
            >
              <View style={{ flex: 1, gap: 3 }}>
                <Text
                  style={{
                    color: active ? colors.actionText : colors.text,
                    fontSize: 14,
                    fontWeight: "700",
                  }}
                >
                  {option.label}
                </Text>
                <Text
                  style={{
                    color: active ? colors.actionText : colors.dim,
                    fontSize: 11,
                    lineHeight: 15,
                  }}
                >
                  {option.summary}
                </Text>
              </View>
              {active ? (
                <Check size={18} color={colors.actionText} strokeWidth={3} />
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}
