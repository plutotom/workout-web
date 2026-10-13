import { useState, type ComponentProps, type ReactNode } from "react";
import {
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

/**
 * Gap kept between the caret (or focused input) and the keyboard, or a sticky
 * footer sitting on top of the keyboard.
 */
export const KEYBOARD_CARET_GAP = 20;

const FOOTER_HEIGHT_FALLBACK = 88;

type KeyboardAwareScrollProps = ComponentProps<typeof KeyboardAwareScrollView>;

/**
 * Scroll view that keeps the focused caret above the iOS keyboard.
 * Use this instead of ScrollView or RN's KeyboardAvoidingView whenever the
 * screen (or sheet) contains a text input.
 */
export function KeyboardAwareScroll({
  bottomOffset = KEYBOARD_CARET_GAP,
  keyboardShouldPersistTaps = "handled",
  keyboardDismissMode = "interactive",
  showsVerticalScrollIndicator = false,
  ...props
}: KeyboardAwareScrollProps) {
  return (
    <KeyboardAwareScrollView
      bottomOffset={bottomOffset}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      keyboardDismissMode={keyboardDismissMode}
      showsVerticalScrollIndicator={showsVerticalScrollIndicator}
      {...props}
    />
  );
}

/**
 * Scroll + sticky-footer pair: the footer rides above the keyboard, and the
 * scroll view offsets the caret by the footer's height so typing is never
 * hidden behind either.
 */
export function KeyboardAwareFooterLayout({
  children,
  footer,
  contentContainerStyle,
  style,
  refreshControl,
}: {
  children: ReactNode;
  footer: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  refreshControl?: KeyboardAwareScrollProps["refreshControl"];
}) {
  const [footerHeight, setFooterHeight] = useState(FOOTER_HEIGHT_FALLBACK);
  return (
    <>
      <KeyboardAwareScroll
        style={[{ flex: 1 }, style]}
        contentContainerStyle={contentContainerStyle}
        bottomOffset={footerHeight + KEYBOARD_CARET_GAP}
        extraKeyboardSpace={footerHeight}
        refreshControl={refreshControl}
      >
        {children}
      </KeyboardAwareScroll>
      <View
        onLayout={(event: LayoutChangeEvent) => {
          const next = Math.ceil(event.nativeEvent.layout.height);
          if (next > 0) setFooterHeight(next);
        }}
      >
        {footer}
      </View>
    </>
  );
}
