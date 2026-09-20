import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { workflowResourceKey, workflowResourceUrl } from "./workflows-library";

it("keys workflow reads by owner, resource and revision so principals never share a cache", () => {
  expect(workflowResourceKey("a", "1")).toEqual(["workspace", "a", "workflows", "1", ""]);
  expect(workflowResourceKey("b", "1")).not.toEqual(workflowResourceKey("a", "1"));
  expect(workflowResourceKey("a", "2")).not.toEqual(workflowResourceKey("a", "1"));
});

it("reads the owner-scoped workflow resource, never a scheduling or send endpoint", () => {
  expect(workflowResourceUrl()).toBe("/api/resources/workflows");
  expect(workflowResourceUrl()).not.toMatch(/tick|send|approve/);
});
