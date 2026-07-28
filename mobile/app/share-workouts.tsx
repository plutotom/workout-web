import { api } from "@backend/api";
import type { Id } from "@backend/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useLocalSearchParams } from "expo-router";
import { Check, Copy, FileJson, Link2, Share2 } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Alert, Text, View } from "react-native";

import {
  Button,
  Card,
  Field,
  FullScreenLoader,
  PageHeader,
  Screen,
  SectionTitle,
} from "@/components/ui";
import { requirePublicConfig } from "@/lib/config";
import {
  copyBundleCode,
  copyText,
  shareBundleFile,
} from "@/lib/workout-transfer";
import { useCatalog } from "@/providers/catalog-provider";
import { colors } from "@/theme";
import {
  describeBundle,
  shareUrl,
  toBundle,
  type WorkoutExportBundle,
} from "@shared/workout-export";

/**
 * Export screen. Offers the same three transports as the web app: a share
 * link, a `.json` file through the iOS share sheet, and a self-contained code.
 *
 * `templateId` narrows the export to one template; omitting it exports all.
 */
export default function ShareWorkoutsScreen() {
  const { templateId } = useLocalSearchParams<{ templateId?: string }>();
  const catalog = useCatalog();
  const createShare = useMutation(api.routes.shares.mutations.create);

  const [link, setLink] = useState<string | null>(null);
  const [creatingLink, setCreatingLink] = useState(false);
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  // Shown on the recipient's preview page. Optional and free-text — the
  // sender's email is never put on a public page.
  const [sharedBy, setSharedBy] = useState("");

  const data = useQuery(api.routes.templates.queries.exportData, {
    templateIds: templateId
      ? [templateId as Id<"workoutTemplates">]
      : undefined,
  });

  // Derived, not stored: the bundle is a pure function of the query result and
  // the catalog, so there is nothing to synchronize in an effect.
  const bundle: WorkoutExportBundle | null = useMemo(
    () => (data && data.templates.length > 0 ? toBundle(data, catalog) : null),
    [data, catalog],
  );

  function flashCopied(which: "link" | "code") {
    setCopied(which);
    setTimeout(() => setCopied(null), 2000);
  }

  async function handleCreateLink() {
    if (!bundle) return;
    setCreatingLink(true);
    try {
      const { token } = await createShare({
        bundle,
        sharedBy: sharedBy.trim() || undefined,
      });
      const url = shareUrl(requirePublicConfig().webUrl, token);
      setLink(url);
      await copyText(url);
      flashCopied("link");
    } catch (error) {
      Alert.alert(
        "Couldn't create a link",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setCreatingLink(false);
    }
  }

  async function handleShareFile() {
    if (!bundle) return;
    const result = await shareBundleFile(bundle);
    if (!result.shared && result.reason) {
      Alert.alert("Couldn't share", result.reason);
    }
  }

  async function handleCopyCode() {
    if (!bundle) return;
    await copyBundleCode(bundle);
    flashCopied("code");
  }

  if (data === undefined) return <FullScreenLoader label="Preparing export…" />;

  if (!bundle) {
    return (
      <Screen>
        <PageHeader back title="Share workouts" />
        <Text style={{ color: colors.dim }}>
          There&apos;s nothing to share yet — create a template first.
        </Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <PageHeader
        back
        title="Share workouts"
        subtitle={`${describeBundle(bundle)} · ${bundle.unit}`}
      />

      <Card>
        {bundle.templates.map((template, index) => (
          <View
            key={`${template.name}-${index}`}
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <Text
              numberOfLines={1}
              style={{ color: colors.text, fontSize: 14, flex: 1 }}
            >
              {template.name}
            </Text>
            <Text style={{ color: colors.dim, fontSize: 12 }}>
              {template.exercises.length} exercises
            </Text>
          </View>
        ))}
      </Card>

      <SectionTitle title="Send a link" />
      <Text style={{ color: colors.dim, fontSize: 12 }}>
        Anyone with the link can import these templates. It expires in 30 days
        and can be revoked from the web app.
      </Text>
      {link ? (
        <Card>
          <Text
            selectable
            style={{ color: colors.dim, fontSize: 12 }}
            numberOfLines={2}
          >
            {link}
          </Text>
          <Button
            label={copied === "link" ? "Copied" : "Copy link"}
            variant="outline"
            icon={copied === "link" ? Check : Copy}
            onPress={async () => {
              await copyText(link);
              flashCopied("link");
            }}
          />
        </Card>
      ) : (
        <>
          <Field
            value={sharedBy}
            onChangeText={setSharedBy}
            placeholder="Your name (optional)"
            maxLength={60}
          />
          <Button
            label={creatingLink ? "Creating…" : "Create share link"}
            icon={Link2}
            disabled={creatingLink}
            onPress={handleCreateLink}
          />
        </>
      )}

      <SectionTitle title="Or send a file / code" />
      <Text style={{ color: colors.dim, fontSize: 12 }}>
        Never expires, and imports without a connection.
      </Text>
      <Button
        label="Share .json file"
        variant="outline"
        icon={Share2}
        onPress={handleShareFile}
      />
      <Button
        label={copied === "code" ? "Code copied" : "Copy share code"}
        variant="outline"
        icon={copied === "code" ? Check : FileJson}
        onPress={handleCopyCode}
      />
    </Screen>
  );
}
