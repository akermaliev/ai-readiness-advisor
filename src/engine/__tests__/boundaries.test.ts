/**
 * Structural rules from the spec, checked as source text so a violation fails CI rather
 * than waiting for review. (Browser APIs are separately excluded by tsconfig.core.json.)
 */
import { describe, expect, it } from 'vitest';

const engineSources = import.meta.glob<string>(['../*.ts'], { query: '?raw', import: 'default', eager: true });
const dataSources = import.meta.glob<string>(['../../data/*.ts'], { query: '?raw', import: 'default', eager: true });
const importsOf = (src: string): string[] => [...src.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1] ?? '');

describe('engine boundaries', () => {
  it('found the engine sources', () => {
    expect(Object.keys(engineSources).length).toBeGreaterThanOrEqual(8);
  });

  it('only weights.ts reads the weight tables — every other function receives resolved weights', () => {
    const readers = Object.entries(engineSources)
      .filter(([, src]) => importsOf(src).some((i) => /data\/(weightProfiles|sizeModifiers)$/.test(i)))
      .map(([path]) => path);
    expect(readers).toEqual(['../weights.ts']);
  });

  it('imports nothing from React, the UI stages, or the model layer', () => {
    for (const [path, src] of Object.entries(engineSources)) {
      for (const i of importsOf(src)) {
        expect(i, path).not.toMatch(/^react|\/(intake|report|model)\b/);
      }
    }
  });

  it('data layer imports nothing but its own types', () => {
    for (const [path, src] of Object.entries(dataSources)) {
      for (const i of importsOf(src)) expect(i, path).toBe('./types');
    }
  });
});
