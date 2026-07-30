/**
 * One-off: run session AI generate N times on gpt-5-nano and report token usage.
 * Uses the same system prompt + schema as the app; raises maxOutputTokens so
 * reasoning can finish (app hard-caps at 2000 and truncates).
 *
 *   pnpm exec tsx --env-file=.env.local scripts/ai-nano-token-bench.ts
 */
import { generateObject } from "ai";

import {
  SESSION_GENERATE_SYSTEM_PROMPT,
  sessionDraftSchema,
} from "../src/lib/ai/session-draft";
import {
  formatCatalogForPrompt,
  selectCatalogForAiPrompt,
} from "../src/lib/ai/template-draft";

const MODEL = "openai/gpt-5-nano";
const RUNS = 10;
/** High enough that reasoning + JSON can finish; app uses 2000. */
const MAX_OUTPUT_TOKENS = 16_000;
const APP_CAP = 2_000;

const USER_PROMPT = `Face cable three sets 10 reps then eight reps then eight reps 23 pounds for all of them then chin up three sets with four reps then tricep push down cable 28 pounds thirty3 pounds 38 pounds all at 10 reps bench press dumbbell 30 pounds thirty5 pounds 35 pounds 865 reps School crusher dumbbell 30 pounds 35 lbs. 35 pounds eight reps than eight reps than six reps incline press dumbbell all 25 pounds all six reps hammer curl dumbbell 25 pounds for all reps and five reps for each set`;

type UsageRow = {
  run: number;
  ok: boolean;
  finishReason: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  textTokens: number | null;
  reasoningTokens: number | null;
  totalTokens: number | null;
  addCount: number | null;
  ms: number;
  error: string | null;
  wouldHitAppCap: boolean | null;
};

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function pct(n: number): string {
  return `${Math.round(n)}`;
}

async function main() {
  if (!process.env.AI_GATEWAY_API_KEY?.trim()) {
    console.error("AI_GATEWAY_API_KEY missing (.env.local)");
    process.exit(1);
  }

  const catalog = selectCatalogForAiPrompt({
    prompt: USER_PROMPT,
    customs: [],
  });
  const prompt = [
    "Current session: empty (no exercises yet).",
    `User request:\n${USER_PROMPT}`,
    `Exercise catalog for add (slug | name | category):\n${formatCatalogForPrompt(catalog)}`,
  ].join("\n\n");

  console.log(`model: ${MODEL}`);
  console.log(`runs: ${RUNS}`);
  console.log(`maxOutputTokens: ${MAX_OUTPUT_TOKENS} (app cap: ${APP_CAP})`);
  console.log(`catalog size: ${catalog.length}`);
  console.log(`prompt chars: ${prompt.length}`);
  console.log("");

  const rows: UsageRow[] = [];

  for (let i = 1; i <= RUNS; i++) {
    const started = Date.now();
    process.stdout.write(`run ${i}/${RUNS}… `);
    try {
      const result = await generateObject({
        model: MODEL,
        schema: sessionDraftSchema,
        schemaName: "SessionReshapeDraft",
        schemaDescription:
          "Removals and additions for an in-progress workout. User reviews before apply.",
        system: SESSION_GENERATE_SYSTEM_PROMPT,
        prompt,
        temperature: 0.3,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      });

      const usage = result.usage as {
        inputTokens?: number;
        outputTokens?: number;
        totalTokens?: number;
        outputTokenDetails?: {
          textTokens?: number;
          reasoningTokens?: number;
        };
      };

      const outputTokens = usage.outputTokens ?? null;
      const reasoningTokens = usage.outputTokenDetails?.reasoningTokens ?? null;
      const textTokens = usage.outputTokenDetails?.textTokens ?? null;
      const row: UsageRow = {
        run: i,
        ok: true,
        finishReason: result.finishReason ?? null,
        inputTokens: usage.inputTokens ?? null,
        outputTokens,
        textTokens,
        reasoningTokens,
        totalTokens: usage.totalTokens ?? null,
        addCount: result.object.add.length,
        ms: Date.now() - started,
        error: null,
        wouldHitAppCap: outputTokens != null ? outputTokens > APP_CAP : null,
      };
      rows.push(row);
      console.log(
        `ok finish=${row.finishReason} in=${row.inputTokens} out=${row.outputTokens} text=${row.textTokens} reason=${row.reasoningTokens} adds=${row.addCount} ${row.ms}ms` +
          (row.wouldHitAppCap ? ` ⚠ exceeds app ${APP_CAP}` : ""),
      );
    } catch (error) {
      const err = error as {
        finishReason?: string;
        usage?: {
          inputTokens?: number;
          outputTokens?: number;
          totalTokens?: number;
          outputTokenDetails?: {
            textTokens?: number;
            reasoningTokens?: number;
          };
        };
        message?: string;
      };
      const outputTokens = err.usage?.outputTokens ?? null;
      const row: UsageRow = {
        run: i,
        ok: false,
        finishReason: err.finishReason ?? null,
        inputTokens: err.usage?.inputTokens ?? null,
        outputTokens,
        textTokens: err.usage?.outputTokenDetails?.textTokens ?? null,
        reasoningTokens: err.usage?.outputTokenDetails?.reasoningTokens ?? null,
        totalTokens: err.usage?.totalTokens ?? null,
        addCount: null,
        ms: Date.now() - started,
        error: (error instanceof Error ? error.message : String(error)).slice(
          0,
          120,
        ),
        wouldHitAppCap: outputTokens != null ? outputTokens >= APP_CAP : true,
      };
      rows.push(row);
      console.log(
        `FAIL finish=${row.finishReason} out=${row.outputTokens} text=${row.textTokens} reason=${row.reasoningTokens} ${row.ms}ms — ${row.error}`,
      );
    }
  }

  const ok = rows.filter((r) => r.ok);
  const nums = (pick: (r: UsageRow) => number | null) =>
    ok.map(pick).filter((n): n is number => n != null);

  console.log("\n======== PER-RUN ========");
  for (const r of rows) {
    console.log(
      JSON.stringify({
        run: r.run,
        ok: r.ok,
        finishReason: r.finishReason,
        input: r.inputTokens,
        output: r.outputTokens,
        text: r.textTokens,
        reasoning: r.reasoningTokens,
        total: r.totalTokens,
        adds: r.addCount,
        ms: r.ms,
        wouldHitAppCap2k: r.wouldHitAppCap,
        error: r.error,
      }),
    );
  }

  console.log("\n======== AVERAGES (successful runs only) ========");
  console.log(`success: ${ok.length}/${rows.length}`);
  if (ok.length === 0) {
    console.log("No successful runs — cannot average.");
    process.exit(2);
  }
  console.log(`avg input:     ${pct(avg(nums((r) => r.inputTokens)))}`);
  console.log(`avg output:    ${pct(avg(nums((r) => r.outputTokens)))}`);
  console.log(`avg text:      ${pct(avg(nums((r) => r.textTokens)))}`);
  console.log(`avg reasoning: ${pct(avg(nums((r) => r.reasoningTokens)))}`);
  console.log(`avg total:     ${pct(avg(nums((r) => r.totalTokens)))}`);
  console.log(`avg adds:      ${avg(nums((r) => r.addCount)).toFixed(1)}`);
  console.log(`avg latency:   ${pct(avg(ok.map((r) => r.ms)))} ms`);
  const hitCap = ok.filter((r) => r.wouldHitAppCap).length;
  console.log(
    `would exceed app maxOutputTokens=${APP_CAP}: ${hitCap}/${ok.length} successful runs`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
