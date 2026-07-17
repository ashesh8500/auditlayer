import { supabaseUrl } from "@/lib/env";
import { protectedResourceMetadata } from "@/lib/mcp/protocol";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const resource = new URL("/mcp", request.url).href;
  const authorizationServer = `${supabaseUrl().replace(/\/$/, "")}/auth/v1`;
  return Response.json(protectedResourceMetadata(resource, authorizationServer), {
    headers: { "cache-control": "public, max-age=300" },
  });
}
