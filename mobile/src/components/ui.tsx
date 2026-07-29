import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState, type ReactNode } from "react";
import { ChevronLeft, type LucideIcon } from "lucide-react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";

import { colors, radius, space } from "@/theme";

export function Screen({
  children,
  scroll = true,
  contentStyle,
}: {
  children: ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const content = (
    <View style={[styles.screenContent, contentStyle]}>{children}</View>
  );
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <KeyboardAvoidingView
        style={styles.safe}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {scroll ? (
          <ScrollView
            contentContainerStyle={{ flexGrow: 1 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {content}
          </ScrollView>
        ) : (
          content
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function FullScreenLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <SafeAreaView style={[styles.safe, styles.center]}>
      <ActivityIndicator color={colors.text} />
      <Text style={styles.loaderText}>{label}</Text>
    </SafeAreaView>
  );
}

type ButtonVariant = "primary" | "outline" | "ghost" | "danger" | "success";

export function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  disabled = false,
  icon: Icon,
  style,
}: {
  label: string;
  onPress?: () => void | Promise<void>;
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  icon?: LucideIcon;
  style?: StyleProp<ViewStyle>;
}) {
  const palette = buttonPalette[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => {
        void Haptics.selectionAsync();
        void onPress?.();
      }}
      style={({ pressed }) => [
        styles.button,
        styles[`button_${size}`],
        { backgroundColor: palette.background, borderColor: palette.border },
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      {Icon ? (
        <Icon size={size === "sm" ? 15 : 18} color={palette.text} />
      ) : null}
      <Text style={[styles.buttonText, { color: palette.text }]}>{label}</Text>
    </Pressable>
  );
}

const buttonPalette: Record<
  ButtonVariant,
  { background: string; border: string; text: string }
> = {
  primary: {
    background: colors.action,
    border: colors.action,
    text: colors.actionText,
  },
  outline: {
    background: "transparent",
    border: colors.input,
    text: colors.text,
  },
  ghost: { background: "transparent", border: "transparent", text: colors.dim },
  danger: { background: colors.danger, border: colors.danger, text: colors.bg },
  success: {
    background: colors.success,
    border: colors.success,
    text: colors.bg,
  },
};

export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function PageHeader({
  title,
  eyebrow,
  subtitle,
  back = false,
  action,
}: {
  title: string;
  eyebrow?: string;
  subtitle?: ReactNode;
  back?: boolean;
  action?: ReactNode;
}) {
  return (
    <View style={styles.headerRow}>
      {back ? (
        <Pressable
          accessibilityLabel="Go back"
          hitSlop={10}
          onPress={() => router.back()}
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}
        >
          <ChevronLeft size={23} color={colors.text} />
        </Pressable>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          typeof subtitle === "string" ? (
            <Text style={styles.subtitle}>{subtitle}</Text>
          ) : (
            subtitle
          )
        ) : null}
      </View>
      {action}
    </View>
  );
}

export function Field({
  label,
  hint,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
  editable = true,
  onFocus,
  onBlur,
  ...props
}: {
  label?: string;
  hint?: string;
  value: string;
  onChangeText?: (value: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  multiline?: boolean;
  editable?: boolean;
} & Omit<TextInputProps, "style">) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 7 }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.faint}
        keyboardType={keyboardType}
        multiline={multiline}
        editable={editable}
        selectionColor={colors.text}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        style={[
          styles.input,
          focused && editable && styles.inputFocused,
          multiline && {
            minHeight: 100,
            paddingTop: 13,
            textAlignVertical: "top",
          },
          !editable && { color: colors.faint },
        ]}
        {...props}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function Segmented<T extends string | number | boolean>({
  value,
  options,
  onChange,
}: {
  value: T | undefined;
  options: readonly { value: T; label: string; hint?: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={String(option.value)}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.segment,
              active && styles.segmentActive,
              pressed && styles.pressed,
            ]}
          >
            <Text
              style={[styles.segmentText, active && styles.segmentTextActive]}
            >
              {option.label}
            </Text>
            {option.hint ? (
              <Text
                style={[styles.segmentHint, active && { color: colors.faint }]}
              >
                {option.hint}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export function SectionTitle({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.sectionTitle}>
      <Text style={styles.sectionTitleText}>{title}</Text>
      {action}
    </View>
  );
}

export function EmptyState({
  title,
  description,
  icon: Icon,
  action,
}: {
  title: string;
  description: string;
  icon?: LucideIcon;
  action?: ReactNode;
}) {
  return (
    <View style={styles.empty}>
      {Icon ? <Icon size={24} color={colors.dim} /> : null}
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDescription}>{description}</Text>
      {action ? <View style={{ marginTop: 8 }}>{action}</View> : null}
    </View>
  );
}

export function Metric({
  value,
  label,
}: {
  value: string | number;
  label: string;
}) {
  return (
    <View style={{ alignItems: "center", flex: 1 }}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  screenContent: {
    width: "100%",
    maxWidth: 600,
    alignSelf: "center",
    padding: space.md,
    paddingBottom: 32,
    gap: 20,
  },
  center: { alignItems: "center", justifyContent: "center", gap: 12 },
  loaderText: { color: colors.dim, fontSize: 13 },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: 12,
  },
  button: {
    borderWidth: 1,
    borderRadius: radius.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  button_sm: { minHeight: 34, paddingHorizontal: 12 },
  button_md: { minHeight: 42, paddingHorizontal: 16 },
  button_lg: { minHeight: 50, paddingHorizontal: 18 },
  buttonText: { fontSize: 14, fontWeight: "600" },
  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 52,
  },
  back: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface2,
  },
  eyebrow: {
    color: colors.dim,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: 5,
  },
  title: {
    color: colors.text,
    fontSize: 30,
    lineHeight: 34,
    fontWeight: "700",
    letterSpacing: -0.8,
  },
  subtitle: { color: colors.dim, fontSize: 13, lineHeight: 19, marginTop: 5 },
  label: { color: colors.text, fontSize: 13, fontWeight: "600" },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.input,
    backgroundColor: colors.surface,
    color: colors.text,
    borderRadius: radius.md,
    paddingHorizontal: 13,
    fontSize: 16,
  },
  inputFocused: {
    borderColor: colors.action,
    backgroundColor: colors.surface2,
  },
  hint: { color: colors.faint, fontSize: 11, lineHeight: 15 },
  segmented: { flexDirection: "row", gap: 8 },
  segment: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.input,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  segmentActive: { backgroundColor: colors.action, borderColor: colors.action },
  segmentText: { color: colors.text, fontWeight: "600", fontSize: 13 },
  segmentTextActive: { color: colors.actionText },
  segmentHint: {
    color: colors.dim,
    fontSize: 10,
    marginTop: 2,
    textAlign: "center",
  },
  sectionTitle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionTitleText: { color: colors.text, fontSize: 16, fontWeight: "600" },
  empty: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.input,
    borderRadius: radius.lg,
    padding: 28,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  emptyDescription: {
    color: colors.dim,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    maxWidth: 310,
  },
  metricValue: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  metricLabel: { color: colors.dim, fontSize: 11, marginTop: 2 },
});
