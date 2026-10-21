import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vitest";
import type { Doc } from "@backend/dataModel";
import { WorkoutLogSetRow } from "./workout-log-set-row";

vi.mock("@backend/api", () => ({
  api: { routes: { workouts: { mutations: { updateSet: "updateSet" } } } },
}));
vi.mock("convex/react", () => ({ useMutation: () => async () => {} }));
vi.mock("@/components/app/lift-weight-input", () => ({
  LiftWeightInput: "WeightInput",
}));
vi.mock("@/components/ui/button", () => ({ Button: "button" }));
vi.mock("@/components/ui/input", () => ({ Input: "input" }));
vi.mock("@/lib/haptics", () => ({ hapticTap: () => {} }));

let renderer: ReactTestRenderer | undefined;
afterEach(async () => {
  if (renderer) await act(async () => renderer!.unmount());
  renderer = undefined;
});

it("resets old-lift reps and optimistic completion when replacement keeps the set id", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const set = {
    _id: "set",
    weight: 135,
    reps: 5,
    completed: false,
  } as Doc<"sets">;
  const row = (exerciseSlug: string, values = set) => (
    <WorkoutLogSetRow
      exerciseSlug={exerciseSlug}
      set={values}
      index={1}
      editable
      canDelete
      includeBar
      onDelete={() => {}}
      highlighted={false}
      onLogged={() => {}}
    />
  );
  await act(async () => {
    renderer = create(row("bench"));
  });
  const originalInput = renderer!.root.findByType("input");
  await act(async () =>
    renderer!.root
      .findByProps({ "aria-label": "Mark set complete" })
      .props.onClick(),
  );
  expect(
    renderer!.root.findByProps({ "aria-label": "Mark set incomplete" }).props[
      "aria-pressed"
    ],
  ).toBe(true);
  await act(async () =>
    renderer!.update(row("dip", { ...set, weight: 0, reps: 12 })),
  );
  expect(renderer!.root.findByType("input")).not.toBe(originalInput);
  expect(renderer!.root.findByType("input").props.defaultValue).toBe(12);
  expect(
    renderer!.root.findByProps({ "aria-label": "Mark set complete" }).props[
      "aria-pressed"
    ],
  ).toBe(false);
});
