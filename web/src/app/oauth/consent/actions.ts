"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { parseAuthorizationId } from "@/lib/mcp/authorization";

function authorizationId(formData: FormData): string {
  return parseAuthorizationId(formData.get("authorization_id"));
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
