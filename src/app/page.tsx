import { redirect } from "next/navigation";

// The root has no UI of its own. Unauthenticated visitors are redirected to
// sign-in by the proxy; authenticated visitors land on the dashboard.
export default function Home() {
  redirect("/dashboard");
}
