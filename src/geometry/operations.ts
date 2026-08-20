import * as THREE from 'three';
import type { Axis, EdgeSelector, FaceSelector, MeshData, MeshFace, MeshVertex, Vec3, Vec3Tuple, VertexSelector } from '../types.js';
import { cloneMesh, tupleToVec3 } from '../types.js';

export interface MeshBounds { min: Vec3; max: Vec3; size: Vec3; center: Vec3 }
export interface MeshEdge { id: string; a: string; b: string; faceIds: string[] }

function nextId(entries: Record<string, unknown>, prefix: string): string {
  let index = Object.keys(entries).length + 1;
  while (entries[`${prefix}${index}`]) index += 1;
  return `${prefix}${index}`;
}

export function getMeshBounds(mesh: MeshData): MeshBounds | null {
  const vertices = Object.values(mesh.vertices);
  if (vertices.length === 0) return null;
  const min = { ...vertices[0]!.position };
  const max = { ...min };
  for (const { position } of vertices.slice(1)) {
    min.x = Math.min(min.x, position.x); min.y = Math.min(min.y, position.y); min.z = Math.min(min.z, position.z);
    max.x = Math.max(max.x, position.x); max.y = Math.max(max.y, position.y); max.z = Math.max(max.z, position.z);
  }
  const size = { x: max.x - min.x, y: max.y - min.y, z: max.z - min.z };
  return { min, max, size, center: { x: min.x + size.x / 2, y: min.y + size.y / 2, z: min.z + size.z / 2 } };
}

export function applyMatrix(mesh: MeshData, matrix: THREE.Matrix4): MeshData {
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
  const reverse = matrix.determinant() < 0;
  return {
    vertices: Object.fromEntries(Object.entries(mesh.vertices).map(([id, vertex]) => {
      const position = new THREE.Vector3(vertex.position.x, vertex.position.y, vertex.position.z).applyMatrix4(matrix);
      const normal = vertex.normal ? new THREE.Vector3(vertex.normal.x, vertex.normal.y, vertex.normal.z).applyNormalMatrix(normalMatrix) : undefined;
      return [id, { ...vertex, position: { x: position.x, y: position.y, z: position.z }, normal: normal ? { x: normal.x, y: normal.y, z: normal.z } : undefined }];
    })),
    faces: Object.fromEntries(Object.entries(mesh.faces).map(([id, face]) => [id, { ...face, vertexIds: reverse ? [...face.vertexIds].reverse() : [...face.vertexIds] }])),
  };
}

export function scaleMesh(mesh: MeshData, scale: Vec3): MeshData {
  return applyMatrix(mesh, new THREE.Matrix4().makeScale(scale.x, scale.y, scale.z));
}

export function resizeMesh(mesh: MeshData, size: Vec3): MeshData {
  const bounds = getMeshBounds(mesh);
  if (!bounds || size.x <= 0 || size.y < 0 || size.z <= 0) throw new Error('Mesh size must be positive.');
  const factor = {
    x: bounds.size.x === 0 ? 1 : size.x / bounds.size.x,
    y: bounds.size.y === 0 ? 1 : size.y / bounds.size.y,
    z: bounds.size.z === 0 ? 1 : size.z / bounds.size.z,
  };
  const matrix = new THREE.Matrix4()
    .makeTranslation(bounds.center.x, bounds.center.y, bounds.center.z)
    .multiply(new THREE.Matrix4().makeScale(factor.x, factor.y, factor.z))
    .multiply(new THREE.Matrix4().makeTranslation(-bounds.center.x, -bounds.center.y, -bounds.center.z));
  return applyMatrix(mesh, matrix);
}

export function faceNormal(mesh: MeshData, face: MeshFace): Vec3 | null {
  if (face.vertexIds.length < 3) return null;
  const a = mesh.vertices[face.vertexIds[0]!]?.position;
  const b = mesh.vertices[face.vertexIds[1]!]?.position;
  const c = mesh.vertices[face.vertexIds[2]!]?.position;
  if (!a || !b || !c) return null;
  const normal = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z).cross(new THREE.Vector3(c.x - a.x, c.y - a.y, c.z - a.z));
  if (normal.lengthSq() < 1e-16) return null;
  normal.normalize(); return { x: normal.x, y: normal.y, z: normal.z };
}

function faceCentroid(mesh: MeshData, face: MeshFace): Vec3 {
  const result = face.vertexIds.reduce((sum, id) => {
    const point = mesh.vertices[id]!.position;
    return { x: sum.x + point.x, y: sum.y + point.y, z: sum.z + point.z };
  }, { x: 0, y: 0, z: 0 });
  const count = face.vertexIds.length;
  return { x: result.x / count, y: result.y / count, z: result.z / count };
}

export function getEdges(mesh: MeshData): MeshEdge[] {
  const entries = new Map<string, MeshEdge>();
  for (const face of Object.values(mesh.faces)) {
    face.vertexIds.forEach((a, index) => {
      const b = face.vertexIds[(index + 1) % face.vertexIds.length]!;
      const id = a < b ? `${a}:${b}` : `${b}:${a}`;
      const existing = entries.get(id);
      if (existing) existing.faceIds.push(face.id);
      else entries.set(id, { id, a: a < b ? a : b, b: a < b ? b : a, faceIds: [face.id] });
    });
  }
  return [...entries.values()];
}

export function selectFaces(mesh: MeshData, selector: FaceSelector): string[] {
  if (Array.isArray(selector)) {
    const missing = selector.filter((id) => !mesh.faces[id]);
    if (missing.length) throw new Error(`Unknown face id(s): ${missing.join(', ')}`);
    return [...new Set(selector)];
  }
  if (selector === 'all') return Object.keys(mesh.faces);
  const direction: Record<Exclude<FaceSelector, string[] | 'all'>, Vec3> = {
    top: { x: 0, y: 1, z: 0 }, bottom: { x: 0, y: -1, z: 0 },
    front: { x: 0, y: 0, z: 1 }, back: { x: 0, y: 0, z: -1 },
    left: { x: -1, y: 0, z: 0 }, right: { x: 1, y: 0, z: 0 },
  };
  const axis = direction[selector];
  const selected = Object.values(mesh.faces).filter((face) => {
    const normal = faceNormal(mesh, face);
    return normal && normal.x * axis.x + normal.y * axis.y + normal.z * axis.z > 0.7;
  }).map((face) => face.id);
  if (!selected.length) throw new Error(`No ${selector} faces found.`);
  return selected;
}

export function selectVertices(mesh: MeshData, selector: VertexSelector): string[] {
  if (selector === 'all') return Object.keys(mesh.vertices);
  const missing = selector.filter((id) => !mesh.vertices[id]);
  if (missing.length) throw new Error(`Unknown vertex id(s): ${missing.join(', ')}`);
  return [...new Set(selector)];
}

export function selectEdges(mesh: MeshData, selector: EdgeSelector | undefined): string[] {
  const edges = getEdges(mesh);
  if (!selector || selector === 'all') return edges.map((edge) => edge.id);
  const known = new Set(edges.map((edge) => edge.id));
  const missing = selector.filter((id) => !known.has(id));
  if (missing.length) throw new Error(`Unknown edge id(s): ${missing.join(', ')}`);
  return [...new Set(selector)];
}

export function removeUnusedVertices(mesh: MeshData): MeshData {
  const used = new Set(Object.values(mesh.faces).flatMap((face) => face.vertexIds));
  return { vertices: Object.fromEntries(Object.entries(mesh.vertices).filter(([id]) => used.has(id))), faces: mesh.faces };
}

export function weldMesh(mesh: MeshData, distance = 0.0001, onlyVertexIds?: string[]): MeshData {
  if (distance < 0 || !Number.isFinite(distance)) throw new Error('Weld distance must be non-negative.');
  const selected = new Set(onlyVertexIds ?? Object.keys(mesh.vertices));
  const representatives: string[] = [];
  const remap = new Map<string, string>();
  for (const vertex of Object.values(mesh.vertices)) {
    if (!selected.has(vertex.id)) { remap.set(vertex.id, vertex.id); continue; }
    const representative = representatives.find((id) => {
      const other = mesh.vertices[id]!.position;
      return Math.hypot(vertex.position.x - other.x, vertex.position.y - other.y, vertex.position.z - other.z) <= distance;
    });
    if (representative) remap.set(vertex.id, representative);
    else { representatives.push(vertex.id); remap.set(vertex.id, vertex.id); }
  }
  const faces: Record<string, MeshFace> = {};
  for (const [id, face] of Object.entries(mesh.faces)) {
    const vertexIds = face.vertexIds.map((vertexId) => remap.get(vertexId) ?? vertexId).filter((entry, index, all) => index === 0 || entry !== all[index - 1]);
    if (vertexIds.length > 2 && vertexIds[0] === vertexIds.at(-1)) vertexIds.pop();
    if (new Set(vertexIds).size >= 3) faces[id] = { ...face, vertexIds };
  }
  return removeUnusedVertices({ vertices: cloneMesh(mesh).vertices, faces });
}

export function mergeSelectedVertices(mesh: MeshData, vertexIds: string[], distance?: number): MeshData {
  if (distance !== undefined) return weldMesh(mesh, distance, vertexIds);
  if (vertexIds.length < 2) return mesh;
  const center = vertexIds.reduce((sum, id) => {
    const p = mesh.vertices[id]!.position; return { x: sum.x + p.x / vertexIds.length, y: sum.y + p.y / vertexIds.length, z: sum.z + p.z / vertexIds.length };
  }, { x: 0, y: 0, z: 0 });
  const next = cloneMesh(mesh); const representative = vertexIds[0]!; next.vertices[representative]!.position = center;
  const selected = new Set(vertexIds);
  for (const face of Object.values(next.faces)) face.vertexIds = face.vertexIds.map((id) => selected.has(id) ? representative : id);
  return weldMesh(next, 0, vertexIds);
}

export function combineMeshes(entries: { mesh: MeshData; matrix: THREE.Matrix4 }[], weldTolerance = 0): MeshData {
  const vertices: Record<string, MeshVertex> = {}; const faces: Record<string, MeshFace> = {};
  entries.forEach((entry, entryIndex) => {
    const transformed = applyMatrix(entry.mesh, entry.matrix); const remap = new Map<string, string>();
    Object.values(transformed.vertices).forEach((vertex) => { const id = `j${entryIndex + 1}_${vertex.id}`; remap.set(vertex.id, id); vertices[id] = { ...vertex, id }; });
    Object.values(transformed.faces).forEach((face) => { const id = `j${entryIndex + 1}_${face.id}`; faces[id] = { ...face, id, vertexIds: face.vertexIds.map((vertexId) => remap.get(vertexId)!) }; });
  });
  const result = { vertices, faces };
  return weldTolerance > 0 ? weldMesh(result, weldTolerance) : result;
}

export function mirrorMesh(mesh: MeshData, axis: Axis, weldTolerance = 0.0001): MeshData {
  const scale = { x: 1, y: 1, z: 1 }; scale[axis] = -1;
  return weldMesh(combineMeshes([{ mesh, matrix: new THREE.Matrix4() }, { mesh, matrix: new THREE.Matrix4().makeScale(scale.x, scale.y, scale.z) }]), weldTolerance);
}

export function bendMesh(mesh: MeshData, axis: Axis, angleDegrees: number, origin: Vec3): MeshData {
  const bounds = getMeshBounds(mesh); if (!bounds || angleDegrees === 0) return mesh;
  const length = bounds.size[axis]; if (length === 0) throw new Error(`Cannot bend a zero-length ${axis} axis.`);
  const angle = THREE.MathUtils.degToRad(angleDegrees); const radius = length / angle;
  const result = cloneMesh(mesh);
  for (const vertex of Object.values(result.vertices)) {
    const p = vertex.position; const along = p[axis] - origin[axis]; const theta = along / radius;
    if (axis === 'x') { const y = p.y - origin.y; p.x = origin.x + Math.sin(theta) * (radius + y); p.y = origin.y + Math.cos(theta) * (radius + y) - radius; }
    else if (axis === 'y') { const x = p.x - origin.x; p.y = origin.y + Math.sin(theta) * (radius + x); p.x = origin.x + Math.cos(theta) * (radius + x) - radius; }
    else { const y = p.y - origin.y; p.z = origin.z + Math.sin(theta) * (radius + y); p.y = origin.y + Math.cos(theta) * (radius + y) - radius; }
    vertex.normal = undefined;
  }
  return result;
}

export function transformVertices(mesh: MeshData, vertexIds: string[], translate?: Vec3Tuple, rotate?: Vec3Tuple, scale?: Vec3Tuple): MeshData {
  if (!vertexIds.length) return mesh;
  const result = cloneMesh(mesh); const selected = vertexIds.map((id) => result.vertices[id]!);
  const center = selected.reduce((sum, vertex) => ({ x: sum.x + vertex.position.x / selected.length, y: sum.y + vertex.position.y / selected.length, z: sum.z + vertex.position.z / selected.length }), { x: 0, y: 0, z: 0 });
  const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(rotate ?? [0, 0, 0]).map(THREE.MathUtils.degToRad) as Vec3Tuple));
  const scaling = scale ?? [1, 1, 1]; const translation = translate ?? [0, 0, 0];
  for (const vertex of selected) {
    const point = new THREE.Vector3(vertex.position.x - center.x, vertex.position.y - center.y, vertex.position.z - center.z);
    point.multiply(new THREE.Vector3(...scaling)).applyQuaternion(quaternion).add(new THREE.Vector3(center.x + translation[0], center.y + translation[1], center.z + translation[2]));
    vertex.position = { x: point.x, y: point.y, z: point.z }; vertex.normal = undefined;
  }
  return result;
}

export function extrudeFaces(mesh: MeshData, faceIds: string[], distance: number, rotate?: Vec3Tuple): MeshData {
  if (distance === 0) return mesh;
  const result = cloneMesh(mesh);
  for (const faceId of faceIds) {
    const sourceFace = result.faces[faceId]!; const normal = faceNormal(result, sourceFace);
    if (!normal) continue;
    const sourceIds = [...sourceFace.vertexIds];
    const extrudedIds = sourceIds.map((sourceId) => {
      const source = result.vertices[sourceId]!; const id = nextId(result.vertices, 'v');
      result.vertices[id] = { ...source, id, normal: undefined, position: { x: source.position.x + normal.x * distance, y: source.position.y + normal.y * distance, z: source.position.z + normal.z * distance } }; return id;
    });
    sourceFace.vertexIds = extrudedIds;
    sourceIds.forEach((sourceId, index) => { const next = (index + 1) % sourceIds.length; const id = nextId(result.faces, 'f'); result.faces[id] = { id, materialId: sourceFace.materialId, vertexIds: [sourceId, sourceIds[next]!, extrudedIds[next]!, extrudedIds[index]!] }; });
  }
  return rotate ? transformVertices(result, faceIds.flatMap((id) => result.faces[id]?.vertexIds ?? []), undefined, rotate) : result;
}

export function insetFaces(mesh: MeshData, faceIds: string[], factor: number): MeshData {
  const result = cloneMesh(mesh);
  for (const faceId of faceIds) {
    const sourceFace = result.faces[faceId]!; const center = faceCentroid(result, sourceFace); const sourceIds = [...sourceFace.vertexIds];
    const insetIds = sourceIds.map((sourceId) => { const source = result.vertices[sourceId]!; const id = nextId(result.vertices, 'v'); result.vertices[id] = { ...source, id, normal: undefined, position: { x: source.position.x + (center.x - source.position.x) * factor, y: source.position.y + (center.y - source.position.y) * factor, z: source.position.z + (center.z - source.position.z) * factor } }; return id; });
    sourceFace.vertexIds = insetIds;
    sourceIds.forEach((sourceId, index) => { const next = (index + 1) % sourceIds.length; const id = nextId(result.faces, 'f'); result.faces[id] = { id, materialId: sourceFace.materialId, vertexIds: [sourceId, sourceIds[next]!, insetIds[next]!, insetIds[index]!] }; });
  }
  return result;
}

export function deleteFaces(mesh: MeshData, faceIds: string[]): MeshData {
  const selected = new Set(faceIds); return removeUnusedVertices({ vertices: cloneMesh(mesh).vertices, faces: Object.fromEntries(Object.entries(mesh.faces).filter(([id]) => !selected.has(id)).map(([id, face]) => [id, { ...face, vertexIds: [...face.vertexIds] }])) });
}

export function subdivideEdges(mesh: MeshData, edgeIds: string[]): MeshData {
  const requested = new Set(edgeIds); const edges = getEdges(mesh).filter((edge) => requested.has(edge.id));
  const result = cloneMesh(mesh); const midpointByEdge = new Map<string, string>();
  for (const edge of edges) {
    const a = result.vertices[edge.a]!; const b = result.vertices[edge.b]!; const id = nextId(result.vertices, 'v');
    result.vertices[id] = { id, position: { x: (a.position.x + b.position.x) / 2, y: (a.position.y + b.position.y) / 2, z: (a.position.z + b.position.z) / 2 } }; midpointByEdge.set(edge.id, id);
  }
  for (const face of Object.values(result.faces)) face.vertexIds = face.vertexIds.flatMap((a, index) => { const b = face.vertexIds[(index + 1) % face.vertexIds.length]!; const id = a < b ? `${a}:${b}` : `${b}:${a}`; const midpoint = midpointByEdge.get(id); return midpoint ? [a, midpoint] : [a]; });
  return result;
}

export function bevelMesh(mesh: MeshData, width: number): MeshData {
  const resultVertices: Record<string, MeshVertex> = {}; const resultFaces: Record<string, MeshFace> = {};
  const insetByFaceVertex = new Map<string, string>(); const incident = new Map<string, { insetId: string; faceId: string }[]>();
  for (const face of Object.values(mesh.faces)) {
    const center = faceCentroid(mesh, face); const insetIds: string[] = [];
    face.vertexIds.forEach((vertexId, index) => {
      const vertex = mesh.vertices[vertexId]!; const previous = mesh.vertices[face.vertexIds[(index - 1 + face.vertexIds.length) % face.vertexIds.length]!]!; const next = mesh.vertices[face.vertexIds[(index + 1) % face.vertexIds.length]!]!;
      const minEdge = Math.min(Math.hypot(vertex.position.x - previous.position.x, vertex.position.y - previous.position.y, vertex.position.z - previous.position.z), Math.hypot(vertex.position.x - next.position.x, vertex.position.y - next.position.y, vertex.position.z - next.position.z));
      const factor = Math.min(0.49, width / Math.max(minEdge, 1e-9)); const id = `b_${face.id}_${vertexId}`;
      resultVertices[id] = { ...vertex, id, normal: undefined, position: { x: vertex.position.x + (center.x - vertex.position.x) * factor, y: vertex.position.y + (center.y - vertex.position.y) * factor, z: vertex.position.z + (center.z - vertex.position.z) * factor } };
      insetByFaceVertex.set(`${face.id}:${vertexId}`, id); insetIds.push(id);
      const list = incident.get(vertexId) ?? []; list.push({ insetId: id, faceId: face.id }); incident.set(vertexId, list);
    });
    resultFaces[`b_face_${face.id}`] = { id: `b_face_${face.id}`, materialId: face.materialId, vertexIds: insetIds };
  }
  for (const edge of getEdges(mesh)) {
    if (edge.faceIds.length !== 2) continue;
    const first = mesh.faces[edge.faceIds[0]!]!; const second = mesh.faces[edge.faceIds[1]!]!;
    const firstAIndex = first.vertexIds.indexOf(edge.a); const firstBIndex = first.vertexIds.indexOf(edge.b);
    const directedA = (firstAIndex + 1) % first.vertexIds.length === firstBIndex ? edge.a : edge.b; const directedB = directedA === edge.a ? edge.b : edge.a;
    const ids = [insetByFaceVertex.get(`${first.id}:${directedA}`), insetByFaceVertex.get(`${first.id}:${directedB}`), insetByFaceVertex.get(`${second.id}:${directedB}`), insetByFaceVertex.get(`${second.id}:${directedA}`)];
    if (ids.every(Boolean)) { const id = `b_edge_${edge.id.replace(':', '_')}`; resultFaces[id] = { id, materialId: first.materialId, vertexIds: ids as string[] }; }
  }
  for (const [vertexId, entries] of incident) {
    if (entries.length < 3) continue;
    const origin = mesh.vertices[vertexId]!.position;
    const outward = entries.reduce((sum, entry) => { const normal = faceNormal(mesh, mesh.faces[entry.faceId]!); return normal ? sum.add(new THREE.Vector3(normal.x, normal.y, normal.z)) : sum; }, new THREE.Vector3()).normalize();
    const reference = Math.abs(outward.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0); const basisX = reference.clone().cross(outward).normalize(); const basisY = outward.clone().cross(basisX).normalize();
    const sorted = [...entries].sort((a, b) => { const pa = resultVertices[a.insetId]!.position; const pb = resultVertices[b.insetId]!.position; const va = new THREE.Vector3(pa.x - origin.x, pa.y - origin.y, pa.z - origin.z); const vb = new THREE.Vector3(pb.x - origin.x, pb.y - origin.y, pb.z - origin.z); return Math.atan2(va.dot(basisY), va.dot(basisX)) - Math.atan2(vb.dot(basisY), vb.dot(basisX)); });
    const id = `b_vertex_${vertexId}`; const vertexIds = sorted.map((entry) => entry.insetId); const testFace: MeshFace = { id, materialId: mesh.faces[entries[0]!.faceId]!.materialId, vertexIds };
    const normal = faceNormal({ vertices: resultVertices, faces: {} }, testFace); if (normal && normal.x * outward.x + normal.y * outward.y + normal.z * outward.z < 0) vertexIds.reverse(); resultFaces[id] = { ...testFace, vertexIds };
  }
  return { vertices: resultVertices, faces: resultFaces };
}

export function degreesVector(value: Vec3Tuple | undefined): Vec3 { return tupleToVec3(value); }
