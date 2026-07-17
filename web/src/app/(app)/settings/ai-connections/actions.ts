"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function revokeAiConnection(formData: FormData) {
  await requireUser();
  const clientId = String(formData.get("client_id") ?? "");
  if (!/^[0-9a-f-]{20,}$/i.test(clientId)) throw new Error("Invalid connection");

  const supabase = await createClient();
  const { error } = await supabase.auth.oauth.revokeGrant({ clientId });
  if (error) throw new Error("Could not revoke this connection");
  revalidatePath("/settings/ai-connections");
}
