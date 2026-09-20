import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
// Customer chrome must not reintroduce internal generation telemetry; report
// revision/date remain visible. Admin surfaces intentionally retain diagnostics.
it.each(['app/(app)/audits/[id]/page.tsx','app/(app)/accounts/[id]/page.tsx','components/intelligence/subject-home.tsx'])('does not interpolate prompt internals in %s',path=>{
 const source=readFileSync(new URL('../'+path,import.meta.url),'utf8');
 expect(/\{(?:audit|report|version)\.(?:prompt_version|promptVersion)/.test(source)).toBe(false);
});
