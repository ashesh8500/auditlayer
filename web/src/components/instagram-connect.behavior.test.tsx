import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi } from "vitest";
import { InstagramConnect } from "./instagram-connect";
import type { InstagramConnectionCard } from "@/lib/instagram-connection-public";
vi.mock("@/lib/actions/instagram", () => ({ disconnectInstagram: vi.fn() }));
Object.assign(globalThis, { React });
const account: InstagramConnectionCard = { id: "11111111-1111-4111-8111-111111111111", ig_username: "example", followers_count: null, media_count: null, account_type: "BUSINESS", long_lived_expires_at: "2099-01-01", last_refreshed_at: null, is_active: true, connection_status: "connected" };
describe("Instagram lifecycle cards", () => {
  it("labels inactive access without implying queued audits resume automatically", () => {
    const html = renderToStaticMarkup(<InstagramConnect connectedAccount={{ ...account, is_active: false }} />);
    expect(html).toContain("Reconnection required");
    expect(html).not.toContain("Connected data");
    expect(html).not.toContain("New audits will wait");
  });
  it("keeps cancellation and success feedback visible on an active connection", () => {
    const html = renderToStaticMarkup(<InstagramConnect connectedAccount={account} searchParams={{ instagram_error: "permission_denied", instagram_connected: "example" }} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Instagram access was not approved");
    expect(html).toContain('role="status"');
    expect(html).toContain("followers unavailable");
  });
  it.each([true, false])("offers identity-targeted reconnect and disconnect when active=%s", (active) => {
    const html = renderToStaticMarkup(<InstagramConnect connectedAccount={{ ...account, is_active: active }} />);
    expect(html).toContain(`/api/auth/instagram/start?connection_id=${account.id}`);
    expect(html).toContain('name="connection_id"');
    expect(html).toContain("Disconnect and delete access");
    expect(html).toContain(`instagram-connection-${account.id}`);
  });
});
