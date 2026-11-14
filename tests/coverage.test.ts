import { describe, it, expect } from 'vitest';
import { ALL_DEFINITIONS } from '../src/definitions/index';
import { ALL_TOOLSETS } from '../src/config';
import { toolName } from '../src/registry';
import { EXPECTED } from './expected-functions';

describe('ALL_DEFINITIONS coverage', () => {
  it('contains exactly the API names of EXPECTED, once each, with matching toolset and klass', () => {
    const byApi = new Map<string, (typeof ALL_DEFINITIONS)[number][]>();
    for (const def of ALL_DEFINITIONS) {
      byApi.set(def.api, [...(byApi.get(def.api) ?? []), def]);
    }
    // No duplicates
    const duplicates = [...byApi.entries()].filter(([, defs]) => defs.length > 1).map(([api]) => api);
    expect(duplicates).toEqual([]);

    // Same key set
    expect([...byApi.keys()].sort()).toEqual(Object.keys(EXPECTED).sort());
    expect(ALL_DEFINITIONS).toHaveLength(47);

    // Entry by entry
    for (const [api, expected] of Object.entries(EXPECTED)) {
      const [def] = byApi.get(api) ?? [];
      expect(def, `missing definition for ${api}`).toBeDefined();
      expect(def?.toolset, `toolset of ${api}`).toBe(expected.toolset);
      expect(def?.klass, `klass of ${api}`).toBe(expected.klass);
    }
  });

  it('gives all 47 definitions unique tool names starting with vo_', () => {
    const names = ALL_DEFINITIONS.map((def) => toolName(def.api));
    expect(new Set(names).size).toBe(names.length);
    expect(names).toHaveLength(47);
    for (const name of names) {
      expect(name.startsWith('vo_')).toBe(true);
    }
  });

  it('uses only known toolsets', () => {
    for (const def of ALL_DEFINITIONS) {
      expect(ALL_TOOLSETS).toContain(def.toolset);
    }
  });
});
