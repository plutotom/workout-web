import { Sparkles, X } from "lucide-react-native";
import { useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button, Field } from "@/components/ui";
import { colors } from "@/theme";

export function AiPromptModal({
  visible,
  title,
  description,
  onClose,
  onGenerate,
}: {
  visible: boolean;
  title: string;
  description: string;
  onClose: () => void;
  onGenerate: (prompt: string) => Promise<void>;
}) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!prompt.trim()) return;
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
        style={{ flex: 1, backgroundColor: colors.bg, padding: 16 }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 24,
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
            marginTop: 8,
            marginBottom: 22,
          }}
        >
          {description}
        </Text>
        <Field
          value={prompt}
          onChangeText={setPrompt}
          multiline
          placeholder="Make this a 45-minute push workout with extra shoulder work…"
          autoFocus
        />
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
        <View style={{ marginTop: "auto", gap: 9 }}>
          <Button
            label={loading ? "Thinking…" : "Generate draft"}
            icon={Sparkles}
            size="lg"
            disabled={loading || !prompt.trim()}
            onPress={submit}
          />
          <Button label="Cancel" variant="ghost" onPress={onClose} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}
