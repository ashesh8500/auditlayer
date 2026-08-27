import { beforeEach, describe, expect, it, vi } from "vitest";

import { createAdminClient } from "@/lib/supabase/admin";
import { mirrorAuditlayerInstagramConnection } from "./preview-seed";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

describe("preview Instagram seeding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not clone an OAuth connection into another tenant", async () => {
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn(() => {
        throw new Error("preview attempted to read or write a live connection");
      }),
    } as never);

    await expect(
      mirrorAuditlayerInstagramConnection("preview-user"),
    ).resolves.toBeNull();
    expect(createAdminClient).not.toHaveBeenCalled();
  });
});
