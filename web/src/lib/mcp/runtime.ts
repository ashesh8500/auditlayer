import "server-only";

import { isSupabaseAdminConfigured } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

import { authenticateSupabaseToken } from "./auth";
import { handleMcpRequest } from "./protocol";
import { createSupabaseMcpRepository } from "./repository";
import { createMcpService } from "./service";

export async function handleAuditLayerMcpRequest(request: Request): Promise<Response> {
  const resourceMetadataUrl = new URL(
    "/.well-known/oauth-protected-resource/mcp",
    request.url,
  ).href;

  if (!isSupabaseAdminConfigured()) {
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Connector is not configured" },
        id: null,
      }),
      { status: 503, headers: { "content-type": "application/json" } },
    );
  }

  return handleMcpRequest(request, {
    resourceMetadataUrl,
    authenticate: (token) =>
      authenticateSupabaseToken(token, async (accessToken) => {
        const { data, error } = await createAdminClient().auth.getUser(accessToken);
        return error || !data.user ? null : { id: data.user.id };
      }),
    createService: (userId) =>
      createMcpService(userId, createSupabaseMcpRepository()),
  });
}
