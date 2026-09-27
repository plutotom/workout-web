import { describe, expect, it } from "vitest";

import {
  adoptCloudTemplateId,
  classifyTemplateSyncFailure,
} from "./template-sync-policy";

describe("adoptCloudTemplateId", () => {
  const push = {
    remoteId: "cloud-push",
    name: "Push Day",
    exercises: [{ slug: "bench" }],
  };

  it("adopts a uniquely named cloud template", () => {
    expect(
      adoptCloudTemplateId({ name: "Push Day", exercises: [{ slug: "ohp" }] }, [
        push,
      ]),
    ).toBe("cloud-push");
  });

  it("uses name+slugs when the name is shared", () => {
    expect(
      adoptCloudTemplateId(
        { name: "Push Day", exercises: [{ slug: "bench" }] },
        [
          push,
          {
            remoteId: "cloud-push-2",
            name: "Push Day",
            exercises: [{ slug: "ohp" }],
          },
        ],
      ),
    ).toBe("cloud-push");
  });

  it("does not guess when two same-name templates share slugs", () => {
    expect(
      adoptCloudTemplateId(
        { name: "Push Day", exercises: [{ slug: "bench" }] },
        [push, { ...push, remoteId: "cloud-push-copy" }],
      ),
    ).toBeNull();
  });
});

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
