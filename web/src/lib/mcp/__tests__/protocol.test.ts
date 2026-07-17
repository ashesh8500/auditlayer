import { describe, expect, it } from "vitest";

import { handleMcpRequest, protectedResourceMetadata } from "../protocol";
import { createMcpService, type McpRepository } from "../service";

const emptyRepository: McpRepository = {
  async listAccounts() { return []; },
  async getAccount() { return null; },
  async getConnection() { return null; },
  async getProgression() { return []; },
  async listAudits() { return []; },
  async getAudit() { return null; },
  async getReportText() { return null; },
};

describe("AuditLayerMedia MCP protocol", () => {
  it("advertises Supabase OAuth as the authorization server", () => {
    expect(
      protectedResourceMetadata(
        "https://auditlayermedia.com/mcp",
        "https://example.supabase.co/auth/v1",
      ),
    ).toEqual({
      resource: "https://auditlayermedia.com/mcp",
      authorization_servers: ["https://example.supabase.co/auth/v1"],
      bearer_methods_supported: ["header"],
      resource_name: "AuditLayerMedia Intelligence",
    });
  });

  it("rejects unauthenticated MCP requests with protected resource discovery", async () => {
    const response = await handleMcpRequest(
      new Request("https://auditlayermedia.com/mcp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: { name: "test", version: "1.0.0" },
          },
        }),
      }),
      {
        authenticate: async () => null,
        createService: () => {
          throw new Error("service must not be created");
        },
        resourceMetadataUrl:
          "https://auditlayermedia.com/.well-known/oauth-protected-resource/mcp",
      },
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain(
      'resource_metadata="https://auditlayermedia.com/.well-known/oauth-protected-resource/mcp"',
    );
  });

  it("completes MCP initialization for a valid bearer token", async () => {
    const response = await handleMcpRequest(
      new Request("https://auditlayermedia.com/mcp", {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: { name: "test", version: "1.0.0" },
          },
        }),
      }),
      {
        authenticate: async (token) => token === "valid-token" ? { userId: "user-one" } : null,
        createService: (userId) => createMcpService(userId, emptyRepository),
        resourceMetadataUrl:
          "https://auditlayermedia.com/.well-known/oauth-protected-resource/mcp",
      },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: "2025-06-18",
        serverInfo: { name: "auditlayermedia", version: "1.0.0" },
      },
    });
  });

  it("exposes the stable read only connector tool set", async () => {
    const response = await handleMcpRequest(
      new Request("https://auditlayermedia.com/mcp", {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
      }),
      {
        authenticate: async () => ({ userId: "user-one" }),
        createService: (userId) => createMcpService(userId, emptyRepository),
        resourceMetadataUrl:
          "https://auditlayermedia.com/.well-known/oauth-protected-resource/mcp",
      },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.result.tools.map((tool: { name: string }) => tool.name).sort()).toEqual([
      "build_creator_context",
      "fetch",
      "get_account_context",
      "get_artifact",
      "list_accounts",
      "list_artifacts",
      "search",
    ]);
    expect(body.result.tools.every((tool: { annotations?: { readOnlyHint?: boolean } }) => tool.annotations?.readOnlyHint === true)).toBe(true);
  });
});
