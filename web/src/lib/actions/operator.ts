"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth";
import { isOperatorConfigured, isSupabaseAdminConfigured } from "@/lib/env";
import {
  buildOperatorSystemContext,
  operatorSessionId,
  validateOperatorMessage,
} from "@/lib/operator";
import { createAdminClient } from "@/lib/supabase/admin";

export type OperatorActionState = {
  status: "idle" | "ok" | "error";
  message?: string;
  answer?: string;
};

const FAILURE_MESSAGE = "The ALM operator could not complete this request. No change was made.";

async function reportHtml(admin: ReturnType<typeof createAdminClient>, reportPath: string | null) {
  if (!reportPath) return "";
  const { data, error } = await admin.storage.from("reports").download(reportPath);
  if (error || !data) return "";
  const html = await data.text();
  return html.slice(0, 250_000);
}

async function operatorThread(
  admin: ReturnType<typeof createAdminClient>,
  auditId: string,
  profileId: string,
) {
  const table = admin.from("operator_threads");
  const { data: existing, error: existingError } = await table
    .select("id,hermes_session_id")
    .eq("audit_id", auditId)
    .maybeSingle();
  if (existingError) throw new Error("Operator thread lookup failed");
  if (existing) return existing as { id: string; hermes_session_id: string };

  const sessionId = operatorSessionId(auditId);
  const { data, error } = await table
    .upsert(
      {
        audit_id: auditId,
        hermes_session_id: sessionId,
        created_by: profileId,
      },
      { onConflict: "audit_id", ignoreDuplicates: false },
    )
    .select("id,hermes_session_id")
    .single();
  if (error || !data) throw new Error("Operator thread creation failed");
  return data as { id: string; hermes_session_id: string };
}

export async function sendOperatorMessage(
  _previous: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  const profile = await requireAdmin();
  if (!isSupabaseAdminConfigured() || !isOperatorConfigured()) {
    return { status: "error", message: "The ALM operator connection is not configured." };
  }

  let auditId: string;
  let message: string;
  try {
    auditId = String(formData.get("auditId") ?? "");
    operatorSessionId(auditId);
    message = validateOperatorMessage(String(formData.get("message") ?? ""));
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Invalid request" };
  }

  const admin = createAdminClient();
  const { data: audit, error: auditError } = await admin
    .from("audits")
    .select("id,handle,goal,status,limitations,model,report_path,agent_bundle_version")
    .eq("id", auditId)
    .maybeSingle();
  if (auditError || !audit) return { status: "error", message: "Audit not found." };

  let thread: { id: string; hermes_session_id: string };
  try {
    thread = await operatorThread(admin, auditId, profile.id);
  } catch {
    return { status: "error", message: FAILURE_MESSAGE };
  }

  const runId = randomUUID();
  const messageTable = admin.from("operator_messages");
  const jobTable = admin.from("operator_jobs");
  const { data: history, error: historyError } = await messageTable
    .select("role,content")
    .eq("thread_id", thread.id)
    .order("created_at", { ascending: true })
    .limit(20);
  if (historyError) return { status: "error", message: FAILURE_MESSAGE };

  const { error: messageError } = await messageTable.insert({
    thread_id: thread.id,
    role: "user",
    content: message,
    author_id: profile.id,
    run_id: runId,
  });
  if (messageError) return { status: "error", message: FAILURE_MESSAGE };

  const { data: job, error: jobError } = await jobTable
    .insert({
      thread_id: thread.id,
      audit_id: auditId,
      kind: "discussion",
      status: "running",
      instruction: message,
      requested_by: profile.id,
    })
    .select("id")
    .single();
  if (jobError || !job) return { status: "error", message: FAILURE_MESSAGE };

  const html = await reportHtml(admin, audit.report_path);
  const systemContext = buildOperatorSystemContext(
    {
      id: audit.id,
      handle: audit.handle,
      goal: audit.goal,
      status: audit.status,
      limitations: audit.limitations,
      model: audit.model,
      agentBundleVersion: audit.agent_bundle_version ?? null,
    },
    html,
  );
  const base = process.env.ALM_OPERATOR_API_BASE!.replace(/\/$/, "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55_000);

  try {
    const response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.ALM_OPERATOR_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": runId,
        "X-Hermes-Session-Id": thread.hermes_session_id,
      },
      body: JSON.stringify({
        model: "deepseek-v4-flash",
        stream: false,
        messages: [
          { role: "system", content: systemContext },
          ...((history ?? []) as Array<{ role: string; content: string }>).slice(-12),
          { role: "user", content: message },
        ],
      }),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Operator returned ${response.status}`);
    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const answer = body.choices?.[0]?.message?.content?.trim();
    if (!answer) throw new Error("Operator returned no answer");
    const boundedAnswer = answer.slice(0, 12000);

    const [{ error: assistantError }, { error: completedError }] = await Promise.all([
      messageTable.insert({
        thread_id: thread.id,
        role: "assistant",
        content: boundedAnswer,
        author_id: null,
        run_id: runId,
      }),
      jobTable.update({ status: "completed", result: "Discussion completed" }).eq("id", job.id),
    ]);
    if (assistantError || completedError) throw new Error("Operator result persistence failed");
    revalidatePath(`/admin/audits/${auditId}`);
    return { status: "ok", message: "Discussion saved.", answer: boundedAnswer };
  } catch {
    await jobTable
      .update({ status: "failed", error: "Operator request failed without applying changes" })
      .eq("id", job.id);
    return { status: "error", message: FAILURE_MESSAGE };
  } finally {
    clearTimeout(timeout);
  }
}

export async function createOperatorJob(
  _previous: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  const profile = await requireAdmin();
  if (!isSupabaseAdminConfigured()) {
    return { status: "error", message: "The operator job queue is not configured." };
  }
  const auditId = String(formData.get("auditId") ?? "");
  const kind = String(formData.get("kind") ?? "");
  if (!["refinement", "engineering", "operations"].includes(kind)) {
    return { status: "error", message: "Choose a valid request type." };
  }
  try {
    operatorSessionId(auditId);
    const instruction = validateOperatorMessage(String(formData.get("instruction") ?? ""));
    const admin = createAdminClient();
    const thread = await operatorThread(admin, auditId, profile.id);
    const { error } = await admin.from("operator_jobs").insert({
      thread_id: thread.id,
      audit_id: auditId,
      kind,
      status: "queued",
      approval_state: kind === "operations" ? "requested" : "not_required",
      instruction,
      requested_by: profile.id,
    });
    if (error) throw new Error("Queue write failed");
    revalidatePath(`/admin/audits/${auditId}`);
    return {
      status: "ok",
      message:
        kind === "operations"
          ? "Operations request recorded and awaiting Ashesh approval."
          : "Request recorded for bounded execution.",
    };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : FAILURE_MESSAGE };
  }
}
