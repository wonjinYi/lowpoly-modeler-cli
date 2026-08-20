import type { BooleanOperation, MeshData } from '../types.js';

interface ManifoldMesh { triVerts: Uint32Array; vertProperties: Float32Array }
interface ManifoldValue { add(other: ManifoldValue): ManifoldValue; delete(): void; getMesh(): ManifoldMesh; intersect(other: ManifoldValue): ManifoldValue; subtract(other: ManifoldValue): ManifoldValue }
interface ManifoldApi { Manifold: { ofMesh(mesh: unknown): ManifoldValue }; Mesh: new (options: { numProp: number; triVerts: Uint32Array; vertProperties: Float32Array }) => unknown; setup(): void }
let apiPromise: Promise<ManifoldApi> | undefined;

async function api(): Promise<ManifoldApi> {
  apiPromise ??= (async () => { const module = await import('manifold-3d') as unknown as { default: () => Promise<ManifoldApi> }; const value = await module.default(); value.setup(); return value; })();
  return apiPromise;
}

function toManifold(runtime: ManifoldApi, mesh: MeshData): ManifoldValue {
  const ids = Object.keys(mesh.vertices); const index = new Map(ids.map((id, entry) => [id, entry]));
  const vertProperties = new Float32Array(ids.flatMap((id) => { const p = mesh.vertices[id]!.position; return [p.x, p.y, p.z]; }));
  const triangles: number[] = [];
  for (const face of Object.values(mesh.faces)) for (let corner = 1; corner < face.vertexIds.length - 1; corner += 1) triangles.push(index.get(face.vertexIds[0]!)!, index.get(face.vertexIds[corner]!)!, index.get(face.vertexIds[corner + 1]!)!);
  return runtime.Manifold.ofMesh(new runtime.Mesh({ numProp: 3, triVerts: new Uint32Array(triangles), vertProperties }));
}

function fromManifold(output: ManifoldMesh, materialId: string): MeshData {
  if (output.triVerts.length === 0) throw new Error('Boolean produced an empty mesh.');
  const count = output.vertProperties.length / 3;
  const vertices = Object.fromEntries(Array.from({ length: count }, (_, index) => { const id = `bv${index + 1}`; return [id, { id, position: { x: output.vertProperties[index * 3]!, y: output.vertProperties[index * 3 + 1]!, z: output.vertProperties[index * 3 + 2]! } }]; }));
  const faces = Object.fromEntries(Array.from({ length: output.triVerts.length / 3 }, (_, index) => { const id = `bf${index + 1}`; return [id, { id, materialId, vertexIds: [`bv${output.triVerts[index * 3]! + 1}`, `bv${output.triVerts[index * 3 + 1]! + 1}`, `bv${output.triVerts[index * 3 + 2]! + 1}`] }]; }));
  return { vertices, faces };
}

export async function booleanMesh(operation: BooleanOperation, subjectMesh: MeshData, cutterMesh: MeshData, materialId: string): Promise<MeshData> {
  const runtime = await api(); const subject = toManifold(runtime, subjectMesh); const cutter = toManifold(runtime, cutterMesh); let result: ManifoldValue | undefined;
  try { result = operation === 'difference' ? subject.subtract(cutter) : operation === 'intersection' ? subject.intersect(cutter) : subject.add(cutter); return fromManifold(result.getMesh(), materialId); }
  finally { result?.delete(); cutter.delete(); subject.delete(); }
}
