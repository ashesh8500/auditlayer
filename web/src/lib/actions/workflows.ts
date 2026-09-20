"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { modelCatalog } from "@/lib/workspace/catalog";
import { type WorkflowResourceView } from "@/lib/workflows/dto";
import { workflowRpc } from "@/lib/workflows/server";

export type WorkflowCommandState = { status: "idle" | "ok" | "error"; message?: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const id = (value: string) => { if (!uuid.test(value)) throw new Error("Invalid reference. Refresh and try again."); return value; };

/** Explicit owner commands only. Saving grants neither run nor schedule nor send. */
export async function workflowCommand(_previous: WorkflowCommandState, form: FormData): Promise<WorkflowCommandState> {
  const owner = await requireProfile();
  const text = (name: string) => String(form.get(name) ?? "");
  try {
    const command = text("command");
    const base = { owner_id: owner.id, workflow_id: id(text("workflow_id")), version_id: id(text("version_id")) };
    let granted = false;
    if (command === "save") {
      const model = modelCatalog.find(option => option.id === text("model_id"));
      if (!model || model.availability !== "available" || !model.rate_card_version) {
        return { status: "error", message: "This model is unavailable. A qualified model and pinned rate are required before saving an executable workflow. No run was started." };
      }
      const objective = text("objective").trim();
      const timezone = text("timezone");
      try { new Intl.DateTimeFormat("en", { timeZone: timezone }).format(); } catch { throw new Error("Choose an IANA timezone."); }
      if (!objective || objective.length > 2000 || !/^([01]\d|2[0-3]):[0-5]\d$/.test(text("local_time"))) throw new Error("Check the objective and local time.");
      const weekday = text("weekday") === "" ? null : Number(text("weekday"));
      const customer = Number(text("customer_max_microusd")), upstream = Number(text("upstream_max_microusd"));
      if ((weekday !== null && (!Number.isInteger(weekday) || weekday < 0 || weekday > 6)) || !Number.isSafeInteger(customer) || customer < 1 || customer > 15000000 || !Number.isSafeInteger(upstream) || upstream < 1 || upstream > 60000000) throw new Error("Choose bounded schedule and usage ceilings.");
      const recipients = text("recipients").split(/[\s,]+/).filter(Boolean).map(id);
      if (!recipients.length || recipients.length > 10 || new Set(recipients).size !== recipients.length) throw new Error("Choose one to ten distinct recipient accounts.");
      await workflowRpc("save", { ...base, subject_id: id(text("subject_id")), objective, timezone, local_time: text("local_time"), weekday,
        model: model.pin, rate_card_version: model.rate_card_version, method_version: "brand-update.v1", allowed_tools: [],
        customer_max_microusd: customer, upstream_max_microusd: upstream, recipients });
    } else if (["pause", "cancel", "activate"].includes(command)) {
      await workflowRpc("control", { ...base, command });
    } else if (command === "grant") {
      const kind = text("kind");
      if (!["run", "schedule", "delivery"].includes(kind) || !["true", "false"].includes(text("granted"))) throw new Error("Choose the permission explicitly.");
      granted = text("granted") === "true";
      await workflowRpc("grant", { ...base, kind, recipient_id: kind === "delivery" ? id(text("recipient_id")) : owner.id, granted });
    } else if (command === "approve") {
      const recipients = text("recipients").split(/[\s,]+/).filter(Boolean).map(id);
      await workflowRpc("approve", { owner_id: owner.id, occurrence_id: id(text("occurrence_id")), artifact_version_id: id(text("artifact_version_id")), recipients });
    } else {
      return { status: "error", message: "Unsupported workflow command. Trial execution is not enabled by saving or granting schedule permission." };
    }
    // A returned mutation is not proof of durable state. Read current owner scope.
    const resource = await workflowRpc("resource", { owner_id: owner.id }) as WorkflowResourceView;
    const saved = resource.ownerId === owner.id && resource.workflows.find(row => row.id === base.workflow_id && row.version_id === base.version_id);
    if (!saved) throw new Error("readback");
    if ((command === "pause" && saved.status !== "paused") || (command === "cancel" && saved.status !== "cancelled") || (command === "activate" && saved.status !== "active") || (command === "save" && saved.status !== "draft")) throw new Error("readback");
    if (command === "grant") {
      const actual = text("kind") === "run" ? saved.run_granted : text("kind") === "schedule" ? saved.schedule_granted : saved.delivery_granted.includes(text("recipient_id"));
      if (actual !== granted) throw new Error("readback");
    }
    if (command === "approve") {
      const occurrence = saved.occurrences.find(row => row.id === text("occurrence_id"));
      if (!occurrence || occurrence.artifact_version_id !== text("artifact_version_id") || !saved.recipients.every(recipient => occurrence.deliveries.some(row => row.recipient_id === recipient && row.artifact_version_id === occurrence.artifact_version_id))) throw new Error("readback");
    }
    revalidatePath("/workflows");
    return { status: "ok", message: command === "save" ? "Saved as draft. Run, schedule and recipient permissions are separate." : "Saved. Current permissions apply to future dispatch and access." };
  } catch {
    return { status: "error", message: "Could not confirm that change. Refresh before retrying. Check ownership, the exact version, permissions and available credit." };
  }
}
