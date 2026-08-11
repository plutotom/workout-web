import { api } from "@backend/api";
import { useQuery } from "convex/react";
import { router } from "expo-router";
import { Dumbbell, Play } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { useMobileAuth } from "@/auth/auth-provider";
import { useCatalog } from "@/providers/catalog-provider";
import {
  buildMuscleSegments,
  MuscleBand,
  ProgressRing,
  Sparkline,
} from "@/components/charts";
import {
  Button,
  Card,
  EmptyState,
  Screen,
  SectionTitle,
} from "@/components/ui";
import { useLocalTemplates } from "@/data/local/provider";
import { useMergedInsightsOverview } from "@/data/local/use-local-insights";
import { greeting } from "@/lib/format";
import { useStartWorkout } from "@/lib/start-workout";
import { colors } from "@/theme";

const WEEKLY_GOAL = 4;

export default function DashboardScreen() {
  const catalog = useCatalog();
  const { isAuthenticated } = useMobileAuth();
  const recent = useQuery(
    api.routes.workouts.queries.recent,
    isAuthenticated ? {} : "skip",
  );
  const remoteTemplates = useQuery(
    api.routes.templates.queries.list,
    isAuthenticated ? {} : "skip",
  );
  const localTemplates = useLocalTemplates();
  const templates = isAuthenticated
    ? (remoteTemplates ??
      localTemplates?.map((template) => ({
        _id: template.remoteId || template._id,
        name: template.name,
        updatedAt: template.updatedAt,
        lastSessionAt: null as number | null,
        exercises: template.exercises.map((exercise) => ({
          slug: exercise.slug,
          setCount: exercise.sets.length,
        })),
      })))
    : localTemplates?.map((template) => ({
        _id: template._id,
        name: template.name,
        updatedAt: template.updatedAt,
        lastSessionAt: null as number | null,
        exercises: template.exercises.map((exercise) => ({
          slug: exercise.slug,
          setCount: exercise.sets.length,
        })),
      }));
  // Fetch enough history to cover this week + prior week for momentum.
  const remoteSessions = useQuery(
    api.routes.insights.queries.sessionHistory,
    isAuthenticated ? { days: 30 } : "skip",
  );
  const overview = useMergedInsightsOverview(
    7,
    isAuthenticated ? remoteSessions : undefined,
  );
  const { active, begin } = useStartWorkout();
  const today = templates?.[0];
  const weekCount = overview?.stats.workoutCount ?? 0;
  const currentVolume = overview?.stats.totalVolume ?? 0;
  const priorVolume = overview?.stats.priorTotalVolume ?? 0;
  const momentum =
    priorVolume > 0
      ? `${Math.round(((currentVolume - priorVolume) / priorVolume) * 100) > 0 ? "+" : ""}${Math.round(((currentVolume - priorVolume) / priorVolume) * 100)}%`
      : currentVolume > 0
        ? "New"
        : "0%";
  const segments = today
    ? buildMuscleSegments(
        today.exercises.map((exercise) => ({
          slug: exercise.slug,
          sets: exercise.setCount,
        })),
        catalog,
      )
    : [];

  const date = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <Screen>
      <View>
        <Text style={{ color: colors.dim, fontSize: 13 }}>{date}</Text>
        <Text
          style={{
            color: colors.text,
            fontSize: 32,
            fontWeight: "700",
            letterSpacing: -0.8,
            marginTop: 5,
          }}
        >
          {greeting()}
        </Text>
      </View>

      {active ? (
        <Card
          style={{
            borderColor: `${colors.success}66`,
            backgroundColor: `${colors.success}0D`,
          }}
        >
          <Text style={{ color: colors.text, fontWeight: "600", fontSize: 16 }}>
            Workout in progress
          </Text>
          <Text style={{ color: colors.dim, fontSize: 13 }}>
            {active.templateName ?? "Quick start"}
          </Text>
          <Button
            label="Continue workout"
            icon={Play}
            onPress={() =>
              router.push({
                pathname: "/workout/[sessionId]",
                params: { sessionId: String(active._id) },
              })
            }
          />
        </Card>
      ) : today ? (
        <Card>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Preview ${today.name}`}
            onPress={() =>
              router.push({
                pathname: "/template/preview/[id]",
                params: { id: String(today._id) },
              })
            }
            style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1, gap: 6 })}
          >
            <Text
              style={{
                color: colors.dim,
                fontWeight: "700",
                fontSize: 11,
                letterSpacing: 2,
              }}
            >
              TODAY
            </Text>
            <Text
              style={{
                color: colors.text,
                fontWeight: "700",
                fontSize: 25,
                letterSpacing: -0.5,
              }}
            >
              {today.name}
            </Text>
            <Text style={{ color: colors.dim, fontSize: 13 }}>
              {today.exercises.length} exercises · ~
              {today.exercises.reduce(
                (sum, exercise) => sum + exercise.setCount,
                0,
              ) *
                3 +
                today.exercises.length * 2}{" "}
              min
            </Text>
          </Pressable>
          <MuscleBand segments={segments} />
          <Button
            label="Start workout"
            icon={Play}
            onPress={() => begin(today._id)}
          />
          <Button
            label="Quick start"
            variant="outline"
            onPress={() => begin()}
          />
        </Card>
      ) : (
        <Card>
          <Text style={{ color: colors.text, fontWeight: "600", fontSize: 17 }}>
            Start your first workout
          </Text>
          <Text style={{ color: colors.dim, fontSize: 13, lineHeight: 19 }}>
            Jump in empty and add exercises as you go—or build a template first.
          </Text>
          <Button label="Quick start" onPress={() => begin()} />
          <Button
            label="New template"
            variant="outline"
            icon={Dumbbell}
            onPress={() =>
              router.push({ pathname: "/template/[id]", params: { id: "new" } })
            }
          />
        </Card>
      )}

      <View style={{ flexDirection: "row", gap: 10 }}>
        <Pressable
          onPress={() => router.push("/week")}
          style={({ pressed }) => [{ flex: 1, opacity: pressed ? 0.85 : 1 }]}
        >
          <Card style={{ flex: 1, minHeight: 146, justifyContent: "center" }}>
            <ProgressRing
              value={weekCount / WEEKLY_GOAL}
              label={`${weekCount}/${WEEKLY_GOAL}`}
            />
            <Text
              style={{ color: colors.text, fontWeight: "600", fontSize: 13 }}
            >
              This week
            </Text>
            <Text style={{ color: colors.dim, fontSize: 11 }}>
              of {WEEKLY_GOAL} sessions
            </Text>
          </Card>
        </Pressable>
        <Pressable
          onPress={() => router.push("/week")}
          style={({ pressed }) => [{ flex: 1, opacity: pressed ? 0.85 : 1 }]}
        >
          <Card style={{ flex: 1, minHeight: 146, paddingBottom: 8 }}>
            <Text
              style={{
                color: colors.dim,
                fontSize: 10,
                fontWeight: "700",
                letterSpacing: 1.8,
              }}
            >
              MOMENTUM
            </Text>
            <Text
              style={{ color: colors.text, fontSize: 30, fontWeight: "700" }}
            >
              {momentum}
            </Text>
            <Text style={{ color: colors.dim, fontSize: 11 }}>
              volume, vs last week
            </Text>
            <Sparkline
              values={overview?.volumeTrend.map((point) => point.volume) ?? []}
            />
          </Card>
        </Pressable>
      </View>

      <View style={{ gap: 12 }}>
        <SectionTitle
          title="Jump back in"
          action={
            <Button
              size="sm"
              variant="ghost"
              label="All templates"
              onPress={() => router.push("/templates")}
            />
          }
        />
        {templates === undefined ? (
          <Text style={{ color: colors.dim }}>Loading…</Text>
        ) : templates.length === 0 ? (
          <EmptyState
            title="No templates yet"
            description="Finish a quick start and save it as a template, or create one from scratch."
            action={
              <Button
                label="Quick start"
                variant="outline"
                onPress={() => begin()}
              />
            }
          />
        ) : (
          <View style={{ gap: 10 }}>
            {templates.slice(0, 3).map((template) => (
              <Card key={template._id}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Preview ${template.name}`}
                  onPress={() =>
                    router.push({
                      pathname: "/template/preview/[id]",
                      params: { id: String(template._id) },
                    })
                  }
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.75 : 1,
                    gap: 4,
                  })}
                >
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: 15,
                      fontWeight: "600",
                    }}
                  >
                    {template.name}
                  </Text>
                  <Text style={{ color: colors.dim, fontSize: 11 }}>
                    {template.exercises.length} exercises ·{" "}
                    {template.lastSessionAt
                      ? `last ${new Date(template.lastSessionAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
                      : "not trained yet"}
                  </Text>
                </Pressable>
                <Button
                  label="Start workout"
                  icon={Play}
                  onPress={() => begin(template._id)}
                />
              </Card>
            ))}
          </View>
        )}
      </View>

      {(recent?.total ?? overview?.stats.workoutCount ?? 0) > 0 ? (
        <Text
          style={{ color: colors.faint, textAlign: "center", fontSize: 11 }}
        >
          {Math.max(recent?.total ?? 0, overview?.stats.workoutCount ?? 0)}{" "}
          workouts logged
        </Text>
      ) : null}
    </Screen>
  );
}
