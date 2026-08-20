import * as THREE from 'three';
import type { MeshData, MeshFace, MeshVertex, Vec3, Vec3Tuple } from '../types.js';

interface VertexInput { position: Vec3; uv?: { u: number; v: number } }

function buildMesh(vertices: VertexInput[], faces: number[][], materialId: string): MeshData {
  const resultVertices: Record<string, MeshVertex> = {};
  const ids = vertices.map((vertex, index) => {
    const id = `v${index + 1}`;
    resultVertices[id] = { id, position: { ...vertex.position }, uv: vertex.uv ? { ...vertex.uv } : undefined };
    return id;
  });
  const resultFaces: Record<string, MeshFace> = {};
  faces.forEach((face, index) => {
    const id = `f${index + 1}`;
    resultFaces[id] = { id, materialId, vertexIds: face.map((entry) => ids[entry]!) };
  });
  return { vertices: resultVertices, faces: resultFaces };
}

export function createCube(materialId: string): MeshData {
  const h = 0.5;
  return buildMesh([
    { position: { x: -h, y: -h, z: -h } }, { position: { x: h, y: -h, z: -h } },
    { position: { x: h, y: h, z: -h } }, { position: { x: -h, y: h, z: -h } },
    { position: { x: -h, y: -h, z: h } }, { position: { x: h, y: -h, z: h } },
    { position: { x: h, y: h, z: h } }, { position: { x: -h, y: h, z: h } },
  ], [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]], materialId);
}

export function createPlane(materialId: string): MeshData {
  return buildMesh([
    { position: { x: -0.5, y: 0, z: -0.5 }, uv: { u: 0, v: 0 } },
    { position: { x: 0.5, y: 0, z: -0.5 }, uv: { u: 1, v: 0 } },
    { position: { x: 0.5, y: 0, z: 0.5 }, uv: { u: 1, v: 1 } },
    { position: { x: -0.5, y: 0, z: 0.5 }, uv: { u: 0, v: 1 } },
  ], [[0, 3, 2, 1]], materialId);
}

export function createCylinder(materialId: string, segments = 8): MeshData {
  const vertices: VertexInput[] = [];
  const faces: number[][] = [];
  for (const y of [0.5, -0.5]) {
    for (let index = 0; index < segments; index += 1) {
      const angle = index / segments * Math.PI * 2;
      vertices.push({ position: { x: Math.cos(angle) * 0.5, y, z: Math.sin(angle) * 0.5 } });
    }
  }
  faces.push(Array.from({ length: segments }, (_, index) => index).reverse());
  faces.push(Array.from({ length: segments }, (_, index) => segments + index));
  for (let index = 0; index < segments; index += 1) {
    const next = (index + 1) % segments;
    faces.push([segments + index, index, next, segments + next]);
  }
  return buildMesh(vertices, faces, materialId);
}

export function createCone(materialId: string, segments = 8): MeshData {
  const vertices: VertexInput[] = [{ position: { x: 0, y: 0.5, z: 0 } }];
  const faces: number[][] = [];
  for (let index = 0; index < segments; index += 1) {
    const angle = index / segments * Math.PI * 2;
    vertices.push({ position: { x: Math.cos(angle) * 0.5, y: -0.5, z: Math.sin(angle) * 0.5 } });
  }
  faces.push(Array.from({ length: segments }, (_, index) => index + 1));
  for (let index = 0; index < segments; index += 1) faces.push([index + 1, 0, (index + 1) % segments + 1]);
  return buildMesh(vertices, faces, materialId);
}

export function createSphere(materialId: string, longitude = 12, latitude = 8): MeshData {
  const vertices: VertexInput[] = [{ position: { x: 0, y: 0.5, z: 0 } }];
  const faces: number[][] = [];
  for (let lat = 1; lat < latitude; lat += 1) {
    const theta = lat / latitude * Math.PI;
    for (let lon = 0; lon < longitude; lon += 1) {
      const phi = lon / longitude * Math.PI * 2;
      vertices.push({ position: { x: Math.cos(phi) * Math.sin(theta) * 0.5, y: Math.cos(theta) * 0.5, z: Math.sin(phi) * Math.sin(theta) * 0.5 } });
    }
  }
  const bottom = vertices.length;
  vertices.push({ position: { x: 0, y: -0.5, z: 0 } });
  const ring = (lat: number, lon: number): number => 1 + (lat - 1) * longitude + lon % longitude;
  for (let lon = 0; lon < longitude; lon += 1) faces.push([0, ring(1, lon + 1), ring(1, lon)]);
  for (let lat = 1; lat < latitude - 1; lat += 1) for (let lon = 0; lon < longitude; lon += 1) faces.push([ring(lat, lon), ring(lat, lon + 1), ring(lat + 1, lon + 1), ring(lat + 1, lon)]);
  for (let lon = 0; lon < longitude; lon += 1) faces.push([ring(latitude - 1, lon), ring(latitude - 1, lon + 1), bottom]);
  return buildMesh(vertices, faces, materialId);
}

function normalizedHalf(value: Vec3): Vec3 {
  const length = Math.hypot(value.x, value.y, value.z);
  return { x: value.x / length * 0.5, y: value.y / length * 0.5, z: value.z / length * 0.5 };
}

export function createIcosphere(materialId: string, subdivisions = 2): MeshData {
  const phi = (1 + Math.sqrt(5)) / 2;
  let vertices: Vec3[] = [
    [-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0], [0, -1, phi], [0, 1, phi],
    [0, -1, -phi], [0, 1, -phi], [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1],
  ].map(([x, y, z]) => normalizedHalf({ x: x!, y: y!, z: z! }));
  let faces = [[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
  for (let level = 0; level < subdivisions; level += 1) {
    const cache = new Map<string, number>();
    const midpoint = (a: number, b: number): number => {
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      const known = cache.get(key); if (known !== undefined) return known;
      const left = vertices[a]!; const right = vertices[b]!;
      const index = vertices.length;
      vertices.push(normalizedHalf({ x: (left.x + right.x) / 2, y: (left.y + right.y) / 2, z: (left.z + right.z) / 2 }));
      cache.set(key, index); return index;
    };
    faces = faces.flatMap(([a, b, c]) => { const ab = midpoint(a!, b!); const bc = midpoint(b!, c!); const ca = midpoint(c!, a!); return [[a!,ab,ca],[b!,bc,ab],[c!,ca,bc],[ab,bc,ca]]; });
  }
  return buildMesh(vertices.map((position) => ({ position })), faces, materialId);
}

export function createTube(materialId: string, path: Vec3Tuple[], radius: number, segments = 8, capped = true): MeshData {
  const vertices: VertexInput[] = [];
  const faces: number[][] = [];
  const up = new THREE.Vector3(0, 0, 1);
  path.forEach((point, index) => {
    const current = new THREE.Vector3(...point);
    const previous = new THREE.Vector3(...path[Math.max(0, index - 1)]!);
    const next = new THREE.Vector3(...path[Math.min(path.length - 1, index + 1)]!);
    const tangent = next.sub(previous).normalize();
    const quaternion = new THREE.Quaternion().setFromUnitVectors(up, tangent);
    for (let segment = 0; segment < segments; segment += 1) {
      const angle = segment / segments * Math.PI * 2;
      const offset = new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0).applyQuaternion(quaternion);
      vertices.push({ position: { x: current.x + offset.x, y: current.y + offset.y, z: current.z + offset.z } });
    }
  });
  for (let ring = 0; ring < path.length - 1; ring += 1) for (let segment = 0; segment < segments; segment += 1) {
    const nextSegment = (segment + 1) % segments;
    faces.push([ring * segments + segment, (ring + 1) * segments + segment, (ring + 1) * segments + nextSegment, ring * segments + nextSegment]);
  }
  if (capped) {
    faces.push(Array.from({ length: segments }, (_, index) => index).reverse());
    faces.push(Array.from({ length: segments }, (_, index) => (path.length - 1) * segments + index));
  }
  return buildMesh(vertices, faces, materialId);
}
