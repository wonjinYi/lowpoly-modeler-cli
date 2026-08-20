import { describe, expect, it } from 'vitest';
import { compileRecipe } from '../src/recipe.js';
import { exportGlb, importGlb, inspectGlbPayload } from '../src/io/gltf.js';
import { validateDocument } from '../src/validation.js';
import type { Recipe } from '../src/types.js';

const metadata = { forward: '+Z' as const, groundY: 0, groundTolerance: 0.001 };

describe('recipe to GLB integration', () => {
  it('preserves faceted icosphere normals, hierarchy, and unit scale through GLB', async () => {
    const recipe: Recipe = {
      version: 1,
      name: 'faceted-orb',
      metadata,
      steps: [
        { op: 'group', name: 'shade_pivot' },
        { op: 'primitive', kind: 'icosphere', name: 'orb', parent: 'shade_pivot', radius: 0.8, subdivisions: 2, shading: 'flat', position: [0, 0.8, 0] },
      ],
    };
    const document = await compileRecipe(recipe);
    const buffer = await exportGlb(document);
    const payload = inspectGlbPayload(buffer);
    const reopened = await importGlb(buffer, recipe.name);
    const orb = Object.values(reopened.nodes).find((node) => node.name === 'orb');
    expect(payload.imageCount).toBe(0);
    expect(payload.textureCount).toBe(0);
    expect(payload.meshCount).toBe(1);
    expect(orb?.type).toBe('mesh');
    if (orb?.type !== 'mesh') throw new Error('orb was not imported as a mesh');
    expect(Object.keys(orb.mesh.faces)).toHaveLength(320);
    expect(Object.keys(orb.mesh.vertices)).toHaveLength(960);
    expect(orb.transform.scale).toEqual({ x: 1, y: 1, z: 1 });
    expect(Object.values(reopened.materials)[0]?.shading).toBe('flat');
    expect(validateDocument(reopened).filter((issue) => issue.severity === 'error')).toEqual([]);
  });

  it('compiles join, weld, and Boolean difference', async () => {
    const recipe: Recipe = {
      name: 'operations', metadata,
      steps: [
        { op: 'group', name: 'shade_pivot' },
        { op: 'primitive', kind: 'cube', name: 'left', size: [1, 1, 1], position: [-0.5, 0.5, 0] },
        { op: 'primitive', kind: 'cube', name: 'right', size: [1, 1, 1], position: [0.5, 0.5, 0] },
        { op: 'join', targets: ['left', 'right'], name: 'block', weldTolerance: 0.0001 },
        { op: 'primitive', kind: 'cylinder', name: 'cutter', radius: 0.25, height: 2, segments: 8, position: [0, 0.5, 0] },
        { op: 'boolean', operation: 'difference', target: 'block', cutter: 'cutter', name: 'cut-block' },
      ],
    };
    const document = await compileRecipe(recipe);
    expect(Object.values(document.nodes).filter((node) => node.type === 'mesh')).toHaveLength(1);
    const result = Object.values(document.nodes).find((node) => node.name === 'cut-block');
    expect(result?.type).toBe('mesh');
    if (result?.type !== 'mesh') throw new Error('Boolean output missing');
    expect(Object.keys(result.mesh.faces).length).toBeGreaterThan(12);
    const reopened = await importGlb(await exportGlb(document), recipe.name);
    expect(validateDocument(reopened).filter((issue) => issue.severity === 'error')).toEqual([]);
  });

  it('applies an edit recipe to a reopened GLB', async () => {
    const source = await compileRecipe({ name: 'source', metadata, steps: [{ op: 'group', name: 'shade_pivot' }, { op: 'primitive', kind: 'cube', name: 'wall', size: [2, 1, 0.3], position: [0, 0.5, 0] }] });
    const reopened = await importGlb(await exportGlb(source), 'source');
    const edited = await compileRecipe({ name: 'edited', metadata, steps: [{ op: 'rename', target: 'wall', name: 'wall-fixed' }, { op: 'material', target: 'wall-fixed', color: '#eadfc9' }, { op: 'transform', target: 'wall-fixed', translate: [1, 0, 0], scale: [1.2, 1, 1] }] }, reopened);
    const wall = Object.values(edited.nodes).find((node) => node.name === 'wall-fixed');
    expect(wall?.transform.position.x).toBe(1);
    expect(wall?.transform.scale).toEqual({ x: 1, y: 1, z: 1 });
    expect(Object.values(edited.materials)[0]?.color).toBe('#eadfc9');
  });
});
