import { router } from "expo-router";
import { Sparkles } from "lucide-react-native";

import { Button } from "@/components/ui";
import { useAiGeneration } from "@/lib/ai";
import { NEW_TEMPLATE_AI_HREF } from "@/lib/ai-routes";

export function DescribeWithAiButton({
  variant = "outline",
  size,
}: {
  variant?: "primary" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
}) {
  const { available } = useAiGeneration();
  if (!available) return null;
  return (
    <Button
      label="Describe with AI"
      variant={variant}
      size={size}
      icon={Sparkles}
      onPress={() => router.push(NEW_TEMPLATE_AI_HREF)}
    />
  );
}
