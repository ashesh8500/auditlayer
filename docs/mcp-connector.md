# AuditLayerMedia MCP connector

## Purpose

The connector exposes authenticated, read only AuditLayerMedia intelligence to ChatGPT, Claude, Hermes, and other remote MCP clients.

The external AI performs synthesis. AuditLayerMedia supplies tenant scoped evidence from connected Instagram metrics, account research, progression, and completed audit artifacts.

## Production endpoints

MCP server:

`https://auditlayermedia.com/mcp`

Protected resource metadata:

`https://auditlayermedia.com/.well-known/oauth-protected-resource/mcp`

Authorization server:

`https://eamnfmtkvglbnugzmotw.supabase.co/auth/v1`

OAuth discovery:

`https://eamnfmtkvglbnugzmotw.supabase.co/.well-known/oauth-authorization-server/auth/v1`

Consent page:

`https://auditlayermedia.com/oauth/consent`

Connection management:

`https://auditlayermedia.com/settings/ai-connections`

## Authentication

Supabase Auth is the OAuth 2.1 authorization server. It provides authorization code with PKCE, refresh token rotation, discovery, and dynamic client registration.

Every client requires explicit user approval through the AuditLayerMedia consent page. The MCP server validates every bearer token against Supabase Auth before creating a tenant scoped service.

The Instagram access token is never returned by any MCP tool. Connection queries select only account type, follower count, media count, status, expiry, and observation time.

## Tools

`list_accounts`

Lists accounts owned by the authenticated ALM user.

`get_account_context`

Returns safe connected metrics, connection health, and research freshness for one owned account.

`list_artifacts`

Lists completed and pending audit artifacts plus account progression.

`get_artifact`

Returns one owned ready report as bounded plain text. Scripts, styles, templates, and markup are removed before delivery.

`build_creator_context`

Builds one compact evidence bundle for a monthly strategy, Reel concepts, campaign brief, profile optimization, quarterly review, or growth experiment.

`search` and `fetch`

Provide the data only connector contract expected by ChatGPT deep research. Search result identifiers remain opaque and are resolved through ownership checked service calls.

## Security invariants

1. Bearer identity is validated through `auth.getUser`. JWT payload parsing is used only for nonauthoritative client and scope metadata.

2. Every account and audit query includes both the authenticated user ID and immutable ALM account ID.

3. Storage objects are downloaded only after a second audit ownership check.

4. Reports are converted to bounded plain text before entering model context.

5. All tools declare read only and closed world annotations.

6. The server does not call Hermes, generate content, publish content, or mutate Instagram.

7. OAuth grants can be reviewed and revoked from the ALM settings page.

## Deployment

1. Verify locally from `web`:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

2. Verify Supabase OAuth is enabled:

```bash
curl -s https://eamnfmtkvglbnugzmotw.supabase.co/.well-known/oauth-authorization-server/auth/v1
```

The response must include `authorization_endpoint`, `token_endpoint`, and `registration_endpoint`.

3. Deploy the feature branch to a Vercel preview.

4. Verify protected resource metadata and the unauthenticated MCP challenge.

5. Complete one real OAuth connection from an MCP client before merging.

## Connect from an AI client

Use this remote MCP URL:

`https://auditlayermedia.com/mcp`

The client discovers Supabase OAuth from the protected resource metadata, registers dynamically, redirects the user to AuditLayerMedia, and receives tokens after approval.

In ChatGPT this is added as a custom App in developer mode. In Claude it is added as a custom connector or remote MCP server, depending on the client surface.

## Operational pitfall

On the Supabase free tier, `supabase config push` may fail when `config.toml` includes a customized email template and no custom SMTP provider is configured. That failure can leave the OAuth server disabled.

After every auth config push, verify the live discovery endpoint. If necessary, update these Auth service settings through the Supabase dashboard or Management API:

`oauth_server_enabled = true`

`oauth_server_allow_dynamic_registration = true`

`oauth_server_authorization_path = /oauth/consent`
