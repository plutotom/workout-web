import {
  act,
  create,
  type ReactTestRenderer,
  type ReactTestRendererJSON,
} from "react-test-renderer";
import { getFunctionName, type FunctionReference } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../../backend/_generated/api";
import SocialScreen from "../../app/(tabs)/social";

const mocks = vi.hoisted(() => ({
  auth: {
    isAuthenticated: false,
    accountStatus: "connecting",
    retryAccountConnection: vi.fn(),
  },
  feed: undefined as undefined | unknown[],
  me: undefined as undefined | { id: string },
  mutate: Object.assign(vi.fn().mockResolvedValue(null), {
    withOptimisticUpdate: vi.fn(),
  }),
}));
vi.mock("@backend/api", async () => import("../../../backend/_generated/api"));
vi.mock("@/auth/auth-provider", () => ({ useMobileAuth: () => mocks.auth }));
vi.mock("@/components/social-post", () => ({ SocialPost: "Post" }));
vi.mock("@/lib/social-optimistic", () => ({
  optimisticReadNotifications: vi.fn(),
}));
vi.mock("@/theme", () => ({ colors: {} }));
vi.mock("@/components/ui", async () => {
  const { createElement } = await import("react");
  return {
    Screen: "Screen",
    PageHeader: "PageHeader",
    Button: ({ label }: { label: string }) =>
      createElement("Button", {}, label),
    FullScreenLoader: ({ label }: { label: string }) =>
      createElement("Loader", {}, label),
    EmptyState: ({
      title,
      description,
      action,
    }: {
      title: string;
      description: string;
      action: unknown;
    }) => createElement("EmptyState", {}, title, description, action as never),
  };
});
vi.mock("react-native", () => ({
  ActivityIndicator: "Spinner",
  Alert: { alert: vi.fn() },
  Modal: "Modal",
  Pressable: "Pressable",
  Text: "Text",
  View: "View",
}));
vi.mock("expo-router", () => ({ router: { push: vi.fn() } }));
vi.mock("lucide-react-native", () => ({
  Bell: "Bell",
  Search: "Search",
  UserRound: "UserRound",
}));
vi.mock("convex/react", () => ({
  useQuery: (query: FunctionReference<"query">, args: unknown) => {
    if (args === "skip") return undefined;
    if (
      getFunctionName(query) === getFunctionName(api.routes.social.queries.feed)
    )
      return mocks.feed;
    if (
      getFunctionName(query) === getFunctionName(api.routes.social.queries.me)
    )
      return mocks.me;
    return [];
  },
  useMutation: () => mocks.mutate,
}));

let renderer: ReactTestRenderer | undefined;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mocks.auth.isAuthenticated = false;
  mocks.auth.accountStatus = "connecting";
  mocks.feed = undefined;
  mocks.me = undefined;
  mocks.mutate.withOptimisticUpdate.mockReturnValue(mocks.mutate);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(async () => {
  if (renderer) await act(async () => renderer?.unmount());
  renderer = undefined;
  vi.restoreAllMocks();
});

async function render() {
  await act(async () => {
    renderer = create(<SocialScreen />);
  });
  return renderedText(renderer!.toJSON());
}

function renderedText(
  node: ReactTestRendererJSON | ReactTestRendererJSON[] | string | null,
): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(renderedText).join(" ");
  return node?.children?.map(renderedText).join(" ") ?? "";
}

describe("social account loading", () => {
  it("shows only a loader during connection, never sign-in controls", async () => {
    const view = await render();
    expect(view).toContain("Loading social…");
    expect(view).not.toContain("Sign in");
    expect(view).not.toContain("Your feed starts here");
  });
  it("continues showing a loader until the authenticated feed and profile arrive", async () => {
    mocks.auth.isAuthenticated = true;
    mocks.auth.accountStatus = "ready";
    mocks.feed = [];
    const view = await render();
    expect(view).toContain("Loading social…");
    expect(view).not.toContain("Sign in");
    mocks.me = { id: "viewer" };
    await act(async () => renderer!.update(<SocialScreen />));
    expect(renderedText(renderer!.toJSON())).toContain("Your feed starts here");
  });
  it("offers sign-in only after the account is confirmed offline", async () => {
    mocks.auth.accountStatus = "offline";
    const view = await render();
    expect(view).toContain("Sign in");
    expect(view).not.toContain("Loading social…");
  });
  it("offers reconnection rather than sign-in after an account connection failure", async () => {
    mocks.auth.accountStatus = "error";
    const view = await render();
    expect(view).toContain("Reconnect");
    expect(view).not.toContain("Sign in");
  });
});
