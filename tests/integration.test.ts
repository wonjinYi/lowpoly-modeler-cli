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
    expect(payload.vertexCount).toBe(960);
    expect(payload.triangleCount).toBe(320);
    expect(reopened.name).toBe('faceted-orb');
    expect(orb?.type).toBe('mesh');
    if (orb?.type !== 'mesh') throw new Error('orb was not imported as a mesh');
    expect(Object.keys(orb.mesh.faces)).toHaveLength(320);
    expect(Object.keys(orb.mesh.vertices)).toHaveLength(162);
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

  it('preserves joined materials without requiring a later primitive', async () => {
    const document = await compileRecipe({
      name: 'joined', metadata,
      steps: [
        { op: 'group', name: 'shade_pivot' },
        { op: 'primitive', kind: 'cube', name: 'red', size: [1, 1, 1], position: [-0.5, 0.5, 0], color: '#cc3344' },
        { op: 'primitive', kind: 'cube', name: 'blue', size: [1, 1, 1], position: [0.5, 0.5, 0], color: '#3366cc' },
        { op: 'join', targets: ['red', 'blue'], name: 'joined-block' },
      ],
    });
    expect(Object.keys(document.materials)).toHaveLength(2);
    expect(validateDocument(document).filter((issue) => issue.severity === 'error')).toEqual([]);
    const reopened = await importGlb(await exportGlb(document), 'joined');
    expect(Object.keys(reopened.materials)).toHaveLength(2);
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

  it('bakes group scale while preserving hierarchy and world bounds', async () => {
    const document = await compileRecipe({
      name: 'scaled-group', metadata,
      steps: [
        { op: 'group', name: 'shade_pivot' },
        { op: 'primitive', kind: 'cube', name: 'box', parent: 'shade_pivot', size: [1, 1, 1], position: [0, 0.5, 0] },
        { op: 'transform', target: 'shade_pivot', scale: [2, 1, 0.5] },
      ],
    });
    const reopened = await importGlb(await exportGlb(document), 'scaled-group');
    const pivot = Object.values(reopened.nodes).find((node) => node.name === 'shade_pivot');
    const box = Object.values(reopened.nodes).find((node) => node.name === 'box');
    expect(pivot?.transform.scale).toEqual({ x: 1, y: 1, z: 1 });
    expect(box?.parentId).toBe(pivot?.id);
    if (box?.type !== 'mesh') throw new Error('scaled box missing');
    const positions = Object.values(box.mesh.vertices).map((vertex) => vertex.position);
    expect(Math.max(...positions.map((position) => position.x)) - Math.min(...positions.map((position) => position.x))).toBeCloseTo(2);
    expect(Math.max(...positions.map((position) => position.z)) - Math.min(...positions.map((position) => position.z))).toBeCloseTo(0.5);
  });

  it('imports a GLB whose scene root is directly a mesh', async () => {
    const document = await compileRecipe({
      name: 'mesh-root', metadata,
      steps: [{ op: 'primitive', kind: 'cube', name: 'box', size: [1, 1, 1], position: [0, 0.5, 0] }],
    });
    const box = Object.values(document.nodes).find((node) => node.type === 'mesh');
    if (box?.type !== 'mesh') throw new Error('source box missing');
    document.nodes = {
      [document.rootId]: { ...box, id: document.rootId, name: 'asset_root', parentId: null },
    };
    const reopened = await importGlb(await exportGlb(document), 'mesh-root');
    const meshes = Object.values(reopened.nodes).filter((node) => node.type === 'mesh');
    expect(meshes).toHaveLength(1);
    expect(Object.keys(meshes[0]!.mesh.faces)).toHaveLength(6);
  });

  it('reconstructs GLB polygons before directional face editing', async () => {
    const source = await compileRecipe({
      name: 'editable-cube', metadata,
      steps: [
        { op: 'group', name: 'shade_pivot' },
        { op: 'primitive', kind: 'cube', name: 'box', size: [1, 1, 1], position: [0, 0.5, 0] },
      ],
    });
    const reopened = await importGlb(await exportGlb(source), 'editable-cube');
    const boxBefore = Object.values(reopened.nodes).find((node) => node.name === 'box');
    if (boxBefore?.type !== 'mesh') throw new Error('editable box missing');
    expect(Object.keys(boxBefore.mesh.faces)).toHaveLength(6);
    const edited = await compileRecipe({
      name: 'extruded-cube', metadata,
      steps: [{ op: 'extrude', target: 'box', faces: 'top', distance: 0.5 }],
    }, reopened);
    const boxAfter = Object.values(edited.nodes).find((node) => node.name === 'box');
    if (boxAfter?.type !== 'mesh') throw new Error('extruded box missing');
    expect(Object.keys(boxAfter.mesh.faces)).toHaveLength(10);
    expect(validateDocument(edited).filter((issue) => issue.severity === 'error')).toEqual([]);
    expect(validateDocument(await importGlb(await exportGlb(edited), 'extruded-cube')).filter((issue) => issue.severity === 'error')).toEqual([]);
  });
});
