import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { expect, it } from "vitest";
const root = resolve(import.meta.dirname, "../..");
const retired = ["components/live-timeline.tsx", "app/admin/cost-dashboard.tsx", "components/whimsical-shapes.tsx", "components/ui/led.tsx"];
it("retires only the four unused UI files, retaining public protocol destinations",()=>{
 for(const file of retired) expect(existsSync(join(root,"src",file)),file).toBe(false);
 for(const file of ["app/try/[token]/page.tsx","app/s/[token]/page.tsx","app/mcp/route.ts","app/oauth/consent/page.tsx"]) expect(existsSync(join(root,"src",file)),file).toBe(true);
});
it("does not retain an unreachable Connections error branch", () => {
 expect(readFileSync(join(root, "src/components/connections-library.tsx"), "utf8")).not.toMatch(/const error = false|\{error \?/);
});
it("has no imports of retired components",()=>{
 const walk=(dir:string):string[]=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):/\.(ts|tsx)$/.test(e.name)?[join(dir,e.name)]:[]);
 for(const file of walk(join(root,"src"))) {
  if(file.endsWith("dead-ui.test.ts"))continue;
  expect(readFileSync(file,"utf8")).not.toMatch(/(?:from\s*|import\s*\()["'][^"']*(?:live-timeline|cost-dashboard|whimsical-shapes|ui\/led)["']/);
 }
});
