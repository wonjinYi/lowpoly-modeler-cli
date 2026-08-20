# Recipe Guide

Read this reference when creating or changing a recipe. The authoritative machine-readable contract is `schemas/recipe.schema.json`; run `node dist/cli.js schema` to print the version compiled into the CLI.

## Coordinate and modeling choices

- Use `[x, y, z]` arrays, `+Y` up, and `+Z` forward.
- Rotations and bend angles are degrees.
- Put the lowest intended contact point at the metadata `groundY`, normally `0`.
- Add a group named `shade_pivot` when the engine should rotate the whole asset. Parent gameplay-visible parts under it.
- Use low segment counts that preserve the reference silhouette: usually 6–12 for cylinders and tubes.
- Prefer `icosphere` with `subdivisions: 1` or `2` over a UV sphere for faceted decorations.

## Image decomposition

Map box-like masses to `cube`; posts and circular bases to `cylinder`; tapers to `cone`; faceted bulbs to `icosphere`; stems, hooks, handles, and candy-cane shapes to `tube`. Build repeated parts explicitly and use `mirror` only for a half-mesh whose seam lies on the selected axis.

Match silhouette before small detail. Encode visible proportions as simple measurements, keep colors to a small palette, and name objects by visual role rather than primitive type.

## Common steps

```json
{
  "version": 1,
  "name": "asset-name",
  "metadata": { "forward": "+Z", "groundY": 0, "groundTolerance": 0.001 },
  "steps": [
    { "op": "group", "name": "shade_pivot" },
    {
      "op": "primitive",
      "kind": "cube",
      "name": "base",
      "parent": "shade_pivot",
      "size": [2, 0.4, 1],
      "position": [0, 0.2, 0],
      "color": "#d8c7a3",
      "shading": "flat"
    }
  ]
}
```

Creation steps are `primitive`, `tube`, and `group`. Object steps are `transform`, `material`, `rename`, `delete`, `parent`, and `ground`. Assembly steps are `join`, `weld`, and `boolean`. Shape steps are `mirror`, `bend`, and one-segment `bevel`. Element steps are `extrude`, `inset`, `delete_faces`, `subdivide`, `transform_vertices`, and `merge_vertices`.

Directional face selectors are `top`, `bottom`, `front`, `back`, `left`, and `right`. Explicit selectors use arrays of ids. Object targets accept a unique object name or the object id from `inspect --json`.

## Build and correction loop

```powershell
npm run build
node dist/cli.js build output/asset.recipe.json --out output/asset.glb
node dist/cli.js validate output/asset.glb
node dist/cli.js inspect output/asset.glb --json
```

For an edit, inspect the source first and use its exact names or ids:

```powershell
node dist/cli.js inspect input/source.glb --json
node dist/cli.js edit input/source.glb output/edit.recipe.json --out output/edited.glb
```

Never fix schema errors by inventing fields. Consult the emitted schema, change the recipe, and rerun. If visual requirements exceed static untextured low-poly modeling, explain the scope boundary.
