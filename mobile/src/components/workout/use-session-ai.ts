import { useState } from "react";
import { Alert } from "react-native";

import { sessionDraftReviewCopy } from "@/components/workout/session-draft-review";
import { useLocalData } from "@/data/local/provider";
import { useAiGeneration } from "@/lib/ai";
import { useCatalog } from "@/providers/catalog-provider";

type SessionExercise = {
  _id: string;
  slug: string;
  sets: { completed: boolean }[];
};

export function useSessionAi(session: {
  _id: string;
  exercises: SessionExercise[];
}) {
  const catalog = useCatalog();
  const { addExercise, removeExercise } = useLocalData();
  const [aiOpen, setAiOpen] = useState(false);
  const {
    generateSession,
    available: aiAvailable,
    usesApple,
  } = useAiGeneration();

  async function generate(prompt: string) {
    const result = await generateSession({
      prompt,
      current: {
        exercises: session.exercises.map((exercise) => ({
          slug: exercise.slug,
          done: exercise.sets.filter((set) => set.completed).length,
          total: exercise.sets.length,
        })),
      },
    });
    const description = sessionDraftReviewCopy(result.draft, catalog.short);
    await new Promise<void>((resolve, reject) => {
      Alert.alert("Review AI changes", description || "No changes", [
        {
          text: "Cancel",
          style: "cancel",
          onPress: () => reject(new Error("Cancelled")),
        },
        {
          text: "Apply",
          onPress: () =>
            void (async () => {
              for (const slug of result.draft.removeSlugs) {
                const exercise = session.exercises.find(
                  (candidate) => candidate.slug === slug,
                );
                if (exercise) await removeExercise(exercise._id);
              }
              for (const exercise of result.draft.add) {
                await addExercise(session._id, exercise.slug, exercise.sets);
              }
              resolve();
            })().catch(reject),
        },
      ]);
    });
  }

  return { aiAvailable, usesApple, aiOpen, setAiOpen, generate };
}
