import { api } from "@backend/api";
import { useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useMobileAuth } from "@/auth/auth-provider";
import {
  generateSessionOnApple,
  generateTemplateOnApple,
  getAppleFoundationAvailability,
} from "@/lib/apple-foundation";
import {
  appleAiIsUsable,
  catalogExercisesForAi,
  shouldFallBackToApple,
  UNAVAILABLE_APPLE_FOUNDATION,
  type AppleFoundationAvailability,
} from "@shared/ai/apple-on-device";
import { requirePublicConfig } from "@/lib/config";
import { useCatalog } from "@/providers/catalog-provider";

export type DraftSet = { weight: number; reps: number };
export type TemplateDraft = {
  name: string;
  exercises: { slug: string; sets: DraftSet[] }[];
};
export type SessionDraft = {
  removeSlugs: string[];
  add: { slug: string; sets: DraftSet[] }[];
};

export function useAppleAiAvailability() {
  const [availability, setAvailability] = useState<AppleFoundationAvailability>(
    UNAVAILABLE_APPLE_FOUNDATION,
  );

  useEffect(() => {
    let cancelled = false;
    void getAppleFoundationAvailability().then((next) => {
      if (!cancelled) setAvailability(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return availability;
}

export function useAiGeneration() {
  const { fetchAccessToken, isAuthenticated } = useMobileAuth();
  const entitlement = useQuery(
    api.routes.auth.users.entitlement,
    isAuthenticated ? {} : "skip",
  );
  const catalog = useCatalog();
  const apple = useAppleAiAvailability();
  const isPro = entitlement?.isPro === true;
  const appleReady = appleAiIsUsable(apple);
  const available = isPro || appleReady;

  const catalogForAi = useMemo(
    () => catalogExercisesForAi(catalog.all),
    [catalog],
  );

  const post = useCallback(
    async <T>(path: string, body: object): Promise<T> => {
      const token = await fetchAccessToken();
      if (!token) throw new Error("Sign in again to use AI");
      const { webUrl } = requirePublicConfig();
      const response = await fetch(`${webUrl}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      } & T;
      if (!response.ok) {
        throw new Error(payload.error || "AI generation failed");
      }
      return payload;
    },
    [fetchAccessToken],
  );

  const generateTemplate = useCallback(
    async (body: {
      prompt: string;
      mode: "create" | "edit";
      current?: TemplateDraft;
    }) => {
      if (isPro) {
        try {
          return await post<{ draft: TemplateDraft; droppedSlugs: string[] }>(
            "/api/ai/templates/generate",
            body,
          );
        } catch (error) {
          if (!appleReady || !shouldFallBackToApple(error)) throw error;
        }
      }
      if (!appleReady) {
        throw new Error(
          isAuthenticated
            ? "AI templates require Pro, or Apple Intelligence on this iPhone."
            : "Turn on Apple Intelligence to generate workouts without an account.",
        );
      }
      return generateTemplateOnApple({
        prompt: body.prompt,
        mode: body.mode,
        catalog: catalogForAi,
        current: body.current,
      });
    },
    [appleReady, catalogForAi, isAuthenticated, isPro, post],
  );

  const generateSession = useCallback(
    async (body: {
      prompt: string;
      current: {
        exercises: { slug: string; done: number; total: number }[];
      };
    }) => {
      if (isPro) {
        try {
          return await post<{ draft: SessionDraft; droppedSlugs: string[] }>(
            "/api/ai/session/generate",
            body,
          );
        } catch (error) {
          if (!appleReady || !shouldFallBackToApple(error)) throw error;
        }
      }
      if (!appleReady) {
        throw new Error(
          isAuthenticated
            ? "AI workouts require Pro, or Apple Intelligence on this iPhone."
            : "Turn on Apple Intelligence to generate workouts without an account.",
        );
      }
      return generateSessionOnApple({
        prompt: body.prompt,
        catalog: catalogForAi,
        current: body.current,
      });
    },
    [appleReady, catalogForAi, isAuthenticated, isPro, post],
  );

  return {
    available,
    usesApple: !isPro && appleReady,
    generateTemplate,
    generateSession,
  };
}
