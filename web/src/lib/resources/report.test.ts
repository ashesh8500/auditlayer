import { expect, it } from "vitest";
import { reportVersionKey } from "./report";
it("never identifies immutable report content by audit id alone", () => {
  const identity = { ownerId: "a", reportId: "r", version: 1, contentHash: "aaa", presentationRevision: "p1" };
  const key = reportVersionKey(identity);
  for (const change of [{ ownerId: "b" }, { version: 2 }, { contentHash: "bbb" }, { presentationRevision: "p2" }]) {
    expect(reportVersionKey({ ...identity, ...change })).not.toEqual(key);
  }
});
