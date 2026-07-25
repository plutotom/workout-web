/**
 * Live structured-output probes against Vercel AI Gateway.
 * Invoked by scripts/ai-gateway-smoke.mjs when AI_GATEWAY_API_KEY is set.
 */
import { generateStructuredObject } from "../src/lib/ai/generate-structured";
import { resolveAiGatewayModel } from "../src/lib/ai/resolve-model";
import {
  SESSION_GENERATE_SYSTEM_PROMPT,
  sessionDraftSchema,
} from "../src/lib/ai/session-draft";
import {
  GENERATE_SYSTEM_PROMPT,
  templateDraftSchema,
} from "../src/lib/ai/template-draft";

const model = resolveAiGatewayModel();
console.log(`model: ${model}`);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function smokeSession(): Promise<void> {
  const object = await generateStructuredObject({
    model,
    schema: sessionDraftSchema,
    schemaName: "SessionReshapeDraft",
    schemaDescription:
      "Removals and additions for an in-progress workout. User reviews before apply.",
    system: SESSION_GENERATE_SYSTEM_PROMPT,
    prompt: [
      "Current session exercises (use these exact slugs in removeSlugs):",
      "1. bench (0/3 sets done)",
      "",
      "User request:",
      "Add squat with 3 sets of 5. Keep bench.",
      "",
      "Exercise catalog for add (slug | name | category):",
      "bench | Bench Press | chest",
      "squat | Back Squat | legs",
      "rdl | Romanian Deadlift | legs",
    ].join("\n"),
    temperature: 0,
    maxOutputTokens: 800,
  });

  assert(Array.isArray(object.removeSlugs), "session.removeSlugs missing");
  assert(Array.isArray(object.add), "session.add missing");
  assert(
    object.add.some((ex) => ex.slug === "squat"),
    `session.add should include squat, got: ${JSON.stringify(object.add)}`,
  );
  console.log(
    `✓ session draft (remove=${object.removeSlugs.length}, add=${object.add.length})`,
  );
}

async function smokeTemplate(): Promise<void> {
  const object = await generateStructuredObject({
    model,
    schema: templateDraftSchema,
    schemaName: "WorkoutTemplate",
    schemaDescription:
      "A single workout template with catalog exercise slugs and set presets.",
    system: GENERATE_SYSTEM_PROMPT,
    prompt: [
      "Mode: create",
      "",
      "User request:",
      "Simple push day: bench and ohp only. 3x8 each, weight 0.",
      "",
      "Exercise catalog (slug | name | category). Use ONLY these slugs:",
      "bench | Bench Press | chest",
      "ohp | Overhead Press | shoulders",
      "squat | Back Squat | legs",
    ].join("\n"),
    temperature: 0,
    maxOutputTokens: 800,
  });

  assert(typeof object.name === "string" && object.name.length > 0, "name");
  assert(
    Array.isArray(object.exercises) && object.exercises.length >= 1,
    "exercises",
  );
  const slugs = object.exercises.map((e) => e.slug);
  assert(
    slugs.includes("bench") || slugs.includes("ohp"),
    `template should use catalog slugs, got: ${slugs.join(", ")}`,
  );
  console.log(
    `✓ template draft "${object.name}" (${object.exercises.length} exercises)`,
  );
}

try {
  await smokeSession();
  await smokeTemplate();
  console.log("\nAI Gateway smoke passed.");
} catch (error) {
  console.error("\nAI Gateway smoke failed.");
  console.error(error);
  process.exit(1);
}
