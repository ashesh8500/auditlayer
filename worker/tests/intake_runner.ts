/**
 * TS intake runner — reads JSON test cases from stdin, runs evaluateIntake
 * on each, and prints JSON array of results to stdout.
 *
 * Input schema:  { handle: string, goal: string, context?: string,
 *                   plan?: string, platform?: string, completed_audits?: number,
 *                   followers?: number | null, gifted_audits?: number }[]
 *
 * Called by Python cross-language parity test via tsx.
 */
import { evaluateIntake } from "../../web/src/lib/domain.ts";

interface TestCase {
  handle: string;
  goal: string;
  context?: string;
  plan?: string;
  platform?: string;
  completed_audits?: number;
  followers?: number | null;
  gifted_audits?: number;
}

async function main() {
  // Read all stdin
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf-8").trim();
  if (!raw) {
    console.error("No input provided on stdin");
    process.exit(1);
  }

  const cases: TestCase[] = JSON.parse(raw);
  if (!Array.isArray(cases)) {
    console.error("Expected JSON array on stdin");
    process.exit(1);
  }

  const results = cases.map((tc) => {
    const decision = evaluateIntake(
      {
        handle: tc.handle,
        goal: tc.goal as any,
        context: tc.context ?? "",
        platform: tc.platform as any,
        plan: (tc.plan ?? "free") as any,
      },
      tc.completed_audits ?? 0,
      tc.followers ?? null,
      tc.gifted_audits ?? 0,
    );
    return decision;
  });

  process.stdout.write(JSON.stringify(results));
  process.stdout.write("\n");
}

main().catch((err) => {
  console.error("TS runner error:", err);
  process.exit(1);
});
