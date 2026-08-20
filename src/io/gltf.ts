import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { bakeDocumentWorldTransforms, createDocument, nextMaterialId, nextNodeId } from '../document.js';
import type { MaterialData, MeshData, MeshFace, MeshVertex, SceneDocument, SceneNode, Transform } from '../types.js';
import { ROOT_NODE_ID } from '../types.js';
import { mergeCoplanarFaces, weldMesh } from '../geometry/operations.js';

export interface GlbPayloadInfo {
  byteLength: number;
  imageCount: number;
  textureCount: number;
  meshCount: number;
  nodeCount: number;
  materialCount: number;
  vertexCount: number;
  triangleCount: number;
}

interface GltfJson {
  images?: unknown[];
  textures?: unknown[];
  meshes?: { primitives?: { attributes?: { POSITION?: number }; indices?: number; mode?: number }[] }[];
  nodes?: unknown[];
  materials?: unknown[];
  accessors?: { count?: number }[];
}

class NodeFileReader {
  result: string | ArrayBuffer | null = null;
  error: Error | null = null;
  onloadend: ((event: { target: NodeFileReader }) => void) | null = null;
  onerror: ((event: { target: NodeFileReader }) => void) | null = null;
  readAsArrayBuffer(blob: Blob): void { void blob.arrayBuffer().then((result) => { this.result = result; this.onloadend?.({ target: this }); }, (error: unknown) => { this.error = error instanceof Error ? error : new Error(String(error)); this.onerror?.({ target: this }); }); }
  readAsDataURL(blob: Blob): void { void blob.arrayBuffer().then((result) => { this.result = `data:${blob.type};base64,${Buffer.from(result).toString('base64')}`; this.onloadend?.({ target: this }); }); }
}

function ensureNodeFileReader(): void {
  const globals = globalThis as unknown as { FileReader?: unknown };
  globals.FileReader ??= NodeFileReader;
}

function readGlbJson(arrayBuffer: ArrayBuffer): GltfJson {
  const view = new DataView(arrayBuffer);
  if (arrayBuffer.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2) throw new Error('Input is not a valid GLB 2.0 file.');
  if (view.getUint32(8, true) !== arrayBuffer.byteLength) throw new Error('GLB header length does not match the file size.');
  let offset = 12;
  while (offset + 8 <= arrayBuffer.byteLength) {
    const length = view.getUint32(offset, true); const type = view.getUint32(offset + 4, true); offset += 8;
    if (offset + length > arrayBuffer.byteLength) throw new Error('GLB contains a truncated chunk.');
    if (type === 0x4e4f534a) {
      const text = new TextDecoder().decode(new Uint8Array(arrayBuffer, offset, length)).replace(/[\0 ]+$/g, '');
      return JSON.parse(text) as GltfJson;
    }
    offset += length;
  }
  throw new Error('GLB does not contain a JSON chunk.');
}

export function inspectGlbPayload(arrayBuffer: ArrayBuffer): GlbPayloadInfo {
  const json = readGlbJson(arrayBuffer);
  const primitives = (json.meshes ?? []).flatMap((mesh) => mesh.primitives ?? []);
  const vertexCount = primitives.reduce((sum, primitive) => sum + (json.accessors?.[primitive.attributes?.POSITION ?? -1]?.count ?? 0), 0);
  const triangleCount = primitives.reduce((sum, primitive) => {
    if (primitive.mode !== undefined && primitive.mode !== 4) return sum;
    const count = primitive.indices !== undefined
      ? json.accessors?.[primitive.indices]?.count ?? 0
      : json.accessors?.[primitive.attributes?.POSITION ?? -1]?.count ?? 0;
    return sum + Math.floor(count / 3);
  }, 0);
  return { byteLength: arrayBuffer.byteLength, imageCount: json.images?.length ?? 0, textureCount: json.textures?.length ?? 0, meshCount: json.meshes?.length ?? 0, nodeCount: json.nodes?.length ?? 0, materialCount: json.materials?.length ?? 0, vertexCount, triangleCount };
}

function toTransform(object: THREE.Object3D): Transform {
  return { position: { x: object.position.x, y: object.position.y, z: object.position.z }, rotation: { x: object.rotation.x, y: object.rotation.y, z: object.rotation.z }, scale: { x: object.scale.x, y: object.scale.y, z: object.scale.z } };
}

function applyTransform(object: THREE.Object3D, transform: Transform): void {
  object.position.set(transform.position.x, transform.position.y, transform.position.z); object.rotation.set(transform.rotation.x, transform.rotation.y, transform.rotation.z); object.scale.set(transform.scale.x, transform.scale.y, transform.scale.z);
}

function materialFromThree(document: SceneDocument, material: THREE.Material, known: Map<THREE.Material, string>): string {
  const existing = known.get(material); if (existing) return existing;
  const standard = material as THREE.MeshStandardMaterial; const id = nextMaterialId(document);
  const shading = material.userData.lowpolyShading === 'flat' || standard.flatShading ? 'flat' : 'smooth';
  const entry: MaterialData = { id, name: material.name || id, color: standard.color?.isColor ? `#${standard.color.getHexString()}` : '#b8c8c1', roughness: Number.isFinite(standard.roughness) ? standard.roughness : 0.82, metalness: Number.isFinite(standard.metalness) ? standard.metalness : 0, opacity: Number.isFinite(material.opacity) ? material.opacity : 1, shading };
  document.materials[id] = entry; known.set(material, id); return id;
}

function geometryToMeshData(document: SceneDocument, geometry: THREE.BufferGeometry, sourceMaterials: THREE.Material | THREE.Material[], knownMaterials: Map<THREE.Material, string>, prefix: string): MeshData {
  const position = geometry.getAttribute('position'); if (!position) throw new Error(`Mesh "${prefix}" has no POSITION attribute.`);
  const normal = geometry.getAttribute('normal'); const uv = geometry.getAttribute('uv'); const color = geometry.getAttribute('color');
  const vertices: Record<string, MeshVertex> = {};
  for (let index = 0; index < position.count; index += 1) { const id = `${prefix}_v${index + 1}`; vertices[id] = { id, position: { x: position.getX(index), y: position.getY(index), z: position.getZ(index) }, normal: normal ? { x: normal.getX(index), y: normal.getY(index), z: normal.getZ(index) } : undefined, uv: uv ? { u: uv.getX(index), v: uv.getY(index) } : undefined, color: color ? { r: color.getX(index), g: color.getY(index), b: color.getZ(index) } : undefined }; }
  const materials = Array.isArray(sourceMaterials) ? sourceMaterials : [sourceMaterials];
  const indexAttribute = geometry.getIndex(); const indexCount = indexAttribute?.count ?? position.count; const faces: Record<string, MeshFace> = {};
  for (let offset = 0; offset + 2 < indexCount; offset += 3) {
    const indexes = [0, 1, 2].map((corner) => indexAttribute ? indexAttribute.getX(offset + corner) : offset + corner);
    const group = geometry.groups.find((entry) => offset >= entry.start && offset < entry.start + entry.count); const sourceMaterial = materials[group?.materialIndex ?? 0] ?? materials[0];
    if (!sourceMaterial) throw new Error(`Mesh "${prefix}" has no material.`);
    const id = `${prefix}_f${offset / 3 + 1}`; faces[id] = { id, materialId: materialFromThree(document, sourceMaterial, knownMaterials), vertexIds: indexes.map((entry) => `${prefix}_v${entry + 1}`) };
  }
  // Flat-shaded GLBs duplicate corners to store hard normals. Rejoin only exact
  // coincident positions so imported geometry remains editable; export will
  // duplicate the corners again when its material requests flat shading.
  return mergeCoplanarFaces(weldMesh({ vertices, faces }, 0));
}

function objectName(object: THREE.Object3D, fallback: string): string { return object.name.trim() || fallback; }

export async function importGlb(arrayBuffer: ArrayBuffer, name = 'imported-asset'): Promise<SceneDocument> {
  const payload = inspectGlbPayload(arrayBuffer);
  if (payload.imageCount || payload.textureCount) throw new Error(`Textured GLB input is not supported (${payload.textureCount} texture(s), ${payload.imageCount} image(s)). Remove textures before editing.`);
  const loader = new GLTFLoader(); const gltf = await loader.parseAsync(arrayBuffer, '');
  const document = createDocument(name); const knownMaterials = new Map<THREE.Material, string>();
  const rootCandidate = gltf.scene.children.length === 1 ? gltf.scene.children[0] : undefined;
  const exportedRoot = rootCandidate && !(rootCandidate instanceof THREE.Mesh) && rootCandidate.name.toLowerCase() === 'asset_root' ? rootCandidate : undefined;
  const sourceRoot = exportedRoot ?? gltf.scene; const rootNode = document.nodes[ROOT_NODE_ID]!; rootNode.name = objectName(sourceRoot, 'asset_root'); rootNode.transform = toTransform(sourceRoot);
  const extras = sourceRoot.userData.lowpolyAsset as (Partial<SceneDocument['metadata']> & { name?: string }) | undefined;
  if (extras) { document.name = typeof extras.name === 'string' && extras.name.trim() ? extras.name : document.name; document.metadata.forwardConfirmed = Boolean(extras.forwardConfirmed); document.metadata.groundReferenceY = Number.isFinite(extras.groundReferenceY) ? extras.groundReferenceY! : 0; document.metadata.groundContactTolerance = Number.isFinite(extras.groundContactTolerance) ? extras.groundContactTolerance! : 0.001; }
  const visit = (object: THREE.Object3D, parentId: string): void => {
    const id = object.userData.lowpolyNodeId && !document.nodes[String(object.userData.lowpolyNodeId)] ? String(object.userData.lowpolyNodeId) : nextNodeId(document, object instanceof THREE.Mesh ? 'mesh' : 'group');
    const base = { id, name: objectName(object, id), parentId, hidden: !object.visible, transform: toTransform(object) };
    const node: SceneNode = object instanceof THREE.Mesh ? { ...base, type: 'mesh', mesh: geometryToMeshData(document, object.geometry, object.material, knownMaterials, id) } : { ...base, type: 'group' };
    document.nodes[id] = node; object.children.forEach((child) => visit(child, id));
  };
  sourceRoot.children.forEach((child) => visit(child, document.rootId));
  return document;
}

function meshDataToGeometry(mesh: MeshData, flat: boolean): { geometry: THREE.BufferGeometry; materialIds: string[] } {
  const vertexIds = Object.keys(mesh.vertices); const indexById = new Map(vertexIds.map((id, index) => [id, index]));
  let geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertexIds.flatMap((id) => { const p = mesh.vertices[id]!.position; return [p.x, p.y, p.z]; }), 3));
  const indices: number[] = []; const materialIds: string[] = []; let groupStart = 0; let activeMaterial = -1;
  for (const face of Object.values(mesh.faces)) {
    let materialIndex = materialIds.indexOf(face.materialId); if (materialIndex < 0) { materialIds.push(face.materialId); materialIndex = materialIds.length - 1; }
    if (activeMaterial !== materialIndex) { if (indices.length > groupStart) geometry.addGroup(groupStart, indices.length - groupStart, activeMaterial); activeMaterial = materialIndex; groupStart = indices.length; }
    for (let corner = 1; corner < face.vertexIds.length - 1; corner += 1) indices.push(indexById.get(face.vertexIds[0]!)!, indexById.get(face.vertexIds[corner]!)!, indexById.get(face.vertexIds[corner + 1]!)!);
  }
  if (indices.length > groupStart) geometry.addGroup(groupStart, indices.length - groupStart, activeMaterial);
  geometry.setIndex(indices);
  if (flat) { const nonIndexed = geometry.toNonIndexed(); geometry.dispose(); geometry = nonIndexed; }
  geometry.computeVertexNormals(); geometry.computeBoundingBox(); return { geometry, materialIds };
}

function materialToThree(material: MaterialData): THREE.MeshStandardMaterial {
  const result = new THREE.MeshStandardMaterial({ name: material.name, color: material.color, roughness: material.roughness, metalness: material.metalness, opacity: material.opacity, transparent: material.opacity < 1, flatShading: material.shading === 'flat' });
  result.userData.lowpolyShading = material.shading; return result;
}

function buildObject(document: SceneDocument, node: SceneNode): THREE.Object3D {
  let object: THREE.Object3D;
  if (node.type === 'mesh') {
    const faceMaterials = new Set(Object.values(node.mesh.faces).map((face) => document.materials[face.materialId]?.shading)); const flat = faceMaterials.has('flat');
    const { geometry, materialIds } = meshDataToGeometry(node.mesh, flat); const materials = materialIds.map((id) => { const material = document.materials[id]; if (!material) throw new Error(`Mesh "${node.name}" references missing material "${id}".`); return materialToThree(material); });
    object = new THREE.Mesh(geometry, materials.length === 1 ? materials[0]! : materials);
  } else object = new THREE.Group();
  object.name = node.name; object.visible = !node.hidden; object.userData.lowpolyNodeId = node.id; applyTransform(object, node.transform);
  Object.values(document.nodes).filter((child) => child.parentId === node.id).forEach((child) => object.add(buildObject(document, child)));
  return object;
}

function disposeObject(object: THREE.Object3D): void {
  object.traverse((entry) => { if (entry instanceof THREE.Mesh) { entry.geometry.dispose(); for (const material of Array.isArray(entry.material) ? entry.material : [entry.material]) material.dispose(); } });
}

export async function exportGlb(document: SceneDocument): Promise<ArrayBuffer> {
  ensureNodeFileReader(); const hasNonUnitScale = Object.values(document.nodes).some((node) => node.transform.scale.x !== 1 || node.transform.scale.y !== 1 || node.transform.scale.z !== 1); const source = hasNonUnitScale ? bakeDocumentWorldTransforms(document) : document;
  const root = buildObject(source, source.nodes[source.rootId]!); root.userData.lowpolyAsset = { name: source.name, forwardConfirmed: source.metadata.forwardConfirmed, groundReferenceY: source.metadata.groundReferenceY, groundContactTolerance: source.metadata.groundContactTolerance };
  const exporter = new GLTFExporter();
  try {
    return await new Promise<ArrayBuffer>((resolve, reject) => exporter.parse(root, (output) => output instanceof ArrayBuffer ? resolve(output) : reject(new Error('GLTF exporter returned JSON instead of GLB.')), (error) => reject(error), { binary: true, onlyVisible: false, trs: true }));
  } finally { disposeObject(root); }
}
