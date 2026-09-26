import { describe, expect, it } from "vitest";

import { classifyTemplateSyncFailure } from "./template-sync-policy";

describe("classifyTemplateSyncFailure", () => {
  it.each([
    "[CONVEX M(routes/templates/mutations:create)] At most 100 templates are allowed",
    "At most 100 templates allowed",
  ])(
    "quarantines the permanent server template-limit rejection: %s",
    (message) => {
      expect(classifyTemplateSyncFailure(new Error(message))).toEqual({
        kind: "permanent",
        code: "template_limit",
        message: "At most 100 templates are allowed",
      });
    },
  );

  it.each([
    new Error("Network request failed"),
    new Error("Unauthenticated"),
    "Service unavailable",
    { message: "At most 100 templates allowed" },
  ])("leaves unknown failures retryable", (error) => {
    expect(classifyTemplateSyncFailure(error)).toEqual({ kind: "retryable" });
  });
});
