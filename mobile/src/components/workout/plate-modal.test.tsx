import { createElement, type ReactNode } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearPlateCompositionMemory } from "@shared/plates/composition";
import { PlateModal } from "./plate-modal";

vi.mock("expo-haptics", () => ({
  selectionAsync: vi.fn(),
}));
vi.mock("lucide-react-native", () =>
  Object.fromEntries(
    ["CircleDot", "Minus", "Plus", "RotateCcw", "X"].map((name) => [
      name,
      name,
    ]),
  ),
);
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/components/keyboard-aware-scroll", async () => {
  const { createElement: el, Fragment } = await import("react");
  return {
    KeyboardAwareFooterLayout: ({
      children,
      footer,
    }: {
      children: ReactNode;
      footer: ReactNode;
    }) => el(Fragment, null, children, footer),
  };
});
vi.mock("@/components/keyboard-sticky-footer", async () => {
  const { createElement: el } = await import("react");
  return {
    KeyboardStickyFooter: ({ children }: { children: ReactNode }) =>
      el("KeyboardStickyFooter", null, children),
  };
});
vi.mock("@/components/ui", async () => {
  const { createElement: el } = await import("react");
  return {
    Button: ({
      label,
      onPress,
      disabled,
    }: {
      label: string;
      onPress?: () => void;
      disabled?: boolean;
    }) => el("Button", { onPress, disabled, accessibilityLabel: label }, label),
    Field: ({
      label,
      value,
      onChangeText,
    }: {
      label?: string;
      value: string;
      onChangeText?: (value: string) => void;
    }) =>
      el("Field", {
        accessibilityLabel: label,
        value,
        onChangeText,
      }),
    Segmented: ({
      value,
      options,
      onChange,
    }: {
      value: string;
      options: readonly { value: string; label: string }[];
      onChange: (value: string) => void;
    }) =>
      el(
        "Segmented",
        { value },
        options.map((option) =>
          el(
            "Pressable",
            {
              key: option.value,
              accessibilityLabel: option.label,
              accessibilityState: { selected: option.value === value },
              onPress: () => onChange(option.value),
            },
            option.label,
          ),
        ),
      ),
  };
});
vi.mock("react-native", () => ({
  Modal: ({ children, visible }: { children: ReactNode; visible: boolean }) =>
    visible ? children : null,
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
  Text: "Text",
  View: "View",
}));

let renderer: ReactTestRenderer | undefined;
const apply = vi.fn();
const close = vi.fn();

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  apply.mockReset();
  close.mockReset();
  clearPlateCompositionMemory();
});

afterEach(async () => {
  if (renderer) await act(async () => renderer!.unmount());
  renderer = undefined;
  clearPlateCompositionMemory();
});

async function renderModal(props?: {
  visible?: boolean;
  target?: number;
  compositionId?: string;
}) {
  const modal = createElement(PlateModal, {
    visible: props?.visible ?? true,
    target: props?.target ?? 185,
    unit: "lb",
    barWeight: 45,
    compositionId: props?.compositionId ?? "bench-press:set-1",
    onClose: close,
    onApply: apply,
  });
  await act(async () => {
    if (renderer) renderer.update(modal);
    else renderer = create(modal);
  });
}

function labeled(label: string) {
  return renderer!.root.findByProps({ accessibilityLabel: label });
}

function maybeLabeled(label: string) {
  return renderer!.root.findAllByProps({ accessibilityLabel: label });
}

describe("iOS plate calculator edit-existing bar", () => {
  it("opens load-a-weight and edit-bar with the current 185 lb plates", async () => {
    await renderModal();
    expect(labeled("Target weight (lb)").props.value).toBe("185");
    expect(maybeLabeled("Tap to remove one 45 lb plate per side")).toHaveLength(
      1,
    );
    expect(maybeLabeled("Tap to remove one 25 lb plate per side")).toHaveLength(
      1,
    );
    expect(labeled("Use 185 lb").props.disabled).toBe(false);

    await act(async () => labeled("Edit bar").props.onPress());
    expect(labeled("Remove one 45 lb plate per side")).toBeTruthy();
    expect(labeled("Remove one 25 lb plate per side")).toBeTruthy();
    expect(labeled("Use 185 lb").props.disabled).toBe(false);
  });

  it("removes and replaces plates on both tabs, then applies the edited total", async () => {
    await renderModal();
    await act(async () =>
      labeled("Tap to remove one 25 lb plate per side").props.onPress(),
    );
    expect(labeled("Target weight (lb)").props.value).toBe("135");
    expect(labeled("Use 135 lb")).toBeTruthy();

    await act(async () =>
      labeled("Add one 10 lb plate per side").props.onPress(),
    );
    expect(labeled("Target weight (lb)").props.value).toBe("155");

    await act(async () => labeled("Edit bar").props.onPress());
    expect(maybeLabeled("Tap to remove one 45 lb plate per side")).toHaveLength(
      1,
    );
    expect(maybeLabeled("Tap to remove one 10 lb plate per side")).toHaveLength(
      1,
    );

    await act(async () => labeled("Use 155 lb").props.onPress());
    expect(apply).toHaveBeenCalledWith(155);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("preserves edited plates across reopen and isolates another lift", async () => {
    await renderModal();
    await act(async () =>
      labeled("Tap to remove one 25 lb plate per side").props.onPress(),
    );
    await act(async () =>
      labeled("Add one 10 lb plate per side").props.onPress(),
    );
    await act(async () =>
      labeled("Add one 10 lb plate per side").props.onPress(),
    );
    await act(async () =>
      labeled("Add one 5 lb plate per side").props.onPress(),
    );
    await act(async () => labeled("Use 185 lb").props.onPress());

    await renderModal({ visible: false });
    await renderModal();
    expect(maybeLabeled("Tap to remove one 25 lb plate per side")).toHaveLength(
      0,
    );
    expect(maybeLabeled("Tap to remove one 10 lb plate per side")).toHaveLength(
      1,
    );
    expect(maybeLabeled("Tap to remove one 5 lb plate per side")).toHaveLength(
      1,
    );

    await renderModal({
      compositionId: "squat:set-1",
      target: 185,
    });
    expect(maybeLabeled("Tap to remove one 25 lb plate per side")).toHaveLength(
      1,
    );
    expect(maybeLabeled("Tap to remove one 10 lb plate per side")).toHaveLength(
      0,
    );
  });
});
