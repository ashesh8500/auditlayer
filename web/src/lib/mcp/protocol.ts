import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";

import type { createMcpService } from "./service";

export type McpService = ReturnType<typeof createMcpService>;

export type McpRequestDependencies = {
  authenticate(token: string): Promise<{
    userId: string;
    clientId?: string;
    scopes?: string[];
    expiresAt?: number;
  } | null>;
  createService(userId: string): McpService;
  resourceMetadataUrl: string;
};

export function protectedResourceMetadata(resource: string, authorizationServer: string) {
  return {
    resource,
    authorization_servers: [authorizationServer],
    bearer_methods_supported: ["header"],
    resource_name: "AuditLayerMedia Intelligence",
  };
}

function bearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export async function handleMcpRequest(
  request: Request,
  dependencies: McpRequestDependencies,
): Promise<Response> {
  const token = bearerToken(request);
  const identity = token ? await dependencies.authenticate(token) : null;
  if (!identity) {
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Authentication required" },
        id: null,
      }),
      {
        status: 401,
        headers: {
          "content-type": "application/json",
          "www-authenticate": `Bearer resource_metadata="${dependencies.resourceMetadataUrl}"`,
        },
      },
    );
  }

  const service = dependencies.createService(identity.userId);
  const server = new McpServer({ name: "auditlayermedia", version: "1.0.0" });

  server.registerTool(
    "list_accounts",
    {
      title: "List AuditLayerMedia accounts",
      description:
        "List the authenticated user's AuditLayerMedia accounts. Use this before requesting account specific intelligence.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      const result = await service.listAccounts();
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );

  server.registerTool(
    "get_account_context",
    {
      title: "Get account context",
      description:
        "Get connected Instagram metrics, research freshness, and saved context for one owned AuditLayerMedia account.",
      inputSchema: { account_id: z.string().uuid() },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ account_id }) => {
      const result = await service.getAccountContext(account_id);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );

  server.registerTool(
    "list_artifacts",
    {
      title: "List account artifacts",
      description: "List audit artifacts and metric progression for one owned account.",
      inputSchema: {
        account_id: z.string().uuid(),
        limit: z.number().int().min(1).max(25).optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ account_id, limit }) => {
      const result = await service.listArtifacts(account_id, limit);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );

  server.registerTool(
    "get_artifact",
    {
      title: "Get audit artifact",
      description: "Read one owned, ready AuditLayerMedia audit as bounded plain text with provenance metadata.",
      inputSchema: { account_id: z.string().uuid(), artifact_id: z.string().uuid() },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ account_id, artifact_id }) => {
      const result = await service.getArtifact(account_id, artifact_id);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );

  server.registerTool(
    "build_creator_context",
    {
      title: "Build creator context",
      description:
        "Build one compact evidence bundle for creating a content strategy, campaign brief, profile review, or growth experiment from real ALM data.",
      inputSchema: {
        account_id: z.string().uuid(),
        task: z.enum([
          "monthly_content_strategy",
          "reel_concepts",
          "campaign_brief",
          "profile_optimization",
          "quarterly_review",
          "growth_experiment",
        ]),
        artifact_id: z.string().uuid().optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ account_id, task, artifact_id }) => {
      const result = await service.buildCreatorContext(account_id, task, artifact_id);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );

  server.registerTool(
    "search",
    {
      title: "Search AuditLayerMedia",
      description: "Search the authenticated user's ALM accounts and audit artifacts. Compatible with ChatGPT deep research.",
      inputSchema: { query: z.string().min(1).max(200) },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ query }) => {
      const normalized = query.toLowerCase();
      const { accounts } = await service.listAccounts();
      const results: Array<{ id: string; title: string; url: string; text: string }> = [];
      for (const account of accounts.slice(0, 20)) {
        const accountMatches = [account.handle, account.display_name, account.platform]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalized));
        if (accountMatches) {
          results.push({
            id: `account:${account.id}`,
            title: `@${account.handle} account context`,
            url: `https://auditlayermedia.com/accounts/${account.id}`,
            text: `${account.platform} account, research ${account.research_status}`,
          });
        }
        const artifactData = await service.listArtifacts(account.id, 5);
        for (const artifact of artifactData.artifacts) {
          const text = `${artifact.type} ${artifact.goal ?? ""} ${artifact.status}`;
          if (accountMatches || text.toLowerCase().includes(normalized)) {
            results.push({
              id: `artifact:${account.id}:${artifact.id}`,
              title: `@${account.handle} ${artifact.type} audit`,
              url: `https://auditlayermedia.com/audits/${artifact.id}/read`,
              text,
            });
          }
        }
      }
      const result = { results: results.slice(0, 20) };
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );

  server.registerTool(
    "fetch",
    {
      title: "Fetch AuditLayerMedia result",
      description: "Fetch a search result by its opaque account or artifact identifier.",
      inputSchema: { id: z.string().min(1).max(200) },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      const parts = id.split(":");
      let result: unknown;
      if (parts[0] === "account" && parts.length === 2) {
        result = await service.getAccountContext(parts[1]);
      } else if (parts[0] === "artifact" && parts.length === 3) {
        result = await service.getArtifact(parts[1], parts[2]);
      } else {
        throw new Error("Unknown search result identifier");
      }
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result as Record<string, unknown>,
      };
    },
  );

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);

  return transport.handleRequest(request, {
    authInfo: {
      token: token!,
      clientId: identity.clientId ?? "supabase-oauth",
      scopes: identity.scopes ?? [],
      expiresAt: identity.expiresAt,
    },
  });
}
