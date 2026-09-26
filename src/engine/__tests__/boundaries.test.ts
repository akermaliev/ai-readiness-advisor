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

const allSources = import.meta.glob<string>(['../../**/*.{ts,tsx}', '!../../**/__tests__/**'], { query: '?raw', import: 'default', eager: true });

describe('BYOK key hygiene (whole app)', () => {
  it('scanned the app sources', () => {
    expect(Object.keys(allSources).length).toBeGreaterThan(30);
  });
  it('never touches browser storage or cookies anywhere', () => {
    for (const [path, src] of Object.entries(allSources)) {
      expect(src, path).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/);
    }
  });
  it('never logs from app code (a logged request could carry the key)', () => {
    for (const [path, src] of Object.entries(allSources)) {
      expect(src, path).not.toMatch(/console\.(log|info|debug|warn|error)/);
    }
  });
  it('only src/model/client.ts talks to the network', () => {
    const callers = Object.entries(allSources).filter(([, src]) => /\bfetch\(|XMLHttpRequest|sendBeacon/.test(src)).map(([p]) => p);
    expect(callers).toEqual(['../../model/client.ts']);
  });
});
