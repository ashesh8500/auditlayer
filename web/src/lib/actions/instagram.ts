"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { captureWebFailure } from "@/lib/sentry";
import { createAdminClient } from "@/lib/supabase/admin";

export async function disconnectInstagram(formData: FormData) {
  const user = await requireUser();
  const connectionId = String(formData.get("connection_id") ?? "");
  if (!connectionId) return;

  const admin = createAdminClient();
  const { error } = await (admin as any).rpc(
    "disconnect_instagram_connection",
    {
      p_user_id: user.id,
      p_connection_id: connectionId,
    },
  );
  if (error) {
    const disconnectError = new Error("instagram_disconnect_failed");
    captureWebFailure(disconnectError, {
      surface: "instagram_persistence",
      operation: "disconnect",
      status: "failed",
      errorClass: "InstagramDisconnectError",
    });
    redirect("/settings/connections?instagram_error=disconnect_failed");
  }

  revalidatePath("/accounts");
  revalidatePath("/dashboard");
  revalidatePath("/settings/connections");
  revalidatePath("/subjects", "layout");
  redirect("/settings/connections?disconnected=1");
}
