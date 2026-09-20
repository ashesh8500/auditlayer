import { expect, it } from "vitest";
import { safeNext, loginRecoveryUrl } from "./redirects";
it.each(["//evil.test", "/\\evil.test", "/a\n", "/a\u0000", "https://evil.test", "/%5cevil.test", "/%0a/evil"])("rejects unsafe next %s", value => {
  expect(safeNext(value)).toBe("/dashboard");
  expect(new URL(safeNext(value), "https://alm.test").origin).toBe("https://alm.test");
});
it("preserves nested query context on recovery", () => {
 const next = "/audits/new?subject=abc&channel=x";
 expect(safeNext(next)).toBe(next);
 const url = new URL(loginRecoveryUrl(next, "auth", "invite"), "https://alm.test");
 expect(url.searchParams.get("next")).toBe(next);
 expect(url.searchParams.get("trial")).toBe("invite");
 expect(url.searchParams.get("error")).toBe("auth");
});
