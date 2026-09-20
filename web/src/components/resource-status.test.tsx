import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { ResourceStatus } from "./resource-status";
it("labels the origin check time, retaining it after a failed refresh", () => {
  const fetchedAt = "2026-09-19T12:00:00Z";
  const query = { data: { fetchedAt }, dataUpdatedAt: Date.parse("2026-09-19T15:00:00Z"), error: new Error("offline"), isFetching: false, refetch: vi.fn() };
  const html = renderToStaticMarkup(<ResourceStatus query={query} label="Reports" />);
  expect(html).toContain(`Last checked ${new Date(fetchedAt).toLocaleTimeString()}`);
  expect(html).not.toContain(new Date(query.dataUpdatedAt).toLocaleTimeString());
  expect(html).toContain("previously loaded data");
});
it("does not label a missing origin timestamp with cache receipt time", () => {
  const html = renderToStaticMarkup(<ResourceStatus query={{ data: undefined, dataUpdatedAt: 123456, error: null, isFetching: false, refetch: vi.fn() }} label="Reports" />);
  expect(html).not.toContain("Last checked");
});
