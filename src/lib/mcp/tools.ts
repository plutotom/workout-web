import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type {
  ServerRequest,
  ServerNotification,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import type { Id } from "@backend/dataModel";
import { api } from "@backend/api";
import { EXERCISES } from "@/lib/exercises";
import { getMcpConvexClient } from "./convex";

const exerciseSlug = z.string().min(1).max(64);
const setPreset = z.object({ weight: z.number(), reps: z.number() });
const exerciseInput = z.object({
  slug: exerciseSlug,
  sets: z.array(setPreset),
});

type ToolExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;

function apiKeyFrom(extra: ToolExtra): string {
  const token = extra.authInfo?.token;
  if (!token) throw new Error("Not authenticated");
  return token;
}

function jsonResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

const EXERCISE_NOTE =
  "Use slug values from the list_exercises tool (curated catalog).";

export function registerWorkoutMcpTools(server: McpServer) {
  const convex = () => getMcpConvexClient();

  server.registerTool(
    "list_exercises",
    {
      title: "List exercises",
      description:
        "List the exercise catalog (slug, name, short label, muscle group): the curated catalog plus the user's own custom exercises. Use these slugs when creating or updating templates.",
      inputSchema: {},
    },
    async (_args, extra) => {
      const customs = await convex().query(api.routes.mcp.queries.listCustom, {
        apiKey: apiKeyFrom(extra),
      });
      const curated = EXERCISES.map(({ slug, name, short, category }) => ({
        slug,
        name,
        short,
        category,
        custom: false,
      }));
      const custom = customs.map((c) => ({
        slug: c.slug,
        name: c.name,
        short: c.short ?? c.name,
        category: c.category,
        custom: true,
      }));
      return jsonResult([...curated, ...custom]);
    },
  );

  server.registerTool(
    "list_templates",
    {
      title: "List templates",
      description: `List the user's workout templates with exercise summaries. ${EXERCISE_NOTE}`,
      inputSchema: {},
    },
    async (_args, extra) => {
      const data = await convex().query(api.routes.mcp.queries.listTemplates, {
        apiKey: apiKeyFrom(extra),
      });
      return jsonResult(data);
    },
  );

  server.registerTool(
    "get_template",
    {
      title: "Get template",
      description: `Get a single workout template with full set presets. ${EXERCISE_NOTE}`,
      inputSchema: { templateId: z.string() },
    },
    async ({ templateId }, extra) => {
      const data = await convex().query(api.routes.mcp.queries.getTemplate, {
        apiKey: apiKeyFrom(extra),
        templateId: templateId as Id<"workoutTemplates">,
      });
      return jsonResult(data);
    },
  );

  server.registerTool(
    "create_template",
    {
      title: "Create template",
      description: `Create a new workout template. ${EXERCISE_NOTE}`,
      inputSchema: {
        name: z.string(),
        exercises: z.array(exerciseInput),
      },
    },
    async ({ name, exercises }, extra) => {
      const templateId = await convex().mutation(
        api.routes.mcp.mutations.createTemplate,
        { apiKey: apiKeyFrom(extra), name, exercises },
      );
      return jsonResult({ templateId });
    },
  );

  server.registerTool(
    "update_template",
    {
      title: "Update template",
      description: `Update a workout template's name and exercises. ${EXERCISE_NOTE}`,
      inputSchema: {
        templateId: z.string(),
        name: z.string(),
        exercises: z.array(exerciseInput),
      },
    },
    async ({ templateId, name, exercises }, extra) => {
      await convex().mutation(api.routes.mcp.mutations.updateTemplate, {
        apiKey: apiKeyFrom(extra),
        templateId: templateId as Id<"workoutTemplates">,
        name,
        exercises,
      });
      return jsonResult({ ok: true, templateId });
    },
  );

  server.registerTool(
    "delete_template",
    {
      title: "Delete template",
      description: "Delete a workout template.",
      inputSchema: { templateId: z.string() },
    },
    async ({ templateId }, extra) => {
      await convex().mutation(api.routes.mcp.mutations.deleteTemplate, {
        apiKey: apiKeyFrom(extra),
        templateId: templateId as Id<"workoutTemplates">,
      });
      return jsonResult({ ok: true, templateId });
    },
  );

  server.registerTool(
    "get_active_workout",
    {
      title: "Get active workout",
      description:
        "Get the in-progress workout session with exercises and sets, or null.",
      inputSchema: {},
    },
    async (_args, extra) => {
      const data = await convex().query(
        api.routes.mcp.queries.getActiveWorkout,
        {
          apiKey: apiKeyFrom(extra),
        },
      );
      return jsonResult(data);
    },
  );

  server.registerTool(
    "start_workout",
    {
      title: "Start workout",
      description:
        "Start a workout session from a template. Only one active session allowed; set abandonExisting to discard the current one.",
      inputSchema: {
        templateId: z.string(),
        abandonExisting: z.boolean().optional(),
      },
    },
    async ({ templateId, abandonExisting }, extra) => {
      const data = await convex().mutation(
        api.routes.mcp.mutations.startWorkout,
        {
          apiKey: apiKeyFrom(extra),
          templateId: templateId as Id<"workoutTemplates">,
          abandonExisting,
        },
      );
      return jsonResult(data);
    },
  );

  server.registerTool(
    "get_workout",
    {
      title: "Get workout",
      description: "Get a workout session by ID with exercises and sets.",
      inputSchema: { sessionId: z.string() },
    },
    async ({ sessionId }, extra) => {
      const data = await convex().query(api.routes.mcp.queries.getWorkout, {
        apiKey: apiKeyFrom(extra),
        sessionId: sessionId as Id<"workoutSessions">,
      });
      return jsonResult(data);
    },
  );

  server.registerTool(
    "update_set",
    {
      title: "Update set",
      description: "Update weight, reps, and/or completed flag on a set.",
      inputSchema: {
        setId: z.string(),
        weight: z.number().optional(),
        reps: z.number().optional(),
        completed: z.boolean().optional(),
      },
    },
    async ({ setId, weight, reps, completed }, extra) => {
      await convex().mutation(api.routes.mcp.mutations.updateSet, {
        apiKey: apiKeyFrom(extra),
        setId: setId as Id<"sets">,
        weight,
        reps,
        completed,
      });
      return jsonResult({ ok: true, setId });
    },
  );

  server.registerTool(
    "add_set",
    {
      title: "Add set",
      description: "Add a set to a session exercise.",
      inputSchema: { sessionExerciseId: z.string() },
    },
    async ({ sessionExerciseId }, extra) => {
      const setId = await convex().mutation(api.routes.mcp.mutations.addSet, {
        apiKey: apiKeyFrom(extra),
        sessionExerciseId: sessionExerciseId as Id<"sessionExercises">,
      });
      return jsonResult({ setId });
    },
  );

  server.registerTool(
    "finish_workout",
    {
      title: "Finish workout",
      description: "Mark an in-progress workout session as completed.",
      inputSchema: { sessionId: z.string() },
    },
    async ({ sessionId }, extra) => {
      const data = await convex().mutation(
        api.routes.mcp.mutations.finishWorkout,
        {
          apiKey: apiKeyFrom(extra),
          sessionId: sessionId as Id<"workoutSessions">,
        },
      );
      return jsonResult(data);
    },
  );

  server.registerTool(
    "abandon_workout",
    {
      title: "Abandon workout",
      description: "Discard an in-progress workout (excluded from history).",
      inputSchema: { sessionId: z.string() },
    },
    async ({ sessionId }, extra) => {
      await convex().mutation(api.routes.mcp.mutations.abandonWorkout, {
        apiKey: apiKeyFrom(extra),
        sessionId: sessionId as Id<"workoutSessions">,
      });
      return jsonResult({ ok: true, sessionId });
    },
  );

  server.registerTool(
    "get_workout_history",
    {
      title: "Get workout history",
      description:
        "Recent completed workouts across all templates, or full history for one template when templateId is provided.",
      inputSchema: { templateId: z.string().optional() },
    },
    async ({ templateId }, extra) => {
      const data = await convex().query(
        api.routes.mcp.queries.getWorkoutHistory,
        {
          apiKey: apiKeyFrom(extra),
          templateId: templateId
            ? (templateId as Id<"workoutTemplates">)
            : undefined,
        },
      );
      return jsonResult(data);
    },
  );
}
