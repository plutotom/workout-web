import { describe, expect, it } from "vitest";

import {
  offlineAiSettingsCopy,
  planAiSettingsCopy,
  signedOutWelcomeAiCopy,
} from "./ai-copy";

describe("AI settings copy", () => {
  it("does not tell logged-out Intelligence users they need an account", () => {
    expect(offlineAiSettingsCopy(true)).toMatch(/no account/i);
    expect(offlineAiSettingsCopy(true)).not.toMatch(
      /Create an account to use AI/i,
    );
    expect(signedOutWelcomeAiCopy()).toMatch(/without an account/i);
    expect(signedOutWelcomeAiCopy()).toMatch(/Apple Intelligence/i);
  });

  it("does not tell Free Intelligence users that Pro is required for generate", () => {
    expect(planAiSettingsCopy(true)).toMatch(/works on Free/i);
    expect(planAiSettingsCopy(true)).not.toMatch(/Pro unlocks AI workout/i);
  });

  it("still mentions Apple Intelligence on Free when the model is not ready", () => {
    expect(planAiSettingsCopy(false)).toMatch(
      /Apple Intelligence works on Free/i,
    );
    expect(offlineAiSettingsCopy(false)).toMatch(/without an account/i);
  });
});
