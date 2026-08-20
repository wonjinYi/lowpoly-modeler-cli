import { descendants, worldBounds } from './document.js';
import { faceNormal, getEdges } from './geometry/operations.js';
import type { SceneDocument, ValidationIssue } from './types.js';

function unitScale(scale: { x: number; y: number; z: number }): boolean { return Math.abs(scale.x - 1) < 1e-8 && Math.abs(scale.y - 1) < 1e-8 && Math.abs(scale.z - 1) < 1e-8; }

export function validateDocument(document: SceneDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = []; const meshes = Object.values(document.nodes).filter((node) => node.type === 'mesh' && !node.hidden);
  if (!meshes.length) issues.push({ severity: 'error', code: 'empty-scene', message: 'The asset has no visible mesh.' });
  if (document.metadata.sourceHadTextures) issues.push({ severity: 'error', code: 'textures-present', message: 'Texture/image payloads are not allowed.' });
  for (const node of Object.values(document.nodes)) {
    const values = [...Object.values(node.transform.position), ...Object.values(node.transform.rotation), ...Object.values(node.transform.scale)];
    if (!values.every(Number.isFinite)) issues.push({ severity: 'error', code: 'invalid-transform', message: `"${node.name}" has a non-finite transform.`, node: node.id });
    if (!unitScale(node.transform.scale)) issues.push({ severity: 'error', code: 'non-unit-scale', message: `"${node.name}" has non-unit scale.`, node: node.id });
    if (node.parentId && !document.nodes[node.parentId]) issues.push({ severity: 'error', code: 'missing-parent', message: `"${node.name}" references a missing parent.`, node: node.id });
    if (node.type !== 'mesh') continue;
    if (!Object.keys(node.mesh.faces).length) issues.push({ severity: 'error', code: 'empty-mesh', message: `"${node.name}" has no faces.`, node: node.id });
    for (const face of Object.values(node.mesh.faces)) {
      if (face.vertexIds.length < 3 || new Set(face.vertexIds).size < 3 || face.vertexIds.some((id) => !node.mesh.vertices[id]) || !faceNormal(node.mesh, face)) issues.push({ severity: 'error', code: 'invalid-face', message: `"${node.name}" contains invalid face "${face.id}".`, node: node.id });
      if (!document.materials[face.materialId]) issues.push({ severity: 'error', code: 'missing-material', message: `"${node.name}" references missing material "${face.materialId}".`, node: node.id });
    }
    const nonManifold = getEdges(node.mesh).filter((edge) => edge.faceIds.length > 2);
    if (nonManifold.length) issues.push({ severity: 'warning', code: 'non-manifold', message: `"${node.name}" has ${nonManifold.length} non-manifold edge(s).`, node: node.id });
  }
  try { descendants(document, document.rootId); } catch { issues.push({ severity: 'error', code: 'hierarchy-cycle', message: 'The node hierarchy contains a cycle.' }); }
  if (meshes.length && !document.metadata.forwardConfirmed) issues.push({ severity: 'warning', code: 'orientation-unconfirmed', message: 'The recipe or GLB does not confirm +Z as forward.' });
  if (meshes.length && !Object.values(document.nodes).some((node) => node.name.toLowerCase() === 'shade_pivot')) issues.push({ severity: 'info', code: 'missing-shade-pivot', message: 'No shade_pivot node is present.' });
  const bounds = worldBounds(document); if (bounds && Math.abs(bounds.min.y - document.metadata.groundReferenceY) > document.metadata.groundContactTolerance) issues.push({ severity: 'warning', code: 'not-grounded', message: `Asset minimum Y is ${bounds.min.y.toFixed(4)}; expected ${document.metadata.groundReferenceY.toFixed(4)} ± ${document.metadata.groundContactTolerance.toFixed(4)}.` });
  return issues;
}

export function hasErrors(issues: ValidationIssue[]): boolean { return issues.some((issue) => issue.severity === 'error'); }
