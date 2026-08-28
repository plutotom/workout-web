import { Sparkles, X } from "lucide-react-native";
import { useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { GeneratingLoader } from "@/components/generating-loader";
import { Button, Field } from "@/components/ui";
import { colors } from "@/theme";
import { APPLE_ON_DEVICE_PROMPT_CHARS } from "@shared/ai/apple-on-device";
import { AI_MAX_PROMPT_CHARS } from "@shared/ai/request-schemas";

export function AiPromptModal({
  visible,
  title,
  description,
  loadingLabel = "Thinking it through…",
  onDevice = false,
  onClose,
  onGenerate,
}: {
  visible: boolean;
  title: string;
  description: string;
  /** Shown under the animation while the draft is generating. */
  loadingLabel?: string;
  /** Caps the prompt to the on-device 4k budget instead of the server 2k cap. */
  onDevice?: boolean;
  onClose: () => void;
  onGenerate: (prompt: string) => Promise<void>;
}) {
  const maxChars = onDevice
    ? APPLE_ON_DEVICE_PROMPT_CHARS
    : AI_MAX_PROMPT_CHARS;
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!prompt.trim()) return;
    Keyboard.dismiss();
    setLoading(true);
    setError(null);
    try {
      await onGenerate(prompt.trim());
      setPrompt("");
      onClose();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Couldn’t generate changes",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView
        edges={["top", "bottom"]}
        style={{ flex: 1, backgroundColor: colors.bg }}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 16,
              paddingTop: 16,
              paddingBottom: 12,
            }}
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: colors.surface2,
              }}
            >
              <Sparkles size={20} color={colors.text} />
            </View>
            <Pressable onPress={onClose} hitSlop={12}>
              <X size={23} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView
            style={{ flex: 1, minHeight: 0 }}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingBottom: 16,
              gap: 8,
            }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}
          >
            <Text
              style={{
                color: colors.text,
                fontSize: 28,
                lineHeight: 32,
                fontWeight: "700",
              }}
            >
              {title}
            </Text>
            <Text
              style={{
                color: colors.dim,
                fontSize: 14,
                lineHeight: 21,
                marginBottom: 14,
              }}
            >
              {description}
            </Text>
            {loading ? (
              <View style={{ alignItems: "center", paddingTop: 12 }}>
                <GeneratingLoader label={loadingLabel} />
              </View>
            ) : (
              <>
                <Field
                  value={prompt}
                  onChangeText={setPrompt}
                  multiline
                  placeholder="Make this a 45-minute push workout with extra shoulder work…"
                  autoFocus
                  maxLength={maxChars}
                />
                <Text
                  style={{
                    color: colors.faint,
                    fontSize: 12,
                    textAlign: "right",
                  }}
                >
                  {prompt.length}/{maxChars}
                </Text>
                {error ? (
                  <Text
                    style={{
                      color: colors.danger,
                      fontSize: 12,
                      lineHeight: 18,
                      marginTop: 10,
                    }}
                  >
                    {error}
                  </Text>
                ) : null}
              </>
            )}
          </ScrollView>

          <View
            style={{
              paddingHorizontal: 16,
              paddingBottom: 16,
              paddingTop: 8,
              gap: 9,
            }}
          >
            {loading ? null : (
              <Button
                label="Generate draft"
                icon={Sparkles}
                size="lg"
                disabled={!prompt.trim()}
                onPress={submit}
              />
            )}
            <Button
              label="Cancel"
              variant="ghost"
              disabled={loading}
              onPress={onClose}
            />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
