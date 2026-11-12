import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vitest";
import { PlateCalcButton } from "./plate-calculator";
vi.mock("@backend/api", () => ({
  api: { routes: { auth: { users: { current: "user" } } } },
}));
vi.mock("convex-helpers/react/cache/hooks", () => ({
  useQuery: () => ({ unit: "lb", barWeightLb: 45 }),
}));
vi.mock("@/components/ui/button", () => ({ Button: "button" }));
vi.mock("@/components/ui/input", () => ({ Input: "input" }));
vi.mock("@/components/ui/label", () => ({ Label: "label" }));
vi.mock("@/components/ui/sheet", () => ({
  Sheet: "sheet",
  SheetContent: "section",
  SheetHeader: "header",
  SheetTitle: "h2",
}));
vi.mock("@/components/ui/tabs", () => ({
  Tabs: "tabs",
  TabsList: "nav",
  TabsTrigger: "trigger",
  TabsContent: "content",
}));
let renderer: ReactTestRenderer;
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
});
it("reopens exact nonstandard plates and isolates a second input", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const apply = vi.fn();
  await act(async () => {
    renderer = create(
      <>
        <PlateCalcButton
          weight={185}
          onApply={apply}
          aria-label="Bench plates"
        />
        <PlateCalcButton
          weight={185}
          onApply={vi.fn()}
          aria-label="Squat plates"
        />
      </>,
    );
  });
  const open = (label: string) =>
    renderer.root
      .findAllByType("button")
      .find((node) => node.props["aria-label"] === label)!
      .props.onClick();
  const editor = () =>
    renderer.root.find(
      (node) =>
        typeof node.type === "function" && node.type.name === "WeightToPlates",
    );
  await act(async () => open("Bench plates"));
  for (const [plate, delta] of [
    [25, -1],
    [10, 2],
    [5, 1],
  ])
    await act(async () => editor().props.onChangeCount(plate, delta));
  await act(async () => editor().props.onApply(185));
  expect(apply).toHaveBeenCalledWith(185);
  await act(async () => open("Bench plates"));
  expect(editor().props.counts).toEqual({ 45: 1, 10: 2, 5: 1 });
  await act(async () =>
    renderer.root.findAllByType("sheet" as never)[0].props.onOpenChange(false),
  );
  await act(async () => open("Squat plates"));
  expect(editor().props.counts).toEqual({ 45: 1, 25: 1 });
});
