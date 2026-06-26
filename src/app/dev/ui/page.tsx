import { notFound } from "next/navigation";

import { DevUiPreview } from "./dev-ui-preview";

// Dev-only design-system preview. Hidden in production builds.
export default function DevUiPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DevUiPreview />;
}
