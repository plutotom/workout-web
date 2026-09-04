import type { ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Pins a sheet footer above the soft keyboard. Use instead of hand-rolled
 * keyboard listeners or RN's KeyboardAvoidingView inside pageSheet modals.
 *
 * Pair with SafeAreaView `edges={["top"]}` — this footer owns the bottom inset.
 */
export function KeyboardStickyFooter({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
      <View style={[{ paddingBottom: 12 + insets.bottom }, style]}>
        {children}
      </View>
    </KeyboardStickyView>
  );
}
