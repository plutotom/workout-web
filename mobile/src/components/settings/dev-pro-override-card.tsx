import {
  devProOverrideAllowed,
  readDevProOverride,
  subscribeDevProOverride,
  writeDevProOverride,
  type DevProOverride,
} from "@shared/dev-pro-override";
import { useSyncExternalStore } from "react";
import { Text } from "react-native";

import { Card, SectionTitle, Segmented } from "@/components/ui";
import { colors } from "@/theme";

const OPTIONS = [
  { value: "server" as const, label: "Server" },
  { value: "free" as const, label: "Free" },
  { value: "pro" as const, label: "Pro" },
];

export function DevProOverrideCard() {
  const override = useSyncExternalStore(
    subscribeDevProOverride,
    readDevProOverride,
    readDevProOverride,
  );

  if (!devProOverrideAllowed()) return null;

  return (
    <Card>
      <SectionTitle title="Dev · Pro override" />
      <Text style={{ color: colors.dim, fontSize: 13, lineHeight: 19 }}>
        Force Free or Pro for local gates without Polar or admin toggles. Pro AI
        API calls still need a signed-in session.
      </Text>
      <Segmented
        value={override}
        options={OPTIONS}
        onChange={(value) => writeDevProOverride(value as DevProOverride)}
      />
    </Card>
  );
}
