# Lowpoly Modeler CLI

`lowpoly` compiles strict JSON recipes into texture-free, game-ready GLB assets. It is designed for a Codex workflow where an image and a natural-language request are interpreted into a reproducible recipe, then modeled deterministically without Blender or a browser runtime.

```text
reference image + request -> Codex skill -> recipe.json -> lowpoly CLI -> validated GLB
```

## Requirements

- Node.js 24 or newer
- npm

## Setup

```powershell
npm install
npm run build
npm link
```

`npm link` is optional. Without it, replace `lowpoly` with `node dist/cli.js` in the commands below.

## Commands

```powershell
# Build a new asset.
lowpoly build examples/wall.recipe.json --out output/wall.glb

# Edit an existing texture-free GLB.
lowpoly edit output/wall.glb examples/edit-wall.recipe.json --out output/wall-edited.glb

# Validate game-asset invariants and GLB payloads.
lowpoly validate output/wall.glb

# Inspect hierarchy, object ids, bounds, materials, and mesh counts.
lowpoly inspect output/wall.glb --json

# Emit the authoritative recipe JSON Schema.
lowpoly schema --out schemas/recipe.schema.json
```

`validate --strict` also treats warnings as a failing exit status. All commands use non-zero exit codes for errors.

## Recipe conventions

- Coordinates are right-handed with `+Y` up and `+Z` forward.
- Positions, sizes, radii, heights, and modeling distances use the asset's chosen world unit.
- All rotations and bend angles are expressed in **degrees**.
- Primitive size is baked into vertex positions. Exported node scales stay at `1, 1, 1`.
- Icospheres default to `subdivisions: 2` and flat shading.
- Materials are solid-color PBR materials. Textures and embedded images are intentionally excluded.
- Object names must be unique for reliable recipe targeting. Imported duplicate names must be targeted by the ids shown by `inspect --json`.

Minimal example:

```json
{
  "version": 1,
  "name": "faceted-orb",
  "metadata": { "forward": "+Z", "groundY": 0 },
  "steps": [
    { "op": "group", "name": "shade_pivot" },
    {
      "op": "primitive",
      "kind": "icosphere",
      "name": "orb",
      "parent": "shade_pivot",
      "radius": 0.8,
      "subdivisions": 2,
      "position": [0, 0.8, 0],
      "shading": "flat",
      "color": "#d9765e"
    }
  ]
}
```

The strict schema is available at [schemas/recipe.schema.json](schemas/recipe.schema.json). Unknown fields and unsupported values are rejected instead of being silently ignored.

## Supported modeling operations

| Operation | Purpose |
| --- | --- |
| `primitive` | Cube, plane, cylinder, cone, UV sphere, or faceted icosphere |
| `tube` | Capped or open low-poly tube along a point path |
| `group`, `parent` | Hierarchy and `shade_pivot` construction |
| `transform` | Position/rotation changes and baked scale/size changes |
| `material` | Solid color, roughness, metalness, opacity, flat/smooth shading |
| `join`, `weld` | Combine objects and merge nearby vertices |
| `boolean` | Difference, union, or intersection through `manifold-3d` |
| `mirror`, `bend`, `bevel` | Geometry-level shape operations; bevel currently uses one low-poly segment |
| `extrude`, `inset`, `delete_faces` | Face editing by ids or directional selectors |
| `subdivide` | Split selected edge boundaries at their midpoints |
| `transform_vertices`, `merge_vertices` | Vertex editing by ids or all vertices |
| `rename`, `delete`, `ground` | Object and game-layout operations |

Directional face selectors are `top`, `bottom`, `front`, `back`, `left`, and `right`. Explicit face, edge, and vertex ids can be obtained with programmatic inspection of the editable document; GLB editing targets objects by the ids emitted by `inspect --json`.

## Validation guarantees

Every `build` and `edit` operation validates before export, writes a binary GLB, reopens it, and validates again before writing the requested file. The checks cover:

- valid geometry and material references;
- finite transforms and unit node scales;
- hierarchy integrity;
- ground contact and orientation metadata;
- visible mesh preservation after GLB round-trip;
- absence of GLB texture and image payloads.

Warnings such as a missing `shade_pivot` are reported without blocking a normal export. Geometry and payload errors block output.

## Codex image workflow

The project-local skill is in [.agents/skills/lowpoly-modeler/SKILL.md](.agents/skills/lowpoly-modeler/SKILL.md). In Codex, attach a reference image and ask for a static low-poly GLB. The skill decomposes the image into supported primitives and geometry operations, records assumptions for hidden surfaces, writes a recipe, builds it, validates it, and returns both the recipe and GLB.

Single images do not reveal exact depth, hidden surfaces, or real-world scale. The skill uses stable low-poly assumptions unless those unknowns materially affect gameplay dimensions or topology.

## Scope

This CLI targets static, solid-color, low-poly game props. It does not provide rigging, animation editing, texture painting, UV baking, retopology, sculpting, or photogrammetry. Textured input GLBs are rejected with a clear diagnostic.

## Development

```powershell
npm run check
```

This runs strict TypeScript checking, emits the CLI, and runs unit and GLB round-trip integration tests.
