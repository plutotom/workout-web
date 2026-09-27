import { describe, expect, it } from "vitest";

import { duplicateTemplatePlan } from "./template_dedupe";

describe("duplicateTemplatePlan", () => {
  it("keeps the oldest row and deletes later copies", () => {
    expect(
      duplicateTemplatePlan([
        {
          id: "new",
          name: "Push",
          createdAt: 200,
          slugs: ["bench"],
        },
        {
          id: "old",
          name: "Push",
          createdAt: 100,
          slugs: ["bench"],
        },
        {
          id: "other",
          name: "Pull",
          createdAt: 100,
          slugs: ["row"],
        },
      ]),
    ).toEqual([{ keepId: "old", deleteIds: ["new"] }]);
  });

  it("does not merge different exercise lists with the same name", () => {
    expect(
      duplicateTemplatePlan([
        {
          id: "a",
          name: "Push",
          createdAt: 1,
          slugs: ["bench"],
        },
        {
          id: "b",
          name: "Push",
          createdAt: 2,
          slugs: ["ohp"],
        },
      ]),
    ).toEqual([]);
  });
});
