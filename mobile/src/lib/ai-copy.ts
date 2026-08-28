export function offlineAiSettingsCopy(appleReady: boolean): string {
  if (appleReady) {
    return "Runs on this iPhone with Apple Intelligence — no account, works offline. Connect later if you want Workout’s cloud model.";
  }
  return "Turn on Apple Intelligence in iPhone Settings to generate workouts without an account. A Pro plan uses Workout’s cloud model.";
}

export function planAiSettingsCopy(appleReady: boolean): string {
  if (appleReady) {
    return "Apple Intelligence on this iPhone works on Free. Pro uses Workout’s cloud model when you’re online.";
  }
  return "Pro unlocks cloud AI workout and template generation. On supported iPhones, Apple Intelligence works on Free.";
}
