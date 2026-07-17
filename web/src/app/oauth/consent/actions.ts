"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

function authorizationId(formData: FormData): string {
  const value = String(formData.get("authorization_id") ?? "");
  if (!/^[0-9a-f-]{20,}$/i.test(value)) throw new Error("Invalid authorization request");
  return value;
}

export async function approveMcpAuthorization(formData: FormData) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.oauth.approveAuthorization(
    authorizationId(formData),
    { skipBrowserRedirect: true },
  );
  if (error || !data?.redirect_url) throw new Error("Could not approve this connection");
  redirect(data.redirect_url);
}

export async function denyMcpAuthorization(formData: FormData) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.oauth.denyAuthorization(
    authorizationId(formData),
    { skipBrowserRedirect: true },
  );
  if (error || !data?.redirect_url) throw new Error("Could not deny this connection");
  redirect(data.redirect_url);
}
