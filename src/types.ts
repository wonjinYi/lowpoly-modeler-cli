export type Vec3Tuple = [number, number, number];
export type Vec3 = { x: number; y: number; z: number };
export type Axis = 'x' | 'y' | 'z';
export type Shading = 'flat' | 'smooth';
export type BooleanOperation = 'difference' | 'union' | 'intersection';

export interface Transform {
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
}

export interface MaterialData {
  id: string;
  name: string;
  color: string;
  roughness: number;
  metalness: number;
  opacity: number;
  shading: Shading;
}

export interface MeshVertex {
  id: string;
  position: Vec3;
  normal?: Vec3;
  uv?: { u: number; v: number };
  color?: { r: number; g: number; b: number };
}

export interface MeshFace {
  id: string;
  vertexIds: string[];
  materialId: string;
}

export interface MeshData {
  vertices: Record<string, MeshVertex>;
  faces: Record<string, MeshFace>;
}

export interface BaseNode {
  id: string;
  name: string;
  parentId: string | null;
  hidden: boolean;
  transform: Transform;
}

export interface GroupNode extends BaseNode {
  type: 'group';
}

export interface MeshNode extends BaseNode {
  type: 'mesh';
  mesh: MeshData;
}

export type SceneNode = GroupNode | MeshNode;

export interface SceneDocument {
  version: 1;
  name: string;
  rootId: string;
  nodes: Record<string, SceneNode>;
  materials: Record<string, MaterialData>;
  metadata: {
    forwardConfirmed: boolean;
    groundReferenceY: number;
    groundContactTolerance: number;
    sourceHadTextures: boolean;
  };
}

export interface RecipeMetadata {
  forward?: '+Z';
  groundY?: number;
  groundTolerance?: number;
}

export type FaceSelector = 'all' | 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right' | string[];
export type VertexSelector = 'all' | string[];
export type EdgeSelector = 'all' | string[];

export interface PrimitiveStep {
  op: 'primitive';
  kind: 'cube' | 'plane' | 'cylinder' | 'cone' | 'sphere' | 'icosphere';
  name: string;
  parent?: string;
  size?: Vec3Tuple;
  radius?: number;
  height?: number;
  segments?: number;
  latitudeSegments?: number;
  subdivisions?: number;
  position?: Vec3Tuple;
  rotation?: Vec3Tuple;
  color?: string;
  roughness?: number;
  metalness?: number;
  opacity?: number;
  shading?: Shading;
}

export interface TubeStep {
  op: 'tube';
  name: string;
  parent?: string;
  path: Vec3Tuple[];
  radius: number;
  segments?: number;
  capped?: boolean;
  color?: string;
  roughness?: number;
  metalness?: number;
  opacity?: number;
  shading?: Shading;
}

export interface GroupStep {
  op: 'group';
  name: string;
  parent?: string;
  position?: Vec3Tuple;
  rotation?: Vec3Tuple;
}

export interface TransformStep {
  op: 'transform';
  target: string;
  position?: Vec3Tuple;
  translate?: Vec3Tuple;
  rotation?: Vec3Tuple;
  rotate?: Vec3Tuple;
  scale?: Vec3Tuple;
  size?: Vec3Tuple;
}

export interface MaterialStep {
  op: 'material';
  target: string;
  color?: string;
  roughness?: number;
  metalness?: number;
  opacity?: number;
  shading?: Shading;
}

export interface RenameStep { op: 'rename'; target: string; name: string }
export interface DeleteStep { op: 'delete'; target: string }
export interface ParentStep { op: 'parent'; target: string; parent: string }
export interface GroundStep { op: 'ground'; target?: string; y?: number }

export interface JoinStep {
  op: 'join';
  targets: string[];
  name: string;
  weldTolerance?: number;
}

export interface WeldStep { op: 'weld'; target: string; distance?: number }

export interface BooleanStep {
  op: 'boolean';
  operation: BooleanOperation;
  target: string;
  cutter: string;
  name?: string;
  keepCutter?: boolean;
}

export interface MirrorStep { op: 'mirror'; target: string; axis: Axis; weldTolerance?: number }
export interface BendStep { op: 'bend'; target: string; axis: Axis; angle: number; origin?: Vec3Tuple }
export interface BevelStep { op: 'bevel'; target: string; width: number; segments?: number }

export interface ExtrudeStep {
  op: 'extrude';
  target: string;
  faces: FaceSelector;
  distance: number;
  rotate?: Vec3Tuple;
}

export interface InsetStep { op: 'inset'; target: string; faces: FaceSelector; factor: number }
export interface DeleteFacesStep { op: 'delete_faces'; target: string; faces: FaceSelector }
export interface SubdivideStep { op: 'subdivide'; target: string; edges?: EdgeSelector }

export interface TransformVerticesStep {
  op: 'transform_vertices';
  target: string;
  vertices: VertexSelector;
  translate?: Vec3Tuple;
  rotate?: Vec3Tuple;
  scale?: Vec3Tuple;
}

export interface MergeVerticesStep {
  op: 'merge_vertices';
  target: string;
  vertices: VertexSelector;
  distance?: number;
}

export type RecipeStep =
  | PrimitiveStep | TubeStep | GroupStep | TransformStep | MaterialStep | RenameStep | DeleteStep
  | ParentStep | GroundStep | JoinStep | WeldStep | BooleanStep | MirrorStep | BendStep | BevelStep
  | ExtrudeStep | InsetStep | DeleteFacesStep | SubdivideStep | TransformVerticesStep
  | MergeVerticesStep;

export interface Recipe {
  version?: 1;
  name: string;
  metadata?: RecipeMetadata;
  steps: RecipeStep[];
}

export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  node?: string;
}

export const ROOT_NODE_ID = 'asset_root';
export const UNIT_TRANSFORM: Transform = {
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
};

export function tupleToVec3(value: Vec3Tuple | undefined, fallback = 0): Vec3 {
  return value ? { x: value[0], y: value[1], z: value[2] } : { x: fallback, y: fallback, z: fallback };
}

export function cloneMesh(mesh: MeshData): MeshData {
  return {
    vertices: Object.fromEntries(Object.entries(mesh.vertices).map(([id, vertex]) => [id, {
      ...vertex,
      position: { ...vertex.position },
      normal: vertex.normal ? { ...vertex.normal } : undefined,
      uv: vertex.uv ? { ...vertex.uv } : undefined,
      color: vertex.color ? { ...vertex.color } : undefined,
    }])),
    faces: Object.fromEntries(Object.entries(mesh.faces).map(([id, face]) => [id, {
      ...face,
      vertexIds: [...face.vertexIds],
    }])),
  };
}
