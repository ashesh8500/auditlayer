import { describe, expect, it } from "vitest";

import {
  isLiveInstagramConnection,
  isWorkspaceAccount,
  WORKSPACE_ACCOUNT_STATUSES,
} from "./account-ownership";

describe("account ownership story", () => {
  it("admits only connected or explicitly managed properties", () => {
    expect(WORKSPACE_ACCOUNT_STATUSES).toEqual(["connected", "managed"]);
    expect(isWorkspaceAccount("connected")).toBe(true);
    expect(isWorkspaceAccount("managed")).toBe(true);
  });

  it("does not treat an audited public handle as an owned account", () => {
    expect(isWorkspaceAccount("observed")).toBe(false);
    expect(isWorkspaceAccount("audit_target")).toBe(false);
  });

  it("treats inactive, expired, and malformed Instagram connections as stale", () => {
    expect(isLiveInstagramConnection(null)).toBe(false);
    expect(isLiveInstagramConnection({ is_active: false, long_lived_expires_at: "2999-01-01" })).toBe(false);
    expect(isLiveInstagramConnection({ is_active: true, long_lived_expires_at: "2000-01-01" })).toBe(false);
    expect(isLiveInstagramConnection({ is_active: true, long_lived_expires_at: "not-a-date" })).toBe(false);
    expect(isLiveInstagramConnection({ is_active: true, long_lived_expires_at: "2999-01-01" })).toBe(true);
  });
});
