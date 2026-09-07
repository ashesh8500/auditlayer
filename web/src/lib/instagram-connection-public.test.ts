import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  INSTAGRAM_CONNECTION_CARD_FIELDS,
  INSTAGRAM_CONNECTION_HEALTH_FIELDS,
} from "./instagram-connection-public";

const FORBIDDEN_BROWSER_FIELDS = [
  "access_token",
  "long_lived_token",
  "user_id",
  "created_at",
  "updated_at",
];

describe("authenticated Instagram connection projections", () => {
  it("exposes only the connected-state card fields and no credential columns", () => {
    expect(INSTAGRAM_CONNECTION_CARD_FIELDS).toBe(
      "id,ig_username,followers_count,media_count,account_type,long_lived_expires_at,last_refreshed_at,is_active,connection_status",
    );
    expect(INSTAGRAM_CONNECTION_HEALTH_FIELDS).toBe(
      "ig_username,is_active,long_lived_expires_at,last_refreshed_at,connection_status",
    );

    for (const projection of [
      INSTAGRAM_CONNECTION_CARD_FIELDS,
      INSTAGRAM_CONNECTION_HEALTH_FIELDS,
    ]) {
      const fields = new Set(projection.split(","));
      for (const forbidden of FORBIDDEN_BROWSER_FIELDS) {
        expect(fields.has(forbidden)).toBe(false);
      }
      expect(projection).not.toContain("*");
    }
  });

  it("requires every authenticated connection query to use an allowlisted projection", () => {
    const pages = [
      ["src/app/(app)/dashboard/page.tsx", "INSTAGRAM_CONNECTION_CARD_FIELDS"],
      ["src/app/(app)/accounts/page.tsx", "INSTAGRAM_CONNECTION_HEALTH_FIELDS"],
      ["src/app/(app)/accounts/[id]/page.tsx", "INSTAGRAM_CONNECTION_HEALTH_FIELDS"],
    ] as const;

    for (const [relativePath, projectionName] of pages) {
      const source = readFileSync(path.join(process.cwd(), relativePath), "utf8");
      expect(source).toContain(`.select(${projectionName})`);
      expect(source).not.toMatch(
        /\.from\("instagram_connections"\)[\s\S]{0,160}\.select\("\*"\)/,
      );
    }
  });

  it("keeps reconnect-required rows visible to the dashboard", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/app/(app)/dashboard/page.tsx"),
      "utf8",
    );

    expect(source).not.toContain('.eq("is_active", true)');
  });

  it("labels stale owned Instagram connections as reconnect-required in the account list", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/app/(app)/accounts/page.tsx"),
      "utf8",
    );

    expect(source).toContain('"Reconnect Instagram"');
  });
});
