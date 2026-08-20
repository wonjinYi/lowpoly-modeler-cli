import * as THREE from 'three';
import type { GroupNode, MaterialData, MeshData, MeshNode, RecipeMetadata, SceneDocument, SceneNode, Shading, Transform, Vec3 } from './types.js';
import { ROOT_NODE_ID, UNIT_TRANSFORM } from './types.js';
import { applyMatrix, getMeshBounds } from './geometry/operations.js';

function cloneTransform(transform: Transform): Transform {
  return { position: { ...transform.position }, rotation: { ...transform.rotation }, scale: { ...transform.scale } };
}

export function createDocument(name: string, metadata?: RecipeMetadata): SceneDocument {
  const root: GroupNode = { id: ROOT_NODE_ID, name: 'asset_root', parentId: null, hidden: false, type: 'group', transform: cloneTransform(UNIT_TRANSFORM) };
  return {
    version: 1,
    name,
    rootId: ROOT_NODE_ID,
    nodes: { [ROOT_NODE_ID]: root },
    materials: {},
    metadata: {
      forwardConfirmed: metadata?.forward === '+Z',
      groundReferenceY: metadata?.groundY ?? 0,
      groundContactTolerance: metadata?.groundTolerance ?? 0.001,
      sourceHadTextures: false,
    },
  };
}

export function nextNodeId(document: SceneDocument, prefix: string): string {
  let index = 1; while (document.nodes[`${prefix}-${index}`]) index += 1; return `${prefix}-${index}`;
}

export function nextMaterialId(document: SceneDocument): string {
  let index = 1; while (document.materials[`material-${index}`]) index += 1; return `material-${index}`;
}

export function createMaterial(document: SceneDocument, name: string, options: { color?: string; roughness?: number; metalness?: number; opacity?: number; shading?: Shading }): MaterialData {
  const id = nextMaterialId(document);
  const material: MaterialData = { id, name, color: options.color ?? '#7fcf98', roughness: options.roughness ?? 0.82, metalness: options.metalness ?? 0, opacity: options.opacity ?? 1, shading: options.shading ?? 'flat' };
  document.materials[id] = material; return material;
}

export function assertUniqueName(document: SceneDocument, name: string, exceptId?: string): void {
  const matching = Object.values(document.nodes).filter((node) => node.name === name && node.id !== exceptId);
  if (matching.length) throw new Error(`An object named "${name}" already exists.`);
}

export function findNode(document: SceneDocument, reference: string): SceneNode {
  const direct = document.nodes[reference]; if (direct) return direct;
  const matches = Object.values(document.nodes).filter((node) => node.name === reference);
  if (matches.length === 0) throw new Error(`Object "${reference}" was not found.`);
  if (matches.length > 1) throw new Error(`Object name "${reference}" is ambiguous; use its id.`);
  return matches[0]!;
}

export function findMesh(document: SceneDocument, reference: string): MeshNode {
  const node = findNode(document, reference); if (node.type !== 'mesh') throw new Error(`Object "${reference}" is not a mesh.`); return node;
}

export function addGroup(document: SceneDocument, name: string, parentReference?: string, position: Vec3 = { x: 0, y: 0, z: 0 }, rotation: Vec3 = { x: 0, y: 0, z: 0 }): GroupNode {
  assertUniqueName(document, name); const parent = parentReference ? findNode(document, parentReference) : document.nodes[document.rootId]!;
  const node: GroupNode = { id: nextNodeId(document, 'group'), name, parentId: parent.id, hidden: false, type: 'group', transform: { position: { ...position }, rotation: { ...rotation }, scale: { x: 1, y: 1, z: 1 } } };
  document.nodes[node.id] = node; return node;
}

export function addMesh(document: SceneDocument, name: string, mesh: MeshData, parentReference?: string, position: Vec3 = { x: 0, y: 0, z: 0 }, rotation: Vec3 = { x: 0, y: 0, z: 0 }): MeshNode {
  assertUniqueName(document, name); const parent = parentReference ? findNode(document, parentReference) : document.nodes[document.rootId]!;
  const node: MeshNode = { id: nextNodeId(document, 'mesh'), name, parentId: parent.id, hidden: false, type: 'mesh', mesh, transform: { position: { ...position }, rotation: { ...rotation }, scale: { x: 1, y: 1, z: 1 } } };
  document.nodes[node.id] = node; return node;
}

export function localMatrix(node: SceneNode): THREE.Matrix4 {
  return new THREE.Matrix4().compose(new THREE.Vector3(node.transform.position.x, node.transform.position.y, node.transform.position.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(node.transform.rotation.x, node.transform.rotation.y, node.transform.rotation.z)), new THREE.Vector3(node.transform.scale.x, node.transform.scale.y, node.transform.scale.z));
}

export function worldMatrix(document: SceneDocument, nodeId: string): THREE.Matrix4 {
  const chain: SceneNode[] = []; const seen = new Set<string>(); let current = document.nodes[nodeId];
  while (current) { if (seen.has(current.id)) throw new Error(`Hierarchy cycle at "${current.name}".`); seen.add(current.id); chain.unshift(current); current = current.parentId ? document.nodes[current.parentId] : undefined; }
  return chain.reduce((matrix, node) => matrix.multiply(localMatrix(node)), new THREE.Matrix4());
}

export function descendants(document: SceneDocument, nodeId: string): SceneNode[] {
  return Object.values(document.nodes).filter((node) => node.parentId === nodeId).flatMap((node) => [node, ...descendants(document, node.id)]);
}

export function removeNode(document: SceneDocument, reference: string): void {
  const node = findNode(document, reference); if (node.id === document.rootId) throw new Error('The asset root cannot be deleted.');
  for (const entry of [node, ...descendants(document, node.id)]) delete document.nodes[entry.id];
  pruneMaterials(document);
}

export function pruneMaterials(document: SceneDocument): void {
  const used = new Set(Object.values(document.nodes).flatMap((node) => node.type === 'mesh' ? Object.values(node.mesh.faces).map((face) => face.materialId) : []));
  for (const id of Object.keys(document.materials)) if (!used.has(id)) delete document.materials[id];
}

export function renameNode(document: SceneDocument, reference: string, name: string): void {
  const node = findNode(document, reference); assertUniqueName(document, name, node.id); node.name = name;
}

export function parentNode(document: SceneDocument, reference: string, parentReference: string): void {
  const node = findNode(document, reference); const parent = findNode(document, parentReference);
  if (node.id === document.rootId || parent.id === node.id || descendants(document, node.id).some((entry) => entry.id === parent.id)) throw new Error('Invalid parent operation would create a hierarchy cycle.');
  node.parentId = parent.id;
}

export function worldBounds(document: SceneDocument, reference = document.rootId): { min: Vec3; max: Vec3 } | null {
  const root = findNode(document, reference); const included = [root, ...descendants(document, root.id)].filter((node): node is MeshNode => node.type === 'mesh' && !node.hidden);
  let min: Vec3 | null = null; let max: Vec3 | null = null;
  for (const node of included) {
    const transformed = applyMatrix(node.mesh, worldMatrix(document, node.id)); const bounds = getMeshBounds(transformed); if (!bounds) continue;
    if (!min || !max) { min = { ...bounds.min }; max = { ...bounds.max }; }
    else { min.x = Math.min(min.x, bounds.min.x); min.y = Math.min(min.y, bounds.min.y); min.z = Math.min(min.z, bounds.min.z); max.x = Math.max(max.x, bounds.max.x); max.y = Math.max(max.y, bounds.max.y); max.z = Math.max(max.z, bounds.max.z); }
  }
  return min && max ? { min, max } : null;
}

export function groundNode(document: SceneDocument, reference: string | undefined, y: number): void {
  const node = reference ? findNode(document, reference) : document.nodes[document.rootId]!; const bounds = worldBounds(document, node.id);
  if (!bounds) throw new Error(`Object "${node.name}" has no mesh to ground.`);
  const delta = y - bounds.min.y;
  if (node.id === document.rootId) {
    for (const child of Object.values(document.nodes).filter((entry) => entry.parentId === node.id)) child.transform.position.y += delta;
  } else node.transform.position.y += delta;
}

export function bakeNodeScale(node: MeshNode, scale: Vec3): void {
  if ([scale.x, scale.y, scale.z].some((value) => !Number.isFinite(value) || value === 0)) throw new Error('Scale components must be finite and non-zero.');
  node.mesh = applyMatrix(node.mesh, new THREE.Matrix4().makeScale(scale.x, scale.y, scale.z)); node.transform.scale = { x: 1, y: 1, z: 1 };
}

export function bakeDocumentWorldTransforms(document: SceneDocument): SceneDocument {
  const clone = structuredClone(document) as SceneDocument;
  for (const node of Object.values(clone.nodes)) {
    if (node.type === 'mesh') { node.mesh = applyMatrix(node.mesh, worldMatrix(document, node.id)); node.transform = cloneTransform(UNIT_TRANSFORM); }
    else if (node.id !== clone.rootId) node.transform = cloneTransform(UNIT_TRANSFORM);
  }
  clone.nodes[clone.rootId]!.transform = cloneTransform(UNIT_TRANSFORM);
  return clone;
}
