import { describe, expect, it } from 'vitest';
import { parseRecipe } from '../src/schema.js';

describe('recipe schema', () => {
  it('accepts a strict primitive recipe', () => {
    const recipe = parseRecipe({
      version: 1,
      name: 'orb',
      metadata: { forward: '+Z', groundY: 0 },
      steps: [{ op: 'primitive', kind: 'icosphere', name: 'orb', radius: 0.8, subdivisions: 2, color: '#d9765e' }],
    });
    expect(recipe.name).toBe('orb');
  });

  it('rejects misspelled and unknown fields', () => {
    expect(() => parseRecipe({ name: 'bad', steps: [{ op: 'primitive', kind: 'cube', name: 'box', colour: '#ffffff' }] })).toThrow(/Invalid recipe/);
  });

  it('rejects unsupported bevel segment counts', () => {
    expect(() => parseRecipe({ name: 'bad bevel', steps: [{ op: 'bevel', target: 'box', width: 0.1, segments: 2 }] })).toThrow(/Invalid recipe/);
  });
});
