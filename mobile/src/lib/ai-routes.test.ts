import { describe, expect, it } from "vitest";

import { isTemplateAiQuery } from "./ai-routes";

describe("isTemplateAiQuery", () => {
  it("opens the on-device sheet from the logged-out Describe with AI entry", () => {
    expect(isTemplateAiQuery("1")).toBe(true);
    expect(isTemplateAiQuery(["1"])).toBe(true);
    expect(isTemplateAiQuery("true")).toBe(true);
    expect(isTemplateAiQuery(undefined)).toBe(false);
    expect(isTemplateAiQuery("0")).toBe(false);
  });
});
