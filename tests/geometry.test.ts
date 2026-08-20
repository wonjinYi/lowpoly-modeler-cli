import { describe, expect, it } from 'vitest';
import { createCube, createIcosphere, createTube } from '../src/geometry/primitives.js';
import { bevelMesh, extrudeFaces, getMeshBounds, mergeCoplanarFaces, selectFaces, weldMesh } from '../src/geometry/operations.js';

describe('mesh generation and editing', () => {
  it('creates the standard subdivision-2 icosphere', () => {
    const mesh = createIcosphere('material-1', 2);
    expect(Object.keys(mesh.vertices)).toHaveLength(162);
    expect(Object.keys(mesh.faces)).toHaveLength(320);
    const bounds = getMeshBounds(mesh)!;
    expect(bounds.size.x).toBeCloseTo(1, 5);
  });

  it('bevels every closed cube edge into low-poly faces', () => {
    const mesh = bevelMesh(createCube('material-1'), 0.08);
    expect(Object.keys(mesh.faces)).toHaveLength(26);
    expect(Object.values(mesh.faces).every((face) => new Set(face.vertexIds).size >= 3)).toBe(true);
  });

  it('extrudes a directional face and keeps side walls', () => {
    const cube = createCube('material-1');
    const top = selectFaces(cube, 'top');
    const result = extrudeFaces(cube, top, 0.5);
    expect(top).toHaveLength(1);
    expect(Object.keys(result.faces)).toHaveLength(10);
    expect(getMeshBounds(result)!.max.y).toBeCloseTo(1);
  });

  it('builds a capped low-poly tube and welds coincident vertices', () => {
    const tube = createTube('material-1', [[0, 0, 0], [0, 1, 0], [0.5, 1.5, 0]], 0.1, 6, true);
    expect(Object.keys(tube.faces)).toHaveLength(14);
    expect(Object.keys(weldMesh(tube, 0.00001).vertices)).toHaveLength(18);
  });

  it('merges a triangulated coplanar quad back into an editable polygon', () => {
    const cube = createCube('material-1');
    const topId = selectFaces(cube, 'top')[0]!;
    const top = cube.faces[topId]!;
    const [a, b, c, d] = top.vertexIds;
    cube.faces[topId] = { ...top, vertexIds: [a!, b!, c!] };
    cube.faces.extra = { id: 'extra', materialId: top.materialId, vertexIds: [a!, c!, d!] };
    const merged = mergeCoplanarFaces(cube);
    expect(Object.keys(merged.faces)).toHaveLength(6);
    expect(selectFaces(merged, 'top')).toHaveLength(1);
  });
});
