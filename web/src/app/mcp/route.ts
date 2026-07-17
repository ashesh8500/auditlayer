import { handleAuditLayerMcpRequest } from "@/lib/mcp/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  return handleAuditLayerMcpRequest(request);
}

export async function GET(request: Request) {
  return handleAuditLayerMcpRequest(request);
}

export async function DELETE(request: Request) {
  return handleAuditLayerMcpRequest(request);
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      allow: "GET, POST, DELETE, OPTIONS",
      "access-control-allow-headers": "Authorization, Content-Type, Accept, Mcp-Session-Id, Last-Event-ID",
      "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
      "access-control-allow-origin": "*",
    },
  });
}
