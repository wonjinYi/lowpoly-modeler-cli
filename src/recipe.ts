import * as THREE from 'three';
import { addGroup, addMesh, assertUniqueName, bakeNodeScale, createDocument, createMaterial, descendants, findMesh, findNode, groundNode, parentNode, pruneMaterials, removeNode, renameNode, worldMatrix } from './document.js';
import { booleanMesh } from './geometry/boolean.js';
import { createCone, createCube, createCylinder, createIcosphere, createPlane, createSphere, createTube } from './geometry/primitives.js';
import { applyMatrix, bendMesh, bevelMesh, combineMeshes, deleteFaces, extrudeFaces, insetFaces, mirrorMesh, resizeMesh, selectEdges, selectFaces, selectVertices, subdivideEdges, transformVertices, weldMesh, mergeSelectedVertices } from './geometry/operations.js';
import type { MeshData, MeshNode, PrimitiveStep, Recipe, RecipeStep, SceneDocument, Shading, Vec3, Vec3Tuple } from './types.js';
import { tupleToVec3 } from './types.js';

const radians = (values: Vec3Tuple | undefined): Vec3 => {
  const value = tupleToVec3(values);
  return { x: THREE.MathUtils.degToRad(value.x), y: THREE.MathUtils.degToRad(value.y), z: THREE.MathUtils.degToRad(value.z) };
};

function materialOptions(step: { color?: string; roughness?: number; metalness?: number; opacity?: number; shading?: Shading }) {
  return { color: step.color, roughness: step.roughness, metalness: step.metalness, opacity: step.opacity, shading: step.shading };
}

function primitiveMesh(step: PrimitiveStep, materialId: string): MeshData {
  let mesh: MeshData;
  switch (step.kind) {
    case 'cube': mesh = createCube(materialId); break;
    case 'plane': mesh = createPlane(materialId); break;
    case 'cylinder': mesh = createCylinder(materialId, step.segments ?? 8); break;
    case 'cone': mesh = createCone(materialId, step.segments ?? 8); break;
    case 'sphere': mesh = createSphere(materialId, step.segments ?? 12, step.latitudeSegments ?? 8); break;
    case 'icosphere': mesh = createIcosphere(materialId, step.subdivisions ?? 2); break;
  }
  const radius = step.radius ?? 0.5; const height = step.height ?? 1;
  const size = step.size ?? (step.kind === 'cylinder' || step.kind === 'cone' ? [radius * 2, height, radius * 2] : step.kind === 'sphere' || step.kind === 'icosphere' ? [radius * 2, radius * 2, radius * 2] : undefined);
  return size ? resizeMesh(mesh, tupleToVec3(size)) : mesh;
}

function materialsForMesh(document: SceneDocument, node: MeshNode) {
  const ids = new Set(Object.values(node.mesh.faces).map((face) => face.materialId));
  return [...ids].map((id) => document.materials[id]).filter((entry) => entry !== undefined);
}

async function applyStep(document: SceneDocument, step: RecipeStep): Promise<void> {
  switch (step.op) {
    case 'primitive': {
      const material = createMaterial(document, `${step.name} material`, materialOptions(step));
      addMesh(document, step.name, primitiveMesh(step, material.id), step.parent, tupleToVec3(step.position), radians(step.rotation));
      return;
    }
    case 'tube': {
      const material = createMaterial(document, `${step.name} material`, materialOptions(step));
      addMesh(document, step.name, createTube(material.id, step.path, step.radius, step.segments ?? 8, step.capped ?? true), step.parent);
      return;
    }
    case 'group': addGroup(document, step.name, step.parent, tupleToVec3(step.position), radians(step.rotation)); return;
    case 'transform': {
      const node = findNode(document, step.target);
      if (step.position) node.transform.position = tupleToVec3(step.position);
      if (step.translate) { const value = tupleToVec3(step.translate); node.transform.position.x += value.x; node.transform.position.y += value.y; node.transform.position.z += value.z; }
      if (step.rotation) node.transform.rotation = radians(step.rotation);
      if (step.rotate) { const value = radians(step.rotate); node.transform.rotation.x += value.x; node.transform.rotation.y += value.y; node.transform.rotation.z += value.z; }
      if (step.scale) {
        const value = tupleToVec3(step.scale, 1);
        if ([value.x, value.y, value.z].some((entry) => entry === 0)) throw new Error('Scale components must be non-zero.');
        if (node.type === 'mesh') bakeNodeScale(node, value);
        else {
          node.transform.scale.x *= value.x;
          node.transform.scale.y *= value.y;
          node.transform.scale.z *= value.z;
        }
      }
      if (step.size) { if (node.type !== 'mesh') throw new Error('Only mesh objects can be resized.'); node.mesh = resizeMesh(node.mesh, tupleToVec3(step.size)); node.transform.scale = { x: 1, y: 1, z: 1 }; }
      return;
    }
    case 'material': {
      const node = findMesh(document, step.target);
      for (const material of materialsForMesh(document, node)) {
        if (step.color !== undefined) material.color = step.color;
        if (step.roughness !== undefined) material.roughness = step.roughness;
        if (step.metalness !== undefined) material.metalness = step.metalness;
        if (step.opacity !== undefined) material.opacity = step.opacity;
        if (step.shading !== undefined) material.shading = step.shading;
      }
      return;
    }
    case 'rename': renameNode(document, step.target, step.name); return;
    case 'delete': removeNode(document, step.target); return;
    case 'parent': parentNode(document, step.target, step.parent); return;
    case 'ground': groundNode(document, step.target, step.y ?? document.metadata.groundReferenceY); return;
    case 'weld': { const node = findMesh(document, step.target); node.mesh = weldMesh(node.mesh, step.distance ?? 0.0001); return; }
    case 'join': {
      const nodes = step.targets.map((target) => findMesh(document, target));
      if (new Set(nodes.map((node) => node.id)).size !== nodes.length) throw new Error('Join targets must be different meshes.');
      for (const node of nodes) if (descendants(document, node.id).length) throw new Error(`Join target "${node.name}" cannot have children.`);
      const mesh = combineMeshes(nodes.map((node) => ({ mesh: node.mesh, matrix: worldMatrix(document, node.id) })), step.weldTolerance ?? 0);
      const preservedMaterials = Object.fromEntries(
        [...new Set(Object.values(mesh.faces).map((face) => face.materialId))]
          .map((id) => [id, document.materials[id]])
          .filter((entry): entry is [string, NonNullable<(typeof entry)[1]>] => entry[1] !== undefined),
      );
      for (const node of nodes) removeNode(document, node.id);
      Object.assign(document.materials, preservedMaterials);
      assertUniqueName(document, step.name); addMesh(document, step.name, mesh); pruneMaterials(document); return;
    }
    case 'boolean': {
      const target = findMesh(document, step.target); const cutter = findMesh(document, step.cutter);
      if (target.id === cutter.id) throw new Error('Boolean target and cutter must be different.');
      const targetWorld = worldMatrix(document, target.id); const cutterToTarget = targetWorld.clone().invert().multiply(worldMatrix(document, cutter.id));
      const cutterMesh = applyMatrix(cutter.mesh, cutterToTarget); const materialId = Object.values(target.mesh.faces)[0]?.materialId;
      if (!materialId) throw new Error('Boolean target has no material.');
      target.mesh = await booleanMesh(step.operation, target.mesh, cutterMesh, materialId);
      if (step.name) renameNode(document, target.id, step.name);
      if (!(step.keepCutter ?? false)) removeNode(document, cutter.id);
      pruneMaterials(document); return;
    }
    case 'mirror': { const node = findMesh(document, step.target); node.mesh = mirrorMesh(node.mesh, step.axis, step.weldTolerance ?? 0.0001); return; }
    case 'bend': { const node = findMesh(document, step.target); node.mesh = bendMesh(node.mesh, step.axis, step.angle, step.origin ? tupleToVec3(step.origin) : { x: 0, y: 0, z: 0 }); return; }
    case 'bevel': { const node = findMesh(document, step.target); node.mesh = bevelMesh(node.mesh, step.width); return; }
    case 'extrude': { const node = findMesh(document, step.target); node.mesh = extrudeFaces(node.mesh, selectFaces(node.mesh, step.faces), step.distance, step.rotate); return; }
    case 'inset': { const node = findMesh(document, step.target); node.mesh = insetFaces(node.mesh, selectFaces(node.mesh, step.faces), step.factor); return; }
    case 'delete_faces': { const node = findMesh(document, step.target); node.mesh = deleteFaces(node.mesh, selectFaces(node.mesh, step.faces)); return; }
    case 'subdivide': { const node = findMesh(document, step.target); node.mesh = subdivideEdges(node.mesh, selectEdges(node.mesh, step.edges)); return; }
    case 'transform_vertices': { const node = findMesh(document, step.target); node.mesh = transformVertices(node.mesh, selectVertices(node.mesh, step.vertices), step.translate, step.rotate, step.scale); return; }
    case 'merge_vertices': { const node = findMesh(document, step.target); node.mesh = mergeSelectedVertices(node.mesh, selectVertices(node.mesh, step.vertices), step.distance); return; }
  }
}

export async function compileRecipe(recipe: Recipe, base?: SceneDocument): Promise<SceneDocument> {
  const document = base ?? createDocument(recipe.name, recipe.metadata); document.name = recipe.name;
  if (recipe.metadata) {
    if (recipe.metadata.forward) document.metadata.forwardConfirmed = true;
    if (recipe.metadata.groundY !== undefined) document.metadata.groundReferenceY = recipe.metadata.groundY;
    if (recipe.metadata.groundTolerance !== undefined) document.metadata.groundContactTolerance = recipe.metadata.groundTolerance;
  }
  for (const [index, step] of recipe.steps.entries()) {
    try { await applyStep(document, step); }
    catch (error) { throw new Error(`Recipe step ${index + 1} (${step.op}) failed: ${error instanceof Error ? error.message : String(error)}`); }
  }
  return document;
}
