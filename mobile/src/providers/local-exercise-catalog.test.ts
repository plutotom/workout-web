import { expect, it } from "vitest";

import { localCustomSlug, type LocalCustomExercise } from "@/data/local/types";
import { buildLocalExerciseCatalog } from "./local-exercise-catalog";

const lift: LocalCustomExercise = {
  _id: "fixture-local-id",
  slug: "custom:fixture-cloud-id",
  remoteId: "fixture-cloud-id",
  name: "Fixture lift",
  short: "Fixture",
  category: "arms",
  usesBar: false,
  archived: false,
  updatedAt: 1,
};

it("resolves adopted local identities without duplicating picker results", () => {
  const catalog = buildLocalExerciseCatalog([lift]);
  const alias = localCustomSlug(lift._id);
  expect(catalog.name(alias)).toBe(lift.name);
  expect(catalog.short(alias)).toBe(lift.short);
  expect(catalog.category(alias)).toBe(lift.category);
  expect(catalog.usesBar(alias)).toBe(false);
  expect(catalog.get(alias)?.slug).toBe(lift.slug);
  expect(catalog.search("Fixture", "all")).toHaveLength(1);
});

it("resolves archived aliases while excluding them from pickers", () => {
  const catalog = buildLocalExerciseCatalog([{ ...lift, archived: true }]);
  expect(catalog.name(localCustomSlug(lift._id))).toBe(lift.name);
  expect(catalog.search("Fixture", "all")).toHaveLength(0);
  expect(catalog.archived).toHaveLength(1);
});

it("does not resolve another account's missing local identity", () => {
  const alias = localCustomSlug(lift._id);
  const catalog = buildLocalExerciseCatalog([]);
  expect(catalog.get(alias)).toBeUndefined();
  expect(catalog.name(alias)).toBe(alias);
});
