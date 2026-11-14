import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('package.json', () => {
  it('has the expected name and bin entry', () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, '..', 'package.json'), 'utf8'));
    expect(pkg.name).toBe('mcp-vereinonline');
    expect(pkg.bin['mcp-vereinonline']).toBe('dist/index.js');
  });
});
