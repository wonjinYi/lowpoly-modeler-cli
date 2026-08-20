#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { compileRecipe } from './recipe.js';
import { parseRecipe, recipeSchema } from './schema.js';
import { exportGlb, importGlb, inspectGlbPayload, type GlbPayloadInfo } from './io/gltf.js';
import { hasErrors, validateDocument } from './validation.js';
import { worldBounds } from './document.js';
import type { Recipe, SceneDocument, ValidationIssue } from './types.js';

const HELP = `lowpoly - deterministic low-poly recipe compiler

Usage:
  lowpoly build <recipe.json> --out <model.glb>
  lowpoly edit <source.glb> <recipe.json> --out <model.glb>
  lowpoly validate <model.glb> [--json] [--strict]
  lowpoly inspect <model.glb> [--json]
  lowpoly schema [--out <recipe.schema.json>]

Recipe rotations and bend angles are degrees. Coordinates use +Y up and +Z forward.`;

interface CliOptions { out?: string; json?: boolean; strict?: boolean; help?: boolean }

function argumentsFor(args: string[]): { command?: string; positionals: string[]; options: CliOptions } {
  const command = args[0];
  const parsed = parseArgs({ args: args.slice(1), allowPositionals: true, strict: true, options: { out: { type: 'string', short: 'o' }, json: { type: 'boolean' }, strict: { type: 'boolean' }, help: { type: 'boolean', short: 'h' } } });
  return { command, positionals: parsed.positionals, options: parsed.values };
}

async function readRecipe(file: string): Promise<Recipe> {
  let value: unknown;
  try { value = JSON.parse(await readFile(file, 'utf8')) as unknown; }
  catch (error) { throw new Error(`Unable to read recipe "${file}": ${error instanceof Error ? error.message : String(error)}`); }
  return parseRecipe(value);
}

async function readGlb(file: string): Promise<ArrayBuffer> {
  const data = await readFile(file); return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

async function atomicWrite(file: string, data: Uint8Array | string): Promise<void> {
  const resolved = path.resolve(file); await mkdir(path.dirname(resolved), { recursive: true }); const temporary = `${resolved}.${process.pid}.tmp`;
  try { await writeFile(temporary, data); await rename(temporary, resolved); }
  catch (error) { await rm(temporary, { force: true }); throw error; }
}

function printIssues(issues: ValidationIssue[]): void {
  if (!issues.length) { console.log('PASS  No validation issues.'); return; }
  for (const issue of issues) console.log(`${issue.severity.toUpperCase().padEnd(7)} ${issue.code.padEnd(24)} ${issue.message}`);
}

function meshCount(document: SceneDocument): number { return Object.values(document.nodes).filter((node) => node.type === 'mesh' && !node.hidden).length; }

function summary(document: SceneDocument, payload: GlbPayloadInfo) {
  const bounds = worldBounds(document);
  return {
    name: document.name,
    payload,
    coordinateSystem: { up: '+Y', forward: document.metadata.forwardConfirmed ? '+Z' : 'unconfirmed' },
    bounds,
    objects: Object.values(document.nodes).map((node) => ({
      id: node.id, name: node.name, type: node.type, parentId: node.parentId, hidden: node.hidden,
      position: node.transform.position,
      rotationDegrees: { x: node.transform.rotation.x * 180 / Math.PI, y: node.transform.rotation.y * 180 / Math.PI, z: node.transform.rotation.z * 180 / Math.PI },
      scale: node.transform.scale,
      ...(node.type === 'mesh' ? { vertices: Object.keys(node.mesh.vertices).length, faces: Object.keys(node.mesh.faces).length, materials: [...new Set(Object.values(node.mesh.faces).map((face) => document.materials[face.materialId]?.name ?? face.materialId))] } : {}),
    })),
    validation: validateDocument(document),
  };
}

async function verifyAndWrite(document: SceneDocument, output: string): Promise<void> {
  const before = validateDocument(document); if (hasErrors(before)) { printIssues(before); throw new Error('Document contains validation errors; GLB was not written.'); }
  const buffer = await exportGlb(document); const payload = inspectGlbPayload(buffer);
  if (payload.textureCount || payload.imageCount) throw new Error('Internal verification found a texture/image payload.');
  const reopened = await importGlb(buffer, document.name); const after = validateDocument(reopened);
  if (hasErrors(after)) { printIssues(after); throw new Error('Export round-trip validation failed.'); }
  if (meshCount(reopened) !== meshCount(document)) throw new Error('Export round-trip changed the visible mesh count.');
  await atomicWrite(output, new Uint8Array(buffer));
  console.log(`WROTE  ${path.resolve(output)}`); console.log(`GLB    ${payload.byteLength} bytes, ${payload.meshCount} mesh(es), ${payload.materialCount} material(s), no textures/images`);
  const warnings = before.filter((issue) => issue.severity !== 'error'); if (warnings.length) printIssues(warnings);
}

async function build(recipePath: string | undefined, output: string | undefined): Promise<void> {
  if (!recipePath || !output) throw new Error('build requires <recipe.json> and --out <model.glb>.');
  const recipe = await readRecipe(recipePath); await verifyAndWrite(await compileRecipe(recipe), output);
}

async function edit(sourcePath: string | undefined, recipePath: string | undefined, output: string | undefined): Promise<void> {
  if (!sourcePath || !recipePath || !output) throw new Error('edit requires <source.glb> <recipe.json> and --out <model.glb>.');
  const recipe = await readRecipe(recipePath); const document = await importGlb(await readGlb(sourcePath), path.basename(sourcePath, path.extname(sourcePath)));
  await verifyAndWrite(await compileRecipe(recipe, document), output);
}

async function validate(file: string | undefined, json: boolean, strict: boolean): Promise<void> {
  if (!file) throw new Error('validate requires <model.glb>.');
  const buffer = await readGlb(file); const payload = inspectGlbPayload(buffer); let document: SceneDocument | undefined; const issues: ValidationIssue[] = [];
  if (payload.textureCount || payload.imageCount) issues.push({ severity: 'error', code: 'textures-present', message: `GLB contains ${payload.textureCount} texture(s) and ${payload.imageCount} image(s).` });
  else { document = await importGlb(buffer, path.basename(file, path.extname(file))); issues.push(...validateDocument(document)); }
  if (json) console.log(JSON.stringify({ file: path.resolve(file), payload, issues }, null, 2)); else { console.log(`FILE   ${path.resolve(file)}`); console.log(`GLB    ${payload.byteLength} bytes, ${payload.meshCount} mesh(es), ${payload.textureCount} texture(s), ${payload.imageCount} image(s)`); printIssues(issues); }
  if (hasErrors(issues) || (strict && issues.some((issue) => issue.severity === 'warning'))) process.exitCode = 1;
}

async function inspect(file: string | undefined, json: boolean): Promise<void> {
  if (!file) throw new Error('inspect requires <model.glb>.'); const buffer = await readGlb(file); const payload = inspectGlbPayload(buffer);
  if (payload.textureCount || payload.imageCount) throw new Error('Cannot inspect scene hierarchy for a textured GLB; use validate for payload diagnostics.');
  const document = await importGlb(buffer, path.basename(file, path.extname(file))); const value = summary(document, payload);
  if (json) console.log(JSON.stringify(value, null, 2));
  else { console.log(`ASSET  ${value.name}`); console.log(`GLB    ${payload.byteLength} bytes, ${payload.meshCount} mesh(es)`); if (value.bounds) console.log(`BOUNDS min(${value.bounds.min.x.toFixed(3)}, ${value.bounds.min.y.toFixed(3)}, ${value.bounds.min.z.toFixed(3)}) max(${value.bounds.max.x.toFixed(3)}, ${value.bounds.max.y.toFixed(3)}, ${value.bounds.max.z.toFixed(3)})`); for (const object of value.objects) console.log(`${object.type === 'mesh' ? 'MESH ' : 'GROUP'}  ${object.name} [${object.id}] parent=${object.parentId ?? '-'}${'vertices' in object ? ` vertices=${object.vertices} faces=${object.faces}` : ''}`); }
}

export async function runCli(args = process.argv.slice(2)): Promise<void> {
  const { command, positionals, options } = argumentsFor(args);
  if (options.help || !command || command === 'help') { console.log(HELP); return; }
  switch (command) {
    case 'build': await build(positionals[0], options.out); return;
    case 'edit': await edit(positionals[0], positionals[1], options.out); return;
    case 'validate': await validate(positionals[0], options.json ?? false, options.strict ?? false); return;
    case 'inspect': await inspect(positionals[0], options.json ?? false); return;
    case 'schema': { const data = `${JSON.stringify(recipeSchema, null, 2)}\n`; if (options.out) { await atomicWrite(options.out, data); console.log(`WROTE  ${path.resolve(options.out)}`); } else process.stdout.write(data); return; }
    default: throw new Error(`Unknown command "${command}".\n\n${HELP}`);
  }
}

runCli().catch((error) => { console.error(`ERROR  ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
