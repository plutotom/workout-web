import { Redirect } from "expo-router";

/** Default tab when landing on /(tabs) without a child segment. */
export default function TabsIndex() {
  return <Redirect href="/dashboard" />;
}
