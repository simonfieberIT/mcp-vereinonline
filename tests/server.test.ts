import { describe, it, expect } from 'vitest';
import { createServer } from '../src/server';
import { ALL_TOOLSETS } from '../src/config';
import { connectClient, fakeConfig, makeCall } from './helpers';

async function toolNames(overrides: Parameters<typeof fakeConfig>[0] = {}): Promise<string[]> {
  const server = createServer(fakeConfig(overrides), makeCall());
  const client = await connectClient(server);
  const { tools } = await client.listTools();
  await client.close();
  return tools.map((t) => t.name).sort();
}

const ALL_ALLOW = { write: true, delete: true, send: true };

describe('createServer tool counts', () => {
  it('default config (12 toolsets, no allow flags) lists 26 tools', async () => {
    const names = await toolNames();
    expect(names).toHaveLength(26);
    expect(names).toContain('vo_raw');
    expect(names).not.toContain('vo_verify_login');
    expect(names).not.toContain('vo_check_login');
    expect(names).not.toContain('vo_send_login');
  });

  it('all toolsets and all allow flags list 48 tools', async () => {
    const names = await toolNames({
      toolsets: new Set(ALL_TOOLSETS),
      allow: ALL_ALLOW,
    });
    expect(names).toHaveLength(48);
    expect(names).toContain('vo_raw');
  });

  it('toolsets {members} without flags lists exactly vo_get_members, vo_get_member, vo_raw', async () => {
    const names = await toolNames({ toolsets: new Set(['members']) });
    expect(names).toEqual(['vo_get_member', 'vo_get_members', 'vo_raw']);
  });
});

describe('createServer write gating', () => {
  it('delete tools appear only with allow.delete', async () => {
    const all = new Set(ALL_TOOLSETS);
    const without = await toolNames({ toolsets: all, allow: { write: true, delete: false, send: true } });
    expect(without).not.toContain('vo_delete_member');
    expect(without).not.toContain('vo_delete_event');

    const withDelete = await toolNames({ toolsets: all, allow: { write: false, delete: true, send: false } });
    expect(withDelete).toContain('vo_delete_member');
    expect(withDelete).toContain('vo_delete_event');
  });

  it('send tools appear only with allow.send (auth toolset on)', async () => {
    const all = new Set(ALL_TOOLSETS);
    const without = await toolNames({ toolsets: all, allow: { write: true, delete: true, send: false } });
    expect(without).not.toContain('vo_send_login');

    const withSend = await toolNames({ toolsets: all, allow: { write: false, delete: false, send: true } });
    expect(withSend).toContain('vo_send_login');
  });
});
