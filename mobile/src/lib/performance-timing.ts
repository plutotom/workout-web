export type TimingOutcome = "success" | "failure" | "cancelled";
export type MobileTimingName =
  | "auth.storage"
  | "auth.token"
  | "auth.exchange"
  | "auth.convex"
  | "auth.user"
  | "auth.bootstrap"
  | "auth.account"
  | "social.feed"
  | "social.me"
  | "social.notifications"
  | "social.profile"
  | "social.posts"
  | "social.post"
  | "social.comments"
  | "social.share.confirmation"
  | "social.share.ui_commit"
  | "social.copy.ui_commit"
  | "social.copy.confirmation"
  | "social.like.confirmation"
  | "social.like.ui_commit"
  | "social.follow.confirmation"
  | "social.follow.ui_commit"
  | "social.comment.confirmation"
  | "social.comment.ui_commit";

let sequence = 0;
const noop = () => {};

function now() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/** Local development diagnostics only. Never include user data or request args. */
export function startMobileTiming(
  name: MobileTimingName,
  alreadyAvailable = false,
): (outcome?: TimingOutcome) => void {
  if (typeof __DEV__ === "undefined" || !__DEV__) return noop;
  const id = ++sequence;
  const startedAt = now();
  let finished = false;
  console.debug("[mobile-timing]", {
    id,
    name,
    event: "start",
    alreadyAvailable,
  });
  return (outcome = "success") => {
    if (finished) return;
    finished = true;
    console.debug("[mobile-timing]", {
      id,
      name,
      event: "finish",
      outcome,
      durationMs: Math.max(0, Math.round(now() - startedAt)),
    });
  };
}

/** Preserve the exact result/error of the operation being measured. */
export async function measureMobileAsync<T>(
  name: MobileTimingName,
  operation: () => Promise<T>,
): Promise<T> {
  const finish = startMobileTiming(name);
  try {
    const value = await operation();
    finish();
    return value;
  } catch (error) {
    finish("failure");
    throw error;
  }
}
