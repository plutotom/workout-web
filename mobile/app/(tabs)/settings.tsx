import { api } from "@backend/api";
import type { Id } from "@backend/dataModel";
import { useAction, useMutation, useQuery } from "convex/react";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import {
  ChevronDown,
  CircleDot,
  CloudCheck,
  Copy,
  Crown,
  Download,
  KeyRound,
  LogOut,
  Settings2,
  Share2,
  Shield,
  Sparkles,
  Trash2,
} from "lucide-react-native";
import { useRef, useState } from "react";
import { Alert, Modal, Pressable, Text, View } from "react-native";

import { useMobileAuth } from "@/auth/auth-provider";
import {
  Button,
  Card,
  Field,
  FullScreenLoader,
  Screen,
  SectionTitle,
  Segmented,
} from "@/components/ui";
import { PlateModal } from "@/components/workout/plate-modal";
import { DescribeWithAiButton } from "@/components/describe-with-ai-button";
import { NotificationSettingsCard } from "@/components/settings/notification-settings-card";
import { useBackupStatus, useLocalData } from "@/data/local/provider";
import { offlineAiSettingsCopy, planAiSettingsCopy } from "@/lib/ai-copy";
import { useAiGeneration, useAppleAiAvailability } from "@/lib/ai";
import { appleAiIsUsable } from "@shared/ai/apple-on-device";
import { requirePublicConfig } from "@/lib/config";
import { formatRelativeDay } from "@/lib/format";
import { pickBackupFile, shareBackupFile } from "@/lib/workout-transfer";
import { HealthSettingsCard } from "@/health/health-settings-card";
import { colors } from "@/theme";

const unitOptions = [
  { value: "lb", label: "lb" },
  { value: "kg", label: "kg" },
] as const;
const modeOptions = [
  { value: "list", label: "List", hint: "All sets" },
  { value: "focus", label: "Focus", hint: "One at a time" },
] as const;
const restOptions = [
  { value: "on", label: "On" },
  { value: "off", label: "Off" },
] as const;

export default function SettingsScreen() {
  const { isAuthenticated } = useMobileAuth();
  if (!isAuthenticated) return <OfflineSettingsScreen />;
  return <AuthenticatedSettingsScreen />;
}

function AuthenticatedSettingsScreen() {
  const user = useQuery(api.routes.auth.users.current);
  if (user === undefined) return <FullScreenLoader label="Loading settings…" />;
  if (!user) return <FullScreenLoader label="Loading account…" />;
  return <SettingsContent user={user} />;
}

function OfflineSettingsScreen() {
  const { signIn } = useMobileAuth();
  const { usesApple } = useAiGeneration();
  const [connecting, setConnecting] = useState(false);

  async function connectAccount() {
    setConnecting(true);
    try {
      await signIn();
    } catch {
      Alert.alert(
        "Couldn’t connect",
        "Your workouts are still safe on this phone. Try again when you’re online.",
      );
    } finally {
      setConnecting(false);
    }
  }

  return (
    <Screen>
      <Card>
        <Settings2 color={colors.text} size={22} />
        <Text style={{ color: colors.text, fontSize: 28, fontWeight: "700" }}>
          Offline mode
        </Text>
        <Text style={{ color: colors.dim, fontSize: 13, lineHeight: 19 }}>
          Workouts are saved on this phone. Connect your account whenever you
          want to synchronize them with Grayed Lift on the web.
        </Text>
        <Button
          label={connecting ? "Connecting…" : "Connect account"}
          disabled={connecting}
          onPress={() => void connectAccount()}
        />
      </Card>
      <HealthSettingsCard />
      <NotificationSettingsCard />
      <BackupCard signedIn={false} />
      <Card>
        <Sparkles color={colors.text} size={22} />
        <SectionTitle title="AI workouts" />
        <Text style={{ color: colors.dim, fontSize: 13, lineHeight: 19 }}>
          {offlineAiSettingsCopy(usesApple)}
        </Text>
        {usesApple ? <DescribeWithAiButton variant="outline" /> : null}
      </Card>
      <Card>
        <CircleDot color={colors.text} size={22} strokeWidth={2.3} />
        <SectionTitle title="Training tools" />
        <Text style={{ color: colors.dim, fontSize: 13, lineHeight: 19 }}>
          The workout tracker and plate calculator remain available without an
          account.
        </Text>
      </Card>
    </Screen>
  );
}

function SettingsContent({
  user,
}: {
  user: NonNullable<
    ReturnType<typeof useQuery<typeof api.routes.auth.users.current>>
  >;
}) {
  const [unit, setUnitValue] = useState<"lb" | "kg">(user.unit);
  const [bar, setBarValue] = useState(
    String(
      user.unit === "lb" ? (user.barWeightLb ?? 45) : (user.barWeightKg ?? 20),
    ),
  );
  const [mode, setMode] = useState<"list" | "focus">(
    user.activeWorkoutMode ?? "list",
  );
  const [rest, setRest] = useState<"on" | "off">(
    (user.restTimerEnabled ?? true) ? "on" : "off",
  );
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [plateCalculatorOpen, setPlateCalculatorOpen] = useState(false);
  const saveSequence = useRef(0);
  const barSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setUnit = useMutation(api.routes.auth.users.setUnit);
  const setBar = useMutation(api.routes.auth.users.setBar);
  const setActiveWorkoutMode = useMutation(
    api.routes.auth.users.setActiveWorkoutMode,
  );
  const setRestTimerEnabled = useMutation(
    api.routes.auth.users.setRestTimerEnabled,
  );
  const { signOut } = useMobileAuth();

  async function persist(change: () => Promise<unknown>) {
    const sequence = ++saveSequence.current;
    setSaveState("saving");
    try {
      await change();
      if (sequence === saveSequence.current) setSaveState("saved");
    } catch {
      if (sequence === saveSequence.current) setSaveState("error");
    }
  }

  function clearQueuedBarSave() {
    if (barSaveTimer.current) {
      clearTimeout(barSaveTimer.current);
      barSaveTimer.current = null;
    }
  }

  function saveBarValue(value: string) {
    clearQueuedBarSave();
    void persist(() =>
      setBar({ unit, barWeight: value === "" ? 0 : Number(value) }),
    );
  }

  function queueBarSave(value: string) {
    clearQueuedBarSave();
    if (value === "") return;
    barSaveTimer.current = setTimeout(() => {
      barSaveTimer.current = null;
      void persist(() => setBar({ unit, barWeight: Number(value) }));
    }, 450);
  }

  return (
    <>
      <Screen>
        <Card>
          <Settings2 color={colors.text} size={22} />
          <Text
            style={{
              color: colors.dim,
              fontSize: 11,
              fontWeight: "700",
              letterSpacing: 2,
            }}
          >
            SETTINGS
          </Text>
          <Text style={{ color: colors.text, fontSize: 30, fontWeight: "700" }}>
            App controls
          </Text>
          <Text style={{ color: colors.dim, fontSize: 13 }}>
            Units, bar defaults, plan, and external access.
          </Text>
        </Card>
        <Card>
          <SectionTitle title="General" />
          <Field label="Email" value={user.email} editable={false} />
          <View style={{ gap: 7 }}>
            <Text
              style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}
            >
              Default unit
            </Text>
            <Segmented
              value={unit}
              options={unitOptions}
              onChange={(next) => {
                clearQueuedBarSave();
                setUnitValue(next);
                setBarValue(
                  String(
                    next === "lb"
                      ? (user.barWeightLb ?? 45)
                      : (user.barWeightKg ?? 20),
                  ),
                );
                void persist(() => setUnit({ unit: next }));
              }}
            />
            <Text style={{ color: colors.dim, fontSize: 11 }}>
              New weights are entered in this unit.
            </Text>
          </View>
          <View style={{ gap: 7 }}>
            <Text
              style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}
            >
              Active workout view
            </Text>
            <Segmented
              value={mode}
              options={modeOptions}
              onChange={(next) => {
                setMode(next);
                void persist(() => setActiveWorkoutMode({ mode: next }));
              }}
            />
            <Text style={{ color: colors.dim, fontSize: 11 }}>
              Switching during a workout is safe; both views share the same
              session.
            </Text>
          </View>
          <View style={{ gap: 7 }}>
            <Text
              style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}
            >
              Rest timer
            </Text>
            <Segmented
              value={rest}
              options={restOptions}
              onChange={(next) => {
                setRest(next);
                void persist(() =>
                  setRestTimerEnabled({ enabled: next === "on" }),
                );
              }}
            />
          </View>
          <Field
            label={`Default bar (${unit})`}
            value={bar}
            onChangeText={(value) => {
              const next = value.replace(/\D/g, "");
              setBarValue(next);
              queueBarSave(next);
            }}
            onBlur={() => {
              if (barSaveTimer.current || bar === "") saveBarValue(bar);
            }}
            keyboardType="number-pad"
          />
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(unit === "lb" ? [35, 45] : [15, 20]).map((preset) => (
              <Button
                key={preset}
                label={`${preset} ${unit}`}
                variant={Number(bar) === preset ? "primary" : "outline"}
                size="sm"
                onPress={() => {
                  const next = String(preset);
                  setBarValue(next);
                  saveBarValue(next);
                }}
              />
            ))}
          </View>
          <Text
            accessibilityLiveRegion="polite"
            style={{
              color: saveState === "error" ? colors.danger : colors.dim,
              fontSize: 11,
            }}
          >
            {saveState === "saving"
              ? "Saving changes…"
              : saveState === "error"
                ? "Couldn’t save. Check your connection and try again."
                : saveState === "saved"
                  ? "Changes saved automatically."
                  : "Changes save automatically."}
          </Text>
        </Card>
        <Card>
          <CircleDot color={colors.text} size={22} strokeWidth={2.3} />
          <SectionTitle title="Training tools" />
          <Text style={{ color: colors.dim, fontSize: 13, lineHeight: 19 }}>
            Load a target weight or build a bar plate by plate.
          </Text>
          <Button
            label="Open plate calculator"
            variant="outline"
            icon={CircleDot}
            onPress={() => setPlateCalculatorOpen(true)}
          />
        </Card>
        <Card>
          <Share2 color={colors.text} size={22} strokeWidth={2.3} />
          <SectionTitle title="Share with someone" />
          <Text style={{ color: colors.dim, fontSize: 13, lineHeight: 19 }}>
            Send your templates to a friend, or bring in someone else&apos;s.
            This moves templates only — for your logged workouts, use Backup.
          </Text>
          <Button
            label="Export templates"
            variant="outline"
            icon={Share2}
            onPress={() => router.push("/share-workouts")}
          />
          <Button
            label="Import templates"
            variant="outline"
            icon={Download}
            onPress={() => router.push("/import-workouts")}
          />
        </Card>
        <HealthSettingsCard />
        <NotificationSettingsCard />
        <BackupCard signedIn />
        <PlanCard />
        <AdminCard />
        <McpCard />
        <Button
          label="Sign out"
          variant="outline"
          icon={LogOut}
          onPress={() =>
            Alert.alert("Sign out?", undefined, [
              { text: "Cancel", style: "cancel" },
              {
                text: "Sign out",
                style: "destructive",
                onPress: () =>
                  void signOut().then(() => router.replace("/sign-in")),
              },
            ])
          }
        />
      </Screen>
      <PlateModal
        visible={plateCalculatorOpen}
        target={unit === "lb" ? 135 : 100}
        unit={unit}
        barWeight={Number(bar) || (unit === "lb" ? 45 : 20)}
        onClose={() => setPlateCalculatorOpen(false)}
      />
    </>
  );
}

/**
 * A backup nobody repeats isn't a backup, so the card leads with *state* —
 * "last backup 3 weeks ago" — rather than with prose. That line is the whole
 * feature: it's glanceable, it nags without nagging, and it's the only thing
 * standing between someone and a nine-month-old file.
 *
 * The iOS device-backup explanation is true but unactionable from here, so it
 * sits behind a disclosure instead of above the button. And the attention state
 * is expressed in brightness, not colour: this palette keeps green and red for
 * success and danger, and a stale backup is neither.
 */
function BackupCard({ signedIn }: { signedIn: boolean }) {
  const { createBackup, restoreBackup, importBundle, noteBackupSaved } =
    useLocalData();
  // `undefined` while loading — render nothing rather than flash "no backup".
  const backup = useBackupStatus();
  const [busy, setBusy] = useState<"save" | "restore" | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const saveBackup = async () => {
    setBusy("save");
    try {
      const snapshot = await createBackup();
      if (
        snapshot.sessions.length === 0 &&
        snapshot.templates.length === 0 &&
        snapshot.customExercises.length === 0 &&
        snapshot.exerciseNotes.length === 0
      ) {
        Alert.alert(
          "Nothing to back up yet",
          "Log a workout or save a template first.",
        );
        return;
      }
      const result = await shareBackupFile(snapshot);
      if (!result.shared) {
        if (result.reason) Alert.alert("Couldn't save backup", result.reason);
        return;
      }
      await noteBackupSaved();
    } catch (caught) {
      Alert.alert(
        "Couldn't save backup",
        caught instanceof Error ? caught.message : "Please try again.",
      );
    } finally {
      setBusy(null);
    }
  };

  const restoreFromFile = async () => {
    setBusy("restore");
    try {
      const parsed = await pickBackupFile();
      if (!parsed) return;
      if (!parsed.ok) {
        Alert.alert("Couldn't read that backup", parsed.error);
        return;
      }

      if (parsed.kind === "bundle") {
        const confirmed = await new Promise<boolean>((resolve) => {
          Alert.alert(
            "Import templates from this file?",
            `${parsed.bundle.templates.length} template${
              parsed.bundle.templates.length === 1 ? "" : "s"
            }. This is a template export, not a full backup — workout history isn't in the file. Nothing you already have is replaced.`,
            [
              {
                text: "Cancel",
                style: "cancel",
                onPress: () => resolve(false),
              },
              { text: "Import", onPress: () => resolve(true) },
            ],
          );
        });
        if (!confirmed) return;
        const result = await importBundle(parsed.bundle);
        Alert.alert(
          "Imported",
          result.templatesImported === 1
            ? `Added "${result.names[0]}" to your templates.`
            : `Added ${result.templatesImported} templates.`,
        );
        return;
      }

      const { snapshot } = parsed;
      const saved = new Date(snapshot.createdAt).toLocaleDateString();
      const confirmed = await new Promise<boolean>((resolve) => {
        Alert.alert(
          `Restore backup from ${saved}?`,
          `${snapshot.sessions.length} workouts, ${snapshot.templates.length} templates, ${snapshot.customExercises.length} custom exercises, and ${snapshot.exerciseNotes.length} notes. Anything already on this phone is kept as-is — nothing gets overwritten.`,
          [
            { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
            { text: "Restore", onPress: () => resolve(true) },
          ],
        );
      });
      if (!confirmed) return;

      const result = await restoreBackup(snapshot);
      const added = [
        result.sessionsAdded === 1
          ? "1 workout"
          : `${result.sessionsAdded} workouts`,
        result.templatesAdded === 1
          ? "1 template"
          : `${result.templatesAdded} templates`,
        result.customExercisesAdded === 1
          ? "1 custom exercise"
          : `${result.customExercisesAdded} custom exercises`,
        result.notesAdded === 1 ? "1 note" : `${result.notesAdded} notes`,
      ].join(", ");
      Alert.alert(
        "Restored",
        result.skipped > 0
          ? `Added ${added}. ${result.skipped} were already on this phone and were left alone.`
          : `Added ${added}.`,
      );
    } catch (caught) {
      Alert.alert(
        "Couldn't restore",
        caught instanceof Error ? caught.message : "Please try again.",
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CloudCheck color={colors.text} size={22} strokeWidth={2.3} />
      <SectionTitle title="Backup" />

      {signedIn ? (
        <Text style={{ color: colors.dim, fontSize: 13, lineHeight: 19 }}>
          New workouts sync to your account. A backup is how you restore this
          phone&apos;s full history on another iPhone or bring your web history
          into the app.
        </Text>
      ) : (
        <>
          {backup ? (
            <Text
              style={{
                color: backup.stale ? colors.text : colors.dim,
                fontSize: backup.stale ? 15 : 13,
                fontWeight: backup.stale ? "600" : "400",
                lineHeight: backup.stale ? 21 : 19,
              }}
            >
              {backup.at === null
                ? "You haven’t saved a backup yet."
                : `Last backup ${formatRelativeDay(backup.at, backup.checkedAt)}.`}
            </Text>
          ) : null}
          <Text style={{ color: colors.dim, fontSize: 13, lineHeight: 19 }}>
            Your workouts live on this phone. Save a backup file — choose iCloud
            Drive from the share sheet — and it survives deleting the app or
            moving to a new phone.
          </Text>
        </>
      )}

      <Button
        variant="outline"
        icon={Download}
        label={busy === "save" ? "Preparing…" : "Save a backup"}
        disabled={busy !== null}
        onPress={() => void saveBackup()}
      />
      <Text style={{ color: colors.faint, fontSize: 12, lineHeight: 17 }}>
        The file isn&apos;t encrypted — anyone who opens it can read your
        training log.
      </Text>

      {/* Rare and high-stakes, so it stays quiet next to the routine action. */}
      <Button
        variant="ghost"
        size="sm"
        label={busy === "restore" ? "Restoring…" : "Restore from a file"}
        disabled={busy !== null}
        onPress={() => void restoreFromFile()}
      />
      <Text style={{ color: colors.faint, fontSize: 12, lineHeight: 17 }}>
        Moving from the web app? Download an account backup there, then restore
        that file here.
      </Text>

      <Pressable
        accessibilityRole="button"
        onPress={() => setDetailsOpen((open) => !open)}
        style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
      >
        <Text style={{ color: colors.faint, fontSize: 12 }}>
          What about iCloud?
        </Text>
        <ChevronDown
          size={14}
          color={colors.faint}
          style={
            detailsOpen ? { transform: [{ rotate: "180deg" }] } : undefined
          }
        />
      </Pressable>
      {detailsOpen ? (
        <Text style={{ color: colors.faint, fontSize: 12, lineHeight: 18 }}>
          This phone&apos;s copy is already inside your iPhone&apos;s iCloud
          backup (Settings › your name › iCloud › iCloud Backup). That comes
          back when you set up a new iPhone from that backup — but not when you
          reinstall the app, which is why a file is worth keeping.
        </Text>
      ) : null}
    </Card>
  );
}

function PlanCard() {
  const entitlement = useQuery(api.routes.auth.users.entitlement);
  const products = useQuery(api.routes.billing.polar.getConfiguredProducts);
  const setPlan = useMutation(api.routes.auth.users.setPlanForTesting);
  const checkout = useAction(api.routes.billing.polar.generateCheckoutLink);
  const portal = useAction(api.routes.billing.polar.generateCustomerPortalUrl);
  const apple = useAppleAiAvailability();
  const [busy, setBusy] = useState(false);
  const isPro = entitlement?.isPro === true;
  const appleReady = appleAiIsUsable(apple);
  const productIds = [products?.proMonthly?.id, products?.proYearly?.id].filter(
    (id): id is string => Boolean(id),
  );

  async function openBilling(kind: "checkout" | "portal") {
    setBusy(true);
    try {
      const { webUrl } = requirePublicConfig();
      const result =
        kind === "checkout"
          ? await checkout({
              productIds,
              origin: webUrl,
              successUrl: `${webUrl}/settings`,
            })
          : await portal({ returnUrl: `${webUrl}/settings` });
      await WebBrowser.openBrowserAsync(result.url, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      });
    } catch {
      Alert.alert(
        "Billing unavailable",
        "The local Polar sandbox is not configured or reachable.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <Crown color={colors.text} size={22} />
      <SectionTitle title="Plan" />
      <Text style={{ color: colors.dim, fontSize: 13 }}>
        {planAiSettingsCopy(appleReady)}
      </Text>
      {appleReady && !isPro ? <DescribeWithAiButton variant="outline" /> : null}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          borderWidth: 1,
          borderColor: colors.line,
          padding: 12,
          borderRadius: 10,
        }}
      >
        <View>
          <Text style={{ color: colors.text, fontWeight: "600" }}>Current</Text>
          <Text style={{ color: colors.dim, fontSize: 12, marginTop: 3 }}>
            {isPro
              ? entitlement?.subscription?.productName
                ? `Pro · ${entitlement.subscription.productName}`
                : "Pro"
              : "Free"}
          </Text>
        </View>
        <Text
          style={{
            color: isPro ? colors.success : colors.dim,
            fontWeight: "700",
          }}
        >
          {entitlement === undefined ? "…" : isPro ? "PRO" : "FREE"}
        </Text>
      </View>
      {entitlement?.billingConfigured && productIds.length ? (
        <Button
          label={
            isPro && entitlement.subscription
              ? "Manage subscription"
              : "Upgrade to Pro"
          }
          disabled={busy}
          onPress={() =>
            openBilling(
              isPro && entitlement.subscription ? "portal" : "checkout",
            )
          }
        />
      ) : (
        <Text style={{ color: colors.dim, fontSize: 11 }}>
          Polar billing isn’t configured on this local Convex deployment.
        </Text>
      )}
      {entitlement?.allowManualPro ? (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button
            style={{ flex: 1 }}
            label="Enable Pro"
            disabled={busy || isPro}
            onPress={async () => {
              setBusy(true);
              try {
                await setPlan({ plan: "pro" });
              } finally {
                setBusy(false);
              }
            }}
          />
          <Button
            style={{ flex: 1 }}
            label="Use Free"
            variant="outline"
            disabled={busy || !isPro}
            onPress={async () => {
              setBusy(true);
              try {
                await setPlan({ plan: "free" });
              } finally {
                setBusy(false);
              }
            }}
          />
        </View>
      ) : null}
    </Card>
  );
}

function AdminCard() {
  const entitlement = useQuery(api.routes.auth.users.entitlement);
  if (entitlement === undefined || !entitlement?.isAdmin) return null;

  return (
    <Card>
      <Shield color={colors.text} size={22} />
      <SectionTitle title="Admin" />
      <Text style={{ color: colors.dim, fontSize: 13 }}>
        Grant or revoke Pro for users without a Polar subscription.
      </Text>
      <Button
        label="Manage Pro access"
        variant="outline"
        icon={Shield}
        onPress={() => router.push("/settings/admin")}
      />
    </Card>
  );
}

function McpCard() {
  const keys = useQuery(api.routes.mcp.keys.list);
  const create = useMutation(api.routes.mcp.keys.create);
  const revoke = useMutation(api.routes.mcp.keys.revoke);
  const [name, setName] = useState("");
  const [rawKey, setRawKey] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const mcpUrl = `${requirePublicConfig().webUrl}/api/mcp`;

  async function createKey() {
    setCreating(true);
    try {
      const result = await create({ name: name.trim() || "API key" });
      setRawKey(result.rawKey);
      setName("");
    } catch {
      Alert.alert("Couldn’t create API key");
    } finally {
      setCreating(false);
    }
  }

  async function copy(value: string, label: string) {
    await Clipboard.setStringAsync(value);
    Alert.alert(`${label} copied`);
  }

  return (
    <>
      <Card>
        <KeyRound color={colors.text} size={22} />
        <SectionTitle title="MCP access" />
        <Text style={{ color: colors.dim, fontSize: 13 }}>
          Connect Cursor or another MCP client. Secret keys are shown once.
        </Text>
        <Field
          label="New key name"
          value={name}
          onChangeText={setName}
          placeholder="Cursor laptop"
        />
        <Button
          label={creating ? "Creating…" : "Create key"}
          disabled={creating || keys === undefined}
          onPress={createKey}
        />
        <View style={{ height: 1, backgroundColor: colors.line }} />
        <SectionTitle title="Active keys" />
        {keys === undefined ? (
          <Text style={{ color: colors.dim }}>Loading…</Text>
        ) : keys.length === 0 ? (
          <Text style={{ color: colors.dim }}>No API keys yet.</Text>
        ) : (
          keys.map((key) => (
            <View
              key={key._id}
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: "600" }}>
                  {key.name}
                </Text>
                <Text style={{ color: colors.dim, fontSize: 11, marginTop: 3 }}>
                  {key.keyPrefix}… · created{" "}
                  {new Date(key.createdAt).toLocaleDateString()} · used{" "}
                  {key.lastUsedAt
                    ? new Date(key.lastUsedAt).toLocaleDateString()
                    : "never"}
                </Text>
              </View>
              <Pressable
                hitSlop={8}
                onPress={() =>
                  Alert.alert(
                    `Revoke ${key.name}?`,
                    "Existing clients will immediately lose access.",
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Revoke",
                        style: "destructive",
                        onPress: () =>
                          void revoke({ keyId: key._id as Id<"mcpApiKeys"> }),
                      },
                    ],
                  )
                }
              >
                <Trash2 color={colors.danger} size={19} />
              </Pressable>
            </View>
          ))
        )}
        <Field label="MCP endpoint URL" value={mcpUrl} editable={false} />
        <Button
          label="Copy MCP URL"
          variant="outline"
          icon={Copy}
          onPress={() => copy(mcpUrl, "MCP URL")}
        />
      </Card>
      <Modal
        transparent
        visible={rawKey !== null}
        animationType="fade"
        onRequestClose={() => setRawKey(null)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.72)",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <Card>
            <Text
              style={{ color: colors.text, fontSize: 21, fontWeight: "700" }}
            >
              Save your API key
            </Text>
            <Text style={{ color: colors.dim, lineHeight: 19 }}>
              This is the only time the secret will be shown.
            </Text>
            <Field
              label="API key"
              value={rawKey ?? ""}
              editable={false}
              multiline
            />
            <Button
              label="Copy API key"
              icon={Copy}
              onPress={() => copy(rawKey ?? "", "API key")}
            />
            <Button
              label="Done"
              variant="outline"
              onPress={() => setRawKey(null)}
            />
          </Card>
        </View>
      </Modal>
    </>
  );
}
