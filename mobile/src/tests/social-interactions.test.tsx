import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { getFunctionName, type FunctionReference } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ShareScreen from "../../app/social/share/[sessionId]";
import PostScreen from "../../app/social/post/[postId]";
import { SocialPost } from "../components/social-post";
import type { Id } from "../../../backend/_generated/dataModel";

const mocks = vi.hoisted(() => ({
  auth: { isAuthenticated: true, accountStatus: "ready" },
  params: {
    sessionId: "local_1",
    postId: "post_1",
    fromShare: undefined as string | undefined,
  },
  focused: true,
  remoteId: "remote_1" as string | null | undefined,
  shared: null as string | null | undefined,
  post: undefined as unknown,
  share: vi.fn(),
  copy: vi.fn(),
  connected: true,
  localWorkout: {
    templateName: "Leg day",
    exercises: [
      {
        _id: "exercise_1",
        slug: "squat",
        sets: [{ completed: true }, { completed: false }],
      },
    ],
  } as unknown,
  remoteWorkout: null as unknown,
  haptic: vi.fn().mockResolvedValue(undefined),
  alert: vi.fn(),
  mutate: Object.assign(vi.fn().mockResolvedValue(false), {
    withOptimisticUpdate: vi.fn(),
  }),
  router: {
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    dismissTo: vi.fn(),
    canGoBack: vi.fn(),
  },
}));

vi.mock("@backend/api", async () => import("../../../backend/_generated/api"));
vi.mock("@/auth/auth-provider", () => ({
  useMobileAuth: () => mocks.auth,
}));
vi.mock("@/data/local/provider", () => ({
  useLocalWorkout: () => mocks.localWorkout,
}));
vi.mock("@/providers/catalog-provider", () => ({
  useCatalog: () => ({
    name: (slug: string) => (slug === "squat" ? "Squat" : slug),
  }),
}));
vi.mock("@/lib/use-performance-timing", () => ({
  useCommitTiming: () => vi.fn(),
  useLoadTiming: vi.fn(),
}));
vi.mock("expo-haptics", () => ({ selectionAsync: mocks.haptic }));
vi.mock("expo-router", async () => {
  const { useEffect } = await import("react");
  return {
    router: mocks.router,
    useLocalSearchParams: () => mocks.params,
    useFocusEffect: (effect: () => void | (() => void)) => {
      const focused = mocks.focused;
      useEffect(() => {
        if (focused) return effect();
      }, [effect, focused]);
    },
  };
});
vi.mock("@/components/ui", () => ({
  Screen: "Screen",
  PageHeader: "PageHeader",
  Button: "Button",
  Card: "Card",
  EmptyState: "EmptyState",
}));
vi.mock("@/components/cowboy-hat-icon", () => ({ CowboyHatIcon: "Hat" }));
vi.mock("lucide-react-native", () => ({ MessageCircle: "MessageCircle" }));
vi.mock("react-native", () => ({
  ActivityIndicator: "Spinner",
  Alert: { alert: mocks.alert },
  Text: "Text",
  TextInput: "TextInput",
  Pressable: "Pressable",
  View: "View",
}));
vi.mock("convex/react", () => ({
  useConvexConnectionState: () => ({ isWebSocketConnected: mocks.connected }),
  useMutation: (mutation: FunctionReference<"mutation">) => {
    const name = getFunctionName(mutation);
    if (name.endsWith(":shareWorkout")) return mocks.share;
    if (name.endsWith(":copyWorkout")) return mocks.copy;
    return mocks.mutate;
  },
  useQuery: (query: FunctionReference<"query">, args: unknown) => {
    if (args === "skip") return undefined;
    switch (getFunctionName(query).split(":").at(-1)) {
      case "syncedSession":
        return mocks.remoteId;
      case "sharedSession":
        return mocks.shared;
      case "post":
        return mocks.post;
      case "get":
        return mocks.remoteWorkout;
      case "me":
        return { id: "viewer" };
      default:
        return [];
    }
  },
}));

let renderer: ReactTestRenderer;
const post = {
  id: "post_1" as Id<"activityPosts">,
  userId: "viewer" as Id<"users">,
  name: "Athlete",
  handle: null,
  title: "Leg day",
  caption: "",
  completedAt: 100,
  durationSeconds: 60,
  exerciseCount: 1,
  likeCount: 2,
  commentCount: 0,
  liked: false,
  exercises: [{ name: "Squat", sets: 3 }],
};

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks();
  mocks.auth.isAuthenticated = true;
  mocks.auth.accountStatus = "ready";
  mocks.focused = true;
  mocks.params.fromShare = undefined;
  mocks.remoteId = "remote_1";
  mocks.shared = null;
  mocks.post = undefined;
  mocks.router.canGoBack.mockReturnValue(true);
  mocks.mutate.withOptimisticUpdate.mockReturnValue(mocks.mutate);
  mocks.share.mockResolvedValue("post_1");
  mocks.copy.mockResolvedValue("template_1");
  mocks.connected = true;
  mocks.localWorkout = {
    templateName: "Leg day",
    exercises: [
      {
        _id: "exercise_1",
        slug: "squat",
        sets: [{ completed: true }, { completed: false }],
      },
    ],
  };
  mocks.remoteWorkout = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  vi.restoreAllMocks();
});
async function render(element: React.ReactElement) {
  await act(async () => {
    renderer = create(element);
  });
}
function button(label: string) {
  return renderer.root.findByProps({ label });
}
function deferred() {
  let resolve!: (postId: string) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<string>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe("share interactions", () => {
  it("blocks repeated taps until commit, then clears the old stack and opens the post", async () => {
    const request = deferred();
    mocks.share.mockReturnValue(request.promise);
    await render(<ShareScreen />);
    const press = button("Post workout").props.onPress;
    let task!: Promise<void>;
    await act(async () => {
      task = press();
      void press();
    });
    expect(mocks.share).toHaveBeenCalledOnce();
    expect(mocks.share).toHaveBeenCalledWith({
      sessionId: "remote_1",
      caption: "",
    });
    expect(
      renderer.root.findByProps({ accessibilityLabel: "Publishing workout" }),
    ).toBeDefined();
    const pending = JSON.stringify(renderer.toJSON());
    expect(pending).toContain("Leg day");
    expect(pending).toContain("Squat");
    expect(pending).toContain("Sharing…");
    expect(button("Sharing…").props.disabled).toBe(true);
    expect(mocks.router.push).not.toHaveBeenCalled();
    // The canonical destination opens only after the live mutation settles.
    await act(async () => {
      request.resolve("post_1");
      await task;
    });
    expect(mocks.router.dismissTo).toHaveBeenCalledWith("/social");
    expect(mocks.router.push).toHaveBeenCalledWith(
      {
        pathname: "/social/post/[postId]",
        params: { postId: "post_1", fromShare: "1" },
      },
      { dangerouslySingular: true },
    );
    expect(mocks.router.dismissTo.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.router.push.mock.invocationCallOrder[0],
    );
  });

  it("does not pull someone back into the post after they leave mid-request", async () => {
    const request = deferred();
    mocks.share.mockReturnValue(request.promise);
    await render(<ShareScreen />);
    let task!: Promise<void>;
    await act(async () => {
      task = button("Post workout").props.onPress();
    });
    mocks.focused = false;
    await act(async () => renderer.update(<ShareScreen />));
    await act(async () => {
      request.resolve("post_1");
      await task;
    });
    expect(mocks.router.push).not.toHaveBeenCalled();
    expect(mocks.router.dismissTo).not.toHaveBeenCalled();
  });

  it("keeps the caption and permits retry when publishing fails", async () => {
    mocks.share.mockRejectedValueOnce(new Error("Workout unavailable"));
    await render(<ShareScreen />);
    await act(async () =>
      renderer.root
        .findByProps({ accessibilityLabel: "Workout caption" })
        .props.onChangeText("Great session"),
    );
    await act(async () => button("Post workout").props.onPress());
    expect(mocks.alert).toHaveBeenCalledWith(
      "Couldn't share",
      "Workout unavailable",
    );
    expect(
      renderer.root.findByProps({ accessibilityLabel: "Workout caption" }).props
        .value,
    ).toBe("Great session");
    expect(button("Post workout").props.disabled).toBe(false);
    expect(mocks.router.push).not.toHaveBeenCalled();
    await act(async () => button("Post workout").props.onPress());
    expect(mocks.share).toHaveBeenCalledTimes(2);
  });

  it("keeps the pending preview while disconnected, then completes the same live mutation", async () => {
    const request = deferred();
    mocks.share.mockReturnValue(request.promise);
    await render(<ShareScreen />);
    let task!: Promise<void>;
    await act(async () => {
      task = button("Post workout").props.onPress();
    });
    mocks.connected = false;
    await act(async () => renderer.update(<ShareScreen />));
    expect(JSON.stringify(renderer.toJSON())).toContain(
      "Waiting for connection…",
    );
    expect(JSON.stringify(renderer.toJSON())).toContain("Leg day");
    expect(mocks.alert).not.toHaveBeenCalled();
    expect(mocks.router.push).not.toHaveBeenCalled();
    // Auth recovery temporarily skips live queries; the captured preview must stay visible.
    mocks.auth.isAuthenticated = false;
    mocks.auth.accountStatus = "connecting";
    mocks.localWorkout = null;
    await act(async () => renderer.update(<ShareScreen />));
    expect(JSON.stringify(renderer.toJSON())).toContain("Leg day");
    expect(JSON.stringify(renderer.toJSON())).not.toContain("Sign in to share");
    mocks.auth.isAuthenticated = true;
    mocks.auth.accountStatus = "ready";
    mocks.connected = true;
    await act(async () => {
      request.resolve("post_1");
      await task;
    });
    expect(mocks.share).toHaveBeenCalledOnce();
    expect(mocks.router.push).toHaveBeenCalledOnce();
  });

  it("does not alert on another screen after a late failure, and preserves the error on return", async () => {
    const request = deferred();
    mocks.share.mockReturnValue(request.promise);
    await render(<ShareScreen />);
    let task!: Promise<void>;
    await act(async () => {
      task = button("Post workout").props.onPress();
    });
    mocks.focused = false;
    await act(async () => renderer.update(<ShareScreen />));
    await act(async () => {
      request.reject(new Error("Workout unavailable"));
      await task;
    });
    expect(mocks.alert).not.toHaveBeenCalled();
    mocks.focused = true;
    await act(async () => renderer.update(<ShareScreen />));
    expect(JSON.stringify(renderer.toJSON())).toContain("Workout unavailable");
    expect(button("Post workout").props.disabled).toBe(false);
  });

  it("uses a server preview for a workout logged on the web", async () => {
    mocks.localWorkout = null;
    mocks.remoteWorkout = { templateName: "Web workout", exercises: [] };
    const request = deferred();
    mocks.share.mockReturnValue(request.promise);
    await render(<ShareScreen />);
    let task!: Promise<void>;
    await act(async () => {
      task = button("Post workout").props.onPress();
    });
    expect(JSON.stringify(renderer.toJSON())).toContain("Web workout");
    await act(async () => {
      request.resolve("post_1");
      await task;
    });
  });
});

function confirmationButton(text: string) {
  const buttons = mocks.alert.mock.calls.at(-1)![2] as {
    text: string;
    onPress: () => void | Promise<void>;
  }[];
  return buttons.find((button) => button.text === text)!.onPress;
}

describe("copying a social workout to the template library", () => {
  it("requires confirmation, and cancellation adds nothing", async () => {
    await render(<SocialPost post={post} detail />);
    button("Copy as template").props.onPress();
    expect(mocks.alert).toHaveBeenCalledWith(
      "Add to your library?",
      "Add “Leg day” as a new workout template?",
      expect.any(Array),
      expect.any(Object),
    );
    expect(mocks.copy).not.toHaveBeenCalled();
    confirmationButton("Cancel")();
    expect(mocks.copy).not.toHaveBeenCalled();
    button("Copy as template").props.onPress();
    expect(mocks.alert).toHaveBeenCalledTimes(2);
  });

  it("shows progress immediately after confirmation and prevents duplicate imports", async () => {
    const request = deferred();
    mocks.copy.mockReturnValue(request.promise);
    await render(<SocialPost post={post} detail />);
    const press = button("Copy as template").props.onPress;
    press();
    press();
    expect(mocks.alert).toHaveBeenCalledOnce();
    expect(mocks.copy).not.toHaveBeenCalled();
    const confirm = confirmationButton("Add template");
    let task!: Promise<void>;
    await act(async () => {
      task = confirm() as Promise<void>;
      void confirm();
      void press();
    });
    expect(mocks.copy).toHaveBeenCalledOnce();
    expect(mocks.copy).toHaveBeenCalledWith({ postId: "post_1" });
    expect(button("Adding…").props.disabled).toBe(true);
    expect(
      renderer.root.findByProps({
        accessibilityLabel: "Adding template to library",
      }),
    ).toBeDefined();
    expect(mocks.alert).toHaveBeenCalledOnce();
    mocks.connected = false;
    await act(async () => renderer.update(<SocialPost post={post} detail />));
    expect(JSON.stringify(renderer.toJSON())).toContain(
      "Waiting for connection…",
    );
    await act(async () => {
      request.resolve("template_1");
      await task;
    });
    expect(mocks.alert).toHaveBeenLastCalledWith(
      "Added to library",
      "This workout is now in your template library.",
    );
    expect(button("Copy as template").props.disabled).toBe(false);
  });

  it("reports rejection, restores the button, and requires confirmation for retry", async () => {
    mocks.copy.mockRejectedValueOnce(
      new Error("At most 100 templates are allowed"),
    );
    await render(<SocialPost post={post} detail />);
    button("Copy as template").props.onPress();
    await act(async () => confirmationButton("Add template")());
    expect(mocks.alert).toHaveBeenLastCalledWith(
      "Couldn't add template",
      "At most 100 templates are allowed",
    );
    expect(JSON.stringify(renderer.toJSON())).toContain(
      "At most 100 templates are allowed",
    );
    button("Copy as template").props.onPress();
    expect(mocks.copy).toHaveBeenCalledOnce();
    await act(async () => confirmationButton("Add template")());
    expect(mocks.copy).toHaveBeenCalledTimes(2);
  });

  it.each(["success", "failure"])(
    "does not show a late %s alert on another screen",
    async (outcome) => {
      const request = deferred();
      mocks.copy.mockReturnValue(request.promise);
      await render(<SocialPost post={post} detail />);
      button("Copy as template").props.onPress();
      const confirm = confirmationButton("Add template");
      let task!: Promise<void>;
      await act(async () => {
        task = confirm() as Promise<void>;
      });
      mocks.alert.mockClear();
      mocks.focused = false;
      await act(async () => renderer.update(<SocialPost post={post} detail />));
      await act(async () => {
        if (outcome === "success") request.resolve("template_1");
        else request.reject(new Error("Workout unavailable"));
        await task;
      });
      expect(mocks.alert).not.toHaveBeenCalled();
    },
  );
});

describe("post navigation and reactions", () => {
  it("keeps Back usable during background/resume reconnection and with empty history", async () => {
    mocks.auth.isAuthenticated = false;
    mocks.auth.accountStatus = "connecting";
    mocks.router.canGoBack.mockReturnValue(false);
    await render(<PostScreen />);
    renderer.root.findByType("PageHeader" as never).props.onBack();
    expect(mocks.router.dismissTo).toHaveBeenCalledWith("/social");
    mocks.auth.isAuthenticated = true;
    mocks.auth.accountStatus = "ready";
    await act(async () => renderer.update(<PostScreen />));
    expect(renderer.root.findByType("PageHeader" as never).props.back).toBe(
      true,
    );
  });

  it("returns to Social in one tap after sharing", async () => {
    mocks.params.fromShare = "1";
    mocks.post = post;
    await render(<PostScreen />);
    renderer.root.findByType("PageHeader" as never).props.onBack();
    expect(mocks.router.dismissTo).toHaveBeenCalledWith("/social");
    expect(mocks.router.back).not.toHaveBeenCalled();
  });

  it("provides haptics for both Yee Haw and unlike, without opening another post", async () => {
    await render(<SocialPost post={post} detail />);
    await act(async () =>
      renderer.root
        .findByProps({ accessibilityLabel: "Give a yee haw" })
        .props.onPress(),
    );
    await act(async () =>
      renderer.update(
        <SocialPost post={{ ...post, liked: true, likeCount: 3 }} detail />,
      ),
    );
    const unlike = renderer.root.findByProps({
      accessibilityLabel: "Remove yee haw",
    });
    expect(unlike.props.accessibilityState.selected).toBe(true);
    await act(async () => unlike.props.onPress());
    expect(mocks.haptic).toHaveBeenCalledTimes(2);
    expect(mocks.mutate).toHaveBeenCalledTimes(2);
    expect(mocks.mutate).toHaveBeenLastCalledWith({ postId: "post_1" });
    renderer.root
      .findByProps({ accessibilityLabel: "View comments" })
      .props.onPress();
    expect(mocks.router.push).not.toHaveBeenCalled();
  });
});
