// Offline runtime AND typecheck, without building or modifying the application.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'web/node_modules/typescript'));
const source = path.join(root, 'web/src/lib/workspace-contracts/index.ts');
const options = { noEmit: true, strict: true, skipLibCheck: true, esModuleInterop: true, resolveJsonModule: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, moduleResolution: ts.ModuleResolutionKind.Node10 };
const program = ts.createProgram([source], options);
const errors = ts.getPreEmitDiagnostics(program);
assert.equal(errors.length, 0, ts.formatDiagnosticsWithColorAndContext(errors, {getCurrentDirectory:()=>root, getCanonicalFileName:x=>x, getNewLine:()=> '\n'}));
const js = ts.transpileModule(fs.readFileSync(source, 'utf8'), {compilerOptions:options}).outputText;
const mod = new Module(source, module);
mod.filename = source;
mod.paths = Module._nodeModulePaths(path.dirname(source));
mod._compile(js, source);
const {validate} = mod.exports;
const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures.json'), 'utf8'));
for (const fixture of fixtures) {
  if (fixture.valid) assert.deepEqual(validate(fixture.contract, fixture.value), fixture.value, fixture.name);
  else assert.throws(() => validate(fixture.contract, fixture.value), undefined, fixture.name);
}
for (const value of [NaN, Infinity, -Infinity]) assert.throws(()=>validate('Money',{currency:'USD',microusd:value}));
assert.throws(()=>validate('__proto__', {}));
assert.equal(mod.exports.policy.enrollment_enabled, false);
assert.deepEqual(mod.exports.rateCards, []);
console.log(`TS typecheck + ${fixtures.length} shared fixtures + nonfinite/unknown-contract guards passed`);
