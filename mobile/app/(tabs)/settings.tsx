import { api } from "@backend/api";
import type { Id } from "@backend/dataModel";
import { useAction, useMutation, useQuery } from "convex/react";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import {
  CircleDot,
  Copy,
  Crown,
  KeyRound,
  LogOut,
  Settings2,
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
import { requirePublicConfig } from "@/lib/config";
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
  const [connecting, setConnecting] = useState(false);
  return (
    <Screen>
      <Card>
        <Settings2 color={colors.text} size={22} />
        <Text style={{ color: colors.text, fontSize: 28, fontWeight: "700" }}>
          Offline mode
        </Text>
        <Text style={{ color: colors.dim, fontSize: 13, lineHeight: 19 }}>
          Workouts are saved on this phone. Connect your account whenever you
          want to synchronize them with Workout on the web.
        </Text>
        <Button
          label={connecting ? "Connecting…" : "Connect account"}
          disabled={connecting}
          onPress={async () => {
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
          }}
        />
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
        <PlanCard />
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
                  void signOut().then(() => router.replace("/(auth)/sign-in")),
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

function PlanCard() {
  const entitlement = useQuery(api.routes.auth.users.entitlement);
  const products = useQuery(api.routes.billing.polar.getConfiguredProducts);
  const setPlan = useMutation(api.routes.auth.users.setPlanForTesting);
  const checkout = useAction(api.routes.billing.polar.generateCheckoutLink);
  const portal = useAction(api.routes.billing.polar.generateCustomerPortalUrl);
  const [busy, setBusy] = useState(false);
  const isPro = entitlement?.isPro === true;
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
        Pro unlocks AI workout and template generation.
      </Text>
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
