import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ALL_TOOLSETS } from '../src/config';
import type { Config, Profile } from '../src/config';
import type { CallFn } from '../src/registry';

export function fakeProfile(name = 'default'): Profile {
  return { name, baseUrl: `https://${name}.example.test/`, user: 'user', password: 'secret-pw' };
}

/** One profile "default", default toolsets (all but auth), all allow flags off. */
export function fakeConfig(overrides: Partial<Config> = {}): Config {
  return {
    profiles: [fakeProfile()],
    toolsets: new Set(ALL_TOOLSETS.filter((t) => t !== 'auth')),
    allow: { write: false, delete: false, send: false },
    ...overrides,
  };
}

export interface RecordedCall {
  profile: Profile;
  fn: string;
  params: Record<string, unknown>;
}

export type RecordingCall = CallFn & { calls: RecordedCall[] };

/** `{ fn, params }` of a recorded call, for exact `toEqual` assertions on the request body. */
export function sent(c: RecordedCall): { fn: string; params: Record<string, unknown> } {
  return { fn: c.fn, params: c.params };
}

/** Recording CallFn that resolves to `result` (default []). */
export function makeCall(result: unknown = []): RecordingCall {
  const calls: RecordedCall[] = [];
  const fn = (async (profile: Profile, name: string, params: Record<string, unknown>) => {
    calls.push({ profile, fn: name, params });
    return result;
  }) as RecordingCall;
  fn.calls = calls;
  return fn;
}

export async function connectClient(server: McpServer): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

export async function callTool(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<{ isError?: boolean; text: string }> {
  const res = (await client.callTool({ name, arguments: args })) as {
    isError?: boolean;
    content?: Array<{ type: string; text?: string }>;
  };
  const text = (res.content ?? [])
    .filter((c) => c.type === 'text')
    .map((c) => c.text ?? '')
    .join('\n');
  return { isError: res.isError, text };
}
