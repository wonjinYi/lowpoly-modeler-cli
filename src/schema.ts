import { Ajv2020 } from 'ajv/dist/2020.js';
import type { ErrorObject, JSONSchemaType } from 'ajv';
import type { Recipe } from './types.js';

const vector = { type: 'array', minItems: 3, maxItems: 3, items: { type: 'number' } } as const;
const color = { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' } as const;
const target = { type: 'string', minLength: 1 } as const;
const commonMaterial = {
  color,
  roughness: { type: 'number', minimum: 0, maximum: 1 },
  metalness: { type: 'number', minimum: 0, maximum: 1 },
  opacity: { type: 'number', minimum: 0, maximum: 1 },
  shading: { enum: ['flat', 'smooth'] },
} as const;
const faceSelector = { anyOf: [{ enum: ['all', 'top', 'bottom', 'front', 'back', 'left', 'right'] }, { type: 'array', minItems: 1, items: target }] } as const;
const idSelector = { anyOf: [{ const: 'all' }, { type: 'array', minItems: 1, items: target }] } as const;

const operationSchemas = [
  { properties: { op: { const: 'primitive' }, kind: { enum: ['cube', 'plane', 'cylinder', 'cone', 'sphere', 'icosphere'] }, name: target, parent: target, size: vector, radius: { type: 'number', exclusiveMinimum: 0 }, height: { type: 'number', exclusiveMinimum: 0 }, segments: { type: 'integer', minimum: 3, maximum: 64 }, latitudeSegments: { type: 'integer', minimum: 2, maximum: 64 }, subdivisions: { type: 'integer', minimum: 0, maximum: 3 }, position: vector, rotation: vector, ...commonMaterial }, required: ['op', 'kind', 'name'] },
  { properties: { op: { const: 'tube' }, name: target, parent: target, path: { type: 'array', minItems: 2, items: vector }, radius: { type: 'number', exclusiveMinimum: 0 }, segments: { type: 'integer', minimum: 3, maximum: 64 }, capped: { type: 'boolean' }, ...commonMaterial }, required: ['op', 'name', 'path', 'radius'] },
  { properties: { op: { const: 'group' }, name: target, parent: target, position: vector, rotation: vector }, required: ['op', 'name'] },
  { properties: { op: { const: 'transform' }, target, position: vector, translate: vector, rotation: vector, rotate: vector, scale: vector, size: vector }, required: ['op', 'target'] },
  { properties: { op: { const: 'material' }, target, ...commonMaterial }, required: ['op', 'target'] },
  { properties: { op: { const: 'rename' }, target, name: target }, required: ['op', 'target', 'name'] },
  { properties: { op: { const: 'delete' }, target }, required: ['op', 'target'] },
  { properties: { op: { const: 'parent' }, target, parent: target }, required: ['op', 'target', 'parent'] },
  { properties: { op: { const: 'ground' }, target, y: { type: 'number' } }, required: ['op'] },
  { properties: { op: { const: 'join' }, targets: { type: 'array', minItems: 2, uniqueItems: true, items: target }, name: target, weldTolerance: { type: 'number', minimum: 0 } }, required: ['op', 'targets', 'name'] },
  { properties: { op: { const: 'weld' }, target, distance: { type: 'number', minimum: 0 } }, required: ['op', 'target'] },
  { properties: { op: { const: 'boolean' }, operation: { enum: ['difference', 'union', 'intersection'] }, target, cutter: target, name: target, keepCutter: { type: 'boolean' } }, required: ['op', 'operation', 'target', 'cutter'] },
  { properties: { op: { const: 'mirror' }, target, axis: { enum: ['x', 'y', 'z'] }, weldTolerance: { type: 'number', minimum: 0 } }, required: ['op', 'target', 'axis'] },
  { properties: { op: { const: 'bend' }, target, axis: { enum: ['x', 'y', 'z'] }, angle: { type: 'number' }, origin: vector }, required: ['op', 'target', 'axis', 'angle'] },
  { properties: { op: { const: 'bevel' }, target, width: { type: 'number', exclusiveMinimum: 0 }, segments: { type: 'integer', minimum: 1, maximum: 4 } }, required: ['op', 'target', 'width'] },
  { properties: { op: { const: 'extrude' }, target, faces: faceSelector, distance: { type: 'number' }, rotate: vector }, required: ['op', 'target', 'faces', 'distance'] },
  { properties: { op: { const: 'inset' }, target, faces: faceSelector, factor: { type: 'number', exclusiveMinimum: 0, exclusiveMaximum: 1 } }, required: ['op', 'target', 'faces', 'factor'] },
  { properties: { op: { const: 'delete_faces' }, target, faces: faceSelector }, required: ['op', 'target', 'faces'] },
  { properties: { op: { const: 'subdivide' }, target, edges: idSelector }, required: ['op', 'target'] },
  { properties: { op: { const: 'transform_vertices' }, target, vertices: idSelector, translate: vector, rotate: vector, scale: vector }, required: ['op', 'target', 'vertices'] },
  { properties: { op: { const: 'merge_vertices' }, target, vertices: idSelector, distance: { type: 'number', minimum: 0 } }, required: ['op', 'target', 'vertices'] },
].map((schema) => ({ type: 'object', additionalProperties: false, ...schema }));

export const recipeSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://lowpoly.local/recipe.schema.json',
  title: 'Lowpoly Recipe',
  type: 'object',
  additionalProperties: false,
  required: ['name', 'steps'],
  properties: {
    version: { const: 1 },
    name: target,
    metadata: {
      type: 'object', additionalProperties: false,
      properties: { forward: { const: '+Z' }, groundY: { type: 'number' }, groundTolerance: { type: 'number', minimum: 0 } },
    },
    steps: { type: 'array', items: { oneOf: operationSchemas } },
  },
} as const;

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validate = ajv.compile(recipeSchema as unknown as JSONSchemaType<Recipe>);

export function parseRecipe(value: unknown): Recipe {
  if (!validate(value)) {
    throw new Error(`Invalid recipe:\n${formatAjvErrors(validate.errors ?? [])}`);
  }
  return value as Recipe;
}

function formatAjvErrors(errors: ErrorObject[]): string {
  return errors.map((error) => `- ${error.instancePath || '/'} ${error.message ?? 'is invalid'}`).join('\n');
}
