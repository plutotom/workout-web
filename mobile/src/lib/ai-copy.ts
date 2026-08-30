export function signedOutWelcomeAiCopy(): string {
  return "On supported iPhones, Apple Intelligence can draft workouts without an account.";
}

export function offlineAiSettingsCopy(appleReady: boolean): string {
  if (appleReady) {
    return "Runs on this iPhone with Apple Intelligence — no account, works offline. Connect later if you want Grayed Lift’s cloud model.";
  }
  return "Turn on Apple Intelligence in iPhone Settings to generate workouts without an account. A Pro plan uses Grayed Lift’s cloud model.";
}

export function planAiSettingsCopy(appleReady: boolean): string {
  if (appleReady) {
    return "Apple Intelligence on this iPhone works on Free. Pro uses Grayed Lift’s cloud model when you’re online.";
  }
  return "Pro unlocks cloud AI workout and template generation. On supported iPhones, Apple Intelligence works on Free.";
}

/**
 * Generate-sheet body when the request will run on Apple Intelligence.
 * Typical prompts stay on-device; overflow may use Private Cloud Compute.
 */
export function appleGenerateSheetCopy(kind: "template" | "session"): string {
  const privacy =
    "Runs on this iPhone. A request that’s too large may use Apple Private Cloud Compute — not Grayed Lift’s servers.";
  if (kind === "template") {
    return `${privacy} Draft only until you save.`;
  }
  return `${privacy} You’ll review the draft before it changes the session.`;
}
