import { useMobileAuth } from "@/auth/auth-provider";
import { requirePublicConfig } from "@/lib/config";

export type DraftSet = { weight: number; reps: number };
export type TemplateDraft = {
  name: string;
  exercises: { slug: string; sets: DraftSet[] }[];
};
export type SessionDraft = {
  removeSlugs: string[];
  add: { slug: string; sets: DraftSet[] }[];
};

export function useAiGeneration() {
  const { fetchAccessToken } = useMobileAuth();

  async function post<T>(path: string, body: object): Promise<T> {
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
    if (!response.ok) throw new Error(payload.error || "AI generation failed");
    return payload;
  }

  return {
    generateTemplate: (body: {
      prompt: string;
      mode: "create" | "edit";
      current?: TemplateDraft;
    }) =>
      post<{ draft: TemplateDraft; droppedSlugs: string[] }>(
        "/api/ai/templates/generate",
        body,
      ),
    generateSession: (body: {
      prompt: string;
      current: {
        exercises: {
          slug: string;
          sets: { completed: boolean; weight: number; reps: number }[];
        }[];
      };
    }) =>
      post<{ draft: SessionDraft; droppedSlugs: string[] }>(
        "/api/ai/session/generate",
        body,
      ),
  };
}
