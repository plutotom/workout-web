import { useState, type ComponentProps, type ReactNode } from "react";
import {
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {
  KeyboardAwareScrollView,
  KeyboardChatScrollView,
} from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Gap kept between the caret (or focused input) and the keyboard, or a sticky
 * footer sitting on top of the keyboard.
 */
export const KEYBOARD_CARET_GAP = 20;

const FOOTER_HEIGHT_FALLBACK = 88;

type KeyboardAwareScrollProps = ComponentProps<typeof KeyboardAwareScrollView>;
export type KeyboardScrollMode = "insets" | "layout" | "composer";

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
  keyboardMode,
}: {
  children: ReactNode;
  footer: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  refreshControl?: KeyboardAwareScrollProps["refreshControl"];
  /** Use `composer` when the focused input lives in the sticky footer. */
  keyboardMode?: KeyboardScrollMode;
}) {
  const [footerHeight, setFooterHeight] = useState(FOOTER_HEIGHT_FALLBACK);
  const insets = useSafeAreaInsets();
  return (
    <>
      {keyboardMode === "composer" ? (
        // Caret tracking only scrolls inputs inside the scroll view. A footer
        // composer needs keyboard-driven scrolling even though its input is a
        // sibling. Match KeyboardStickyFooter's safe-area-adjusted movement;
        // the footer already reserves its own height in the normal layout.
        <KeyboardChatScrollView
          style={[{ flex: 1 }, style]}
          contentContainerStyle={contentContainerStyle}
          offset={insets.bottom}
          keyboardLiftBehavior="always"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
        >
          {children}
        </KeyboardChatScrollView>
      ) : (
        <KeyboardAwareScroll
          style={[{ flex: 1 }, style]}
          mode={keyboardMode}
          contentContainerStyle={contentContainerStyle}
          bottomOffset={footerHeight + KEYBOARD_CARET_GAP}
          extraKeyboardSpace={footerHeight}
          refreshControl={refreshControl}
        >
          {children}
        </KeyboardAwareScroll>
      )}
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
