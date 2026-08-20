---
name: lowpoly-modeler
description: Create, edit, inspect, or validate static low-poly GLB game assets from reference images or natural-language shape requests by using this repository's deterministic recipe CLI. Use for solid-color props; do not use for rigging, animation, texture baking, sculpting, or photorealistic modeling.
---

# Lowpoly Modeler

Turn the user's image and request into a reproducible recipe and a validated GLB. The CLI is the modeling authority; do not substitute Blender, browser automation, or hand-authored binary GLB data.

## Workflow

1. Resolve the repository root containing `package.json`, `src/cli.ts`, and `schemas/recipe.schema.json`. Run commands from that root.
2. Inspect every supplied reference image. Identify the silhouette, major parts, symmetry, likely hidden depth, intended ground contact, palette, and which direction should face `+Z`.
3. For creation or editing, read [references/recipe-guide.md](references/recipe-guide.md). Use `node dist/cli.js schema` when exact field validation is needed.
4. Prefer a small number of meaningful objects. Use primitives for rigid parts, `tube` for paths and hooks, and geometry operations only when they improve the visible silhouette.
5. Write a named `*.recipe.json` in the user's requested output area. Keep the recipe beside the GLB unless the user specifies another location.
6. If `dist/cli.js` is missing or older than the source, run `npm run build`. Create with `node dist/cli.js build <recipe> --out <glb>` or edit with `node dist/cli.js edit <source.glb> <recipe> --out <glb>`.
7. Run `validate` and `inspect --json` on the result. Fix all errors. Review warnings against the request, and add `shade_pivot`, grounding, or `+Z` metadata when applicable.
8. Return the GLB, recipe, important inferred dimensions, and any visual assumptions. Preserve both files so the asset can be revised deterministically.

When a single image leaves the back, depth, or scale unknown, make a conservative low-poly inference and state it. Ask only when the missing choice materially changes gameplay dimensions, topology, or the requested identity.

For deterministic command or schema failures, revise the recipe and retry. If the same failure persists after three materially different corrections, report the exact CLI error and the unsupported shape or operation instead of hiding the failure.

## Invariants

- Use `+Y` up and `+Z` forward; recipe angles are degrees.
- Bake dimensions into geometry and keep exported scales at `1, 1, 1`.
- Default decorative spheres to faceted icospheres with subdivision 2 and flat shading.
- Do not add texture or image payloads. Use solid PBR colors.
- Do not overwrite the source GLB during editing; write the requested output path.
- Treat the recipe as part of the deliverable, not temporary scratch data.
