import { beforeEach, describe, expect, it, vi } from "vitest";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { captureWebFailure } from "@/lib/sentry";
import { createAdminClient } from "@/lib/supabase/admin";
import { disconnectInstagram } from "./instagram";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/sentry", () => ({ captureWebFailure: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

const requireUserMock = vi.mocked(requireUser);
const createAdminClientMock = vi.mocked(createAdminClient);
const revalidatePathMock = vi.mocked(revalidatePath);
const captureWebFailureMock = vi.mocked(captureWebFailure);

beforeEach(() => {
  requireUserMock.mockReset();
  createAdminClientMock.mockReset();
  revalidatePathMock.mockReset();
  captureWebFailureMock.mockReset();
  requireUserMock.mockResolvedValue({ id: "owner-123" } as never);
});

describe("disconnectInstagram", () => {
  it("deletes through one owner-scoped transactional RPC and revalidates visible states", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    createAdminClientMock.mockReturnValue({ rpc } as never);
    const formData = new FormData();
    formData.set("connection_id", "connection-456");

    await disconnectInstagram(formData);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("disconnect_instagram_connection", {
      p_user_id: "owner-123",
      p_connection_id: "connection-456",
    });
    expect(revalidatePathMock.mock.calls).toEqual([["/accounts"], ["/dashboard"]]);
  });

  it("does not construct an admin client when the connection id is absent", async () => {
    await disconnectInstagram(new FormData());

    expect(createAdminClientMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("captures a failed owner-scoped disconnect with fixed safe dimensions", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "private row detail" } });
    createAdminClientMock.mockReturnValue({ rpc } as never);
    const formData = new FormData();
    formData.set("connection_id", "connection-456");

    await expect(disconnectInstagram(formData)).rejects.toThrow("instagram_disconnect_failed");

    expect(captureWebFailureMock).toHaveBeenCalledWith(expect.any(Error), {
      surface: "instagram_persistence",
      operation: "disconnect",
      status: "failed",
      errorClass: "InstagramDisconnectError",
    });
    expect(JSON.stringify(captureWebFailureMock.mock.calls)).not.toContain("owner-123");
    expect(JSON.stringify(captureWebFailureMock.mock.calls)).not.toContain("connection-456");
    expect(JSON.stringify(captureWebFailureMock.mock.calls)).not.toContain("private row detail");
  });
});
