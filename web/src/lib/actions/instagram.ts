"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
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
  if (error) throw new Error("instagram_disconnect_failed");

  revalidatePath("/accounts");
  revalidatePath("/dashboard");
}
