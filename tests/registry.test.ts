import { describe, it, expect } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  GateError,
  buildShape,
  clampMaxResults,
  finalizeResult,
  isEnabled,
  registerAll,
  runFunction,
  toolName,
  truncateList,
  type FunctionDef,
} from '../src/registry';
import type { ToolClass } from '../src/config';
import { VereinOnlineError } from '../src/client';
import { EXPECTED } from './expected-functions';
import { callTool, connectClient, fakeConfig, fakeProfile, makeCall } from './helpers';

function def(partial: Partial<FunctionDef> = {}): FunctionDef {
  return {
    api: 'GetMembers',
    toolset: 'members',
    klass: 'read',
    description: 'Test function.',
    params: {},
    ...partial,
  };
}

async function setup(defs: FunctionDef[], configOverrides = {}, result: unknown = []) {
  const config = fakeConfig(configOverrides);
  const call = makeCall(result);
  const server = new McpServer({ name: 't', version: '0' });
  const names = registerAll(server, defs, config, call);
  const client = await connectClient(server);
  return { client, call, names, config };
}

describe('EXPECTED', () => {
  it('has 47 entries split 27/15/4/1', () => {
    const entries = Object.values(EXPECTED);
    expect(entries).toHaveLength(47);
    const count = (k: ToolClass) => entries.filter((e) => e.klass === k).length;
    expect(count('read')).toBe(27);
    expect(count('write')).toBe(15);
    expect(count('delete')).toBe(4);
    expect(count('send')).toBe(1);
  });
});

describe('toolName conversion', () => {
  it('converts API names to vo_ snake_case', () => {
    expect(toolName('GetMembers')).toBe('vo_get_members');
    expect(toolName('CreateListData')).toBe('vo_create_list_data');
    expect(toolName('GetNewsletterBeitrag')).toBe('vo_get_newsletter_beitrag');
  });
});

describe('isEnabled matrix', () => {
  const classes: ToolClass[] = ['read', 'write', 'delete', 'send'];
  for (const klass of classes) {
    for (const toolsetOn of [true, false]) {
      for (const flag of [true, false]) {
        const expected = toolsetOn && (klass === 'read' || flag);
        it(`${klass}, toolset ${toolsetOn ? 'on' : 'off'}, flag ${flag ? 'on' : 'off'} -> ${expected}`, () => {
          const config = fakeConfig({
            toolsets: new Set(toolsetOn ? ['members'] : ['news']),
            allow: { write: flag, delete: flag, send: flag },
          });
          expect(isEnabled(def({ klass }), config)).toBe(expected);
        });
      }
    }
  }
});

describe('registerAll registers only enabled', () => {
  it('returns names of enabled definitions and exposes only those', async () => {
    const defs = [
      def({ api: 'GetMembers' }),
      def({ api: 'CreateMember', klass: 'write' }),
      def({ api: 'GetNews', toolset: 'news' }),
    ];
    const { client, names } = await setup(defs, { toolsets: new Set(['members']) });
    expect(names).toEqual(['vo_get_members']);
    const listed = (await client.listTools()).tools.map((t) => t.name);
    expect(listed).toEqual(['vo_get_members']);
  });
});

describe('confirm handling', () => {
  const allow = { write: true, delete: true, send: true };

  it('delete without confirm is refused and makes no call', async () => {
    const d = def({ api: 'DeleteMember', klass: 'delete', params: { id: z.number() } });
    const { client, call } = await setup([d], { allow });
    const res = await callTool(client, 'vo_delete_member', { id: 1 });
    expect(res.isError).toBe(true);
    expect(call.calls).toHaveLength(0);
    const ok = await callTool(client, 'vo_delete_member', { id: 1, confirm: true });
    expect(ok.isError).toBeFalsy();
    expect(call.calls).toHaveLength(1);
  });

  it('confirm: false is refused for delete', async () => {
    const d = def({ api: 'DeleteMember', klass: 'delete' });
    const { client, call } = await setup([d], { allow });
    const res = await callTool(client, 'vo_delete_member', { confirm: false });
    expect(res.isError).toBe(true);
    expect(call.calls).toHaveLength(0);
  });

  it('send without confirm is refused', async () => {
    const d = def({ api: 'SendLogin', toolset: 'auth', klass: 'send' });
    const { client, call } = await setup([d], { allow, toolsets: new Set(['auth']) });
    const res = await callTool(client, 'vo_send_login', {});
    expect(res.isError).toBe(true);
    expect(call.calls).toHaveLength(0);
  });

  it('runFunction enforces confirm at runtime without schema', async () => {
    const call = makeCall();
    const config = fakeConfig({ allow });
    await expect(runFunction(def({ klass: 'delete' }), {}, config, call)).rejects.toBeInstanceOf(GateError);
    await expect(runFunction(def({ klass: 'send' }), { confirm: 'true' }, config, call)).rejects.toBeInstanceOf(GateError);
    expect(call.calls).toHaveLength(0);
  });

  it('confirm only present (and required) for delete and send', async () => {
    const defs = [
      def({ api: 'GetMembers', klass: 'read' }),
      def({ api: 'CreateMember', klass: 'write' }),
      def({ api: 'DeleteMember', klass: 'delete' }),
      def({ api: 'SendLogin', klass: 'send' }),
    ];
    const { client } = await setup(defs, { allow });
    const tools = (await client.listTools()).tools;
    const schema = (n: string) => tools.find((t) => t.name === n)!.inputSchema as {
      properties?: Record<string, unknown>;
      required?: string[];
    };
    expect(schema('vo_get_members').properties?.confirm).toBeUndefined();
    expect(schema('vo_create_member').properties?.confirm).toBeUndefined();
    for (const n of ['vo_delete_member', 'vo_send_login']) {
      expect(schema(n).properties?.confirm).toBeDefined();
      expect(schema(n).required).toContain('confirm');
    }
  });

  it('a write def may declare its own optional confirm and it is stripped and guard-visible', async () => {
    const seen: unknown[] = [];
    const d = def({
      klass: 'write',
      params: { confirm: z.boolean().optional(), id: z.number() },
      guard: (args) => seen.push(args.confirm),
    });
    const call = makeCall();
    await runFunction(d, { id: 1, confirm: true }, fakeConfig({ allow: { write: true, delete: false, send: false } }), call);
    expect(seen).toEqual([true]);
    expect(call.calls[0]!.params).toEqual({ id: 1 });
  });
});

describe('truncateList cases', () => {
  const arr = (n: number) => Array.from({ length: n }, (_, i) => i);
  it('truncates 312 to 50', () => {
    const r = truncateList(arr(312), 50) as { total: number; shown: number; truncated: boolean; items: unknown[] };
    expect(r.total).toBe(312);
    expect(r.shown).toBe(50);
    expect(r.truncated).toBe(true);
    expect(r.items).toHaveLength(50);
    expect(r.items[0]).toBe(0);
  });
  it('exactly 50 is not truncated', () => {
    const r = truncateList(arr(50), 50) as { truncated: boolean; shown: number };
    expect(r.truncated).toBe(false);
    expect(r.shown).toBe(50);
  });
  it('empty array', () => {
    expect(truncateList([], 50)).toEqual({ total: 0, shown: 0, truncated: false, items: [] });
  });
  it('non-arrays are returned unchanged', () => {
    expect(truncateList('x', 50)).toBe('x');
    const o = {};
    expect(truncateList(o, 50)).toBe(o);
  });
  it('list tools default maxResults to 50 and honor an explicit value', async () => {
    const d = def({ list: true });
    const { client } = await setup([d], {}, arr(120));
    const a = JSON.parse((await callTool(client, 'vo_get_members', {})).text);
    expect(a).toMatchObject({ total: 120, shown: 50, truncated: true });
    const b = JSON.parse((await callTool(client, 'vo_get_members', { maxResults: 10 })).text);
    expect(b).toMatchObject({ total: 120, shown: 10, truncated: true });
  });
  it('list tool with non-array result returns it unchanged', async () => {
    const { client } = await setup([def({ list: true })], {}, { a: 1 });
    expect(JSON.parse((await callTool(client, 'vo_get_members', {})).text)).toEqual({ a: 1 });
  });
  it('non-list tools have no maxResults param', async () => {
    const { client } = await setup([def()]);
    const props = (await client.listTools()).tools[0]!.inputSchema.properties ?? {};
    expect(props.maxResults).toBeUndefined();
  });
});

describe('openFields merging and precedence', () => {
  it('merges daten flat into the body', async () => {
    const d = def({ klass: 'write', openFields: true, params: { vorname: z.string().optional() } });
    const call = makeCall();
    await runFunction(d, { vorname: 'A', daten: { key_Hobby: 'Tennis' } }, fakeConfig({ allow: { write: true, delete: false, send: false } }), call);
    expect(call.calls[0]!.params).toEqual({ vorname: 'A', key_Hobby: 'Tennis' });
  });
  it('named parameters win over daten', async () => {
    const d = def({ klass: 'write', openFields: true, params: { vorname: z.string().optional() } });
    const call = makeCall();
    await runFunction(d, { vorname: 'A', daten: { vorname: 'B', x: 1 } }, fakeConfig({ allow: { write: true, delete: false, send: false } }), call);
    expect(call.calls[0]!.params).toEqual({ vorname: 'A', x: 1 });
  });
  it('daten param exists only with openFields', async () => {
    const { client } = await setup([def({ api: 'A1', openFields: true }), def({ api: 'A2' })]);
    const tools = (await client.listTools()).tools;
    expect(tools.find((t) => t.name === 'vo_a1')!.inputSchema.properties?.daten).toBeDefined();
    expect(tools.find((t) => t.name === 'vo_a2')!.inputSchema.properties?.daten).toBeUndefined();
  });
  it('daten accepts flat values through the protocol', async () => {
    const { client, call } = await setup([def({ openFields: true })]);
    const res = await callTool(client, 'vo_get_members', { daten: { key_Hobby: 'Tennis', n: 1, b: true } });
    expect(res.isError).toBeFalsy();
    expect(call.calls[0]!.params).toEqual({ key_Hobby: 'Tennis', n: 1, b: true });
  });
});

describe('control params never reach the body', () => {
  it('strips maxResults, confirm, verein and daten', async () => {
    const d = def({ klass: 'delete', list: true, openFields: true, params: { id: z.number() } });
    const config = fakeConfig({
      profiles: [fakeProfile('a'), fakeProfile('b')],
      allow: { write: true, delete: true, send: true },
    });
    const call = makeCall();
    await runFunction(d, { id: 3, maxResults: 5, confirm: true, verein: 'b', daten: { k: 'v' } }, config, call);
    expect(call.calls[0]!.params).toEqual({ id: 3, k: 'v' });
    expect(call.calls[0]!.profile.name).toBe('b');
    expect(call.calls[0]!.fn).toBe('GetMembers');
  });
});

describe('verein parameter', () => {
  const two = { profiles: [fakeProfile('alpha'), fakeProfile('beta')] };

  it('single profile has no verein param and uses that profile', async () => {
    const { client, call } = await setup([def()]);
    const props = (await client.listTools()).tools[0]!.inputSchema.properties ?? {};
    expect(props.verein).toBeUndefined();
    await callTool(client, 'vo_get_members', {});
    expect(call.calls[0]!.profile.name).toBe('default');
  });

  it('multiple profiles require verein as enum of names', async () => {
    const { client, call } = await setup([def()], two);
    const schema = (await client.listTools()).tools[0]!.inputSchema as {
      properties?: Record<string, { enum?: string[] }>;
      required?: string[];
    };
    expect(schema.properties?.verein?.enum).toEqual(['alpha', 'beta']);
    expect(schema.required).toContain('verein');
    const res = await callTool(client, 'vo_get_members', { verein: 'beta' });
    expect(res.isError).toBeFalsy();
    expect(call.calls[0]!.profile.name).toBe('beta');
  });

  it('unknown or missing verein names valid ones and makes no call', async () => {
    const call = makeCall();
    const config = fakeConfig(two);
    for (const args of [{ verein: 'gamma' }, {}]) {
      const err = await runFunction(def(), args, config, call).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(GateError);
      expect((err as Error).message).toContain('alpha');
      expect((err as Error).message).toContain('beta');
    }
    expect(call.calls).toHaveLength(0);

    const { client, call: call2 } = await setup([def()], two);
    const res = await callTool(client, 'vo_get_members', { verein: 'gamma' });
    expect(res.isError).toBe(true);
    expect(call2.calls).toHaveLength(0);
  });
});

describe('guard, errors, postProcess', () => {
  it('guard runs before call', async () => {
    const order: string[] = [];
    const d = def({
      guard: () => {
        order.push('guard');
        throw new GateError('nope');
      },
    });
    const call = makeCall();
    const wrapped = (async (...a: Parameters<typeof call>) => {
      order.push('call');
      return call(...a);
    }) as typeof call;
    await expect(runFunction(d, {}, fakeConfig(), wrapped)).rejects.toThrow('nope');
    expect(order).toEqual(['guard']);
  });

  it('guard receives args and config', async () => {
    let got: unknown[] = [];
    const config = fakeConfig();
    await runFunction(def({ guard: (a, c) => (got = [a, c]) }), { x: 1 }, config, makeCall());
    expect(got[0]).toMatchObject({ x: 1 });
    expect(got[1]).toBe(config);
  });

  it('errors become isError results', async () => {
    const guarded = def({ api: 'G1', guard: () => { throw new GateError('gate says no'); } });
    const { client } = await setup([guarded]);
    const g = await callTool(client, 'vo_g1', {});
    expect(g).toEqual({ isError: true, text: 'gate says no' });

    const config = fakeConfig();
    const server = new McpServer({ name: 't', version: '0' });
    const failing = async () => { throw new VereinOnlineError('API said bad', 'api'); };
    registerAll(server, [def()], config, failing);
    const c2 = await connectClient(server);
    expect(await callTool(c2, 'vo_get_members', {})).toEqual({ isError: true, text: 'API said bad' });
  });

  it('unknown errors do not leak internals', async () => {
    const server = new McpServer({ name: 't', version: '0' });
    registerAll(server, [def()], fakeConfig(), async () => { throw new Error('secret-pw at /internal/path'); });
    const client = await connectClient(server);
    const res = await callTool(client, 'vo_get_members', {});
    expect(res.isError).toBe(true);
    expect(res.text).toContain('Internal error');
    expect(res.text).not.toContain('secret-pw');
    expect(res.text).not.toContain('/internal');
  });

  it('success is JSON text content', async () => {
    const { client } = await setup([def()], {}, { a: [1, 2] });
    const res = await callTool(client, 'vo_get_members', {});
    expect(res.isError).toBeFalsy();
    expect(res.text).toBe(JSON.stringify({ a: [1, 2] }));
  });

  it('postProcess runs before truncation', async () => {
    const d = def({
      list: true,
      postProcess: (r) => (r as { rows: unknown[] }).rows,
    });
    const call = makeCall({ rows: Array.from({ length: 80 }, (_, i) => i) });
    const out = await runFunction(d, { maxResults: 20 }, fakeConfig(), call);
    expect(out).toMatchObject({ total: 80, shown: 20, truncated: true });
  });
});

describe('mayMail note in description', () => {
  it('appends the hint only when mayMail is set', async () => {
    const { client } = await setup([
      def({ api: 'M1', mayMail: true, description: 'Does a thing.' }),
      def({ api: 'M2', description: 'Does another.' }),
    ]);
    const tools = (await client.listTools()).tools;
    expect(tools.find((t) => t.name === 'vo_m1')!.description).toBe('Does a thing. May send e-mail (unverified).');
    expect(tools.find((t) => t.name === 'vo_m2')!.description).toBe('Does another.');
  });
});

describe('daten cannot bypass guards or stripping', () => {
  const okConfig = () => fakeConfig({ allow: { write: true, delete: false, send: false } });

  it('control keys inside daten never reach the body', async () => {
    const d = def({ klass: 'write', openFields: true, params: { id: z.number() } });
    const call = makeCall();
    await runFunction(d, { id: 1, daten: { confirm: true, verein: 'x', maxResults: 1, daten: {}, key_A: 'v' } }, okConfig(), call);
    expect(call.calls[0]!.params).toEqual({ id: 1, key_A: 'v' });
  });

  const mailGuard = (_a: Record<string, unknown>, _c: unknown, body: Record<string, unknown>) => {
    if (body.mail) throw new GateError('mail not allowed');
  };

  it('guard sees merged daten and refuses mail=1 without a call', async () => {
    const d = def({ klass: 'write', openFields: true, guard: mailGuard });
    const call = makeCall();
    await expect(runFunction(d, { daten: { mail: 1 } }, okConfig(), call)).rejects.toThrow('mail not allowed');
    expect(call.calls).toHaveLength(0);
  });

  it('same guard allows the call without mail', async () => {
    const d = def({ klass: 'write', openFields: true, guard: mailGuard });
    const call = makeCall();
    await runFunction(d, { daten: { key_A: 'v' } }, okConfig(), call);
    expect(call.calls).toHaveLength(1);
  });
});

describe('maxResults clamp (1..500, else default 50)', () => {
  const rows = Array.from({ length: 700 }, (_, i) => i);
  const shown = async (maxResults: unknown) => {
    const out = (await runFunction(def({ list: true }), { maxResults }, fakeConfig(), makeCall(rows))) as {
      shown: number;
      total: number;
    };
    return out.shown;
  };

  for (const bad of [-1, 0, 2.5, 501, 1e9, Number.NaN, Infinity, '5', null, true]) {
    it(`maxResults=${String(bad)} falls back to 50`, async () => {
      expect(await shown(bad)).toBe(50);
    });
  }
  for (const [given, expected] of [[1, 1], [5, 5], [500, 500], [undefined, 50]] as const) {
    it(`maxResults=${String(given)} yields ${expected}`, async () => {
      expect(await shown(given)).toBe(expected);
    });
  }
  it('clampMaxResults is exported with the same rule', () => {
    expect([clampMaxResults(-1), clampMaxResults(7), clampMaxResults(501), clampMaxResults('9')]).toEqual([50, 7, 50, 50]);
  });
  it('the tool schema caps maxResults at 500 and refuses 501 at the protocol level', async () => {
    const { client, call } = await setup([def({ list: true })], {}, rows);
    const props = (await client.listTools()).tools[0]!.inputSchema.properties as Record<string, { maximum?: number }>;
    expect(props.maxResults?.maximum).toBe(500);
    const res = await callTool(client, 'vo_get_members', { maxResults: 501 });
    expect(res.isError).toBe(true);
    expect(call.calls).toHaveLength(0);
  });
  it('buildShape is exported and adds the extras', () => {
    const d = def({ list: true, openFields: true, klass: 'delete' });
    const shape = buildShape(d, fakeConfig({ profiles: [fakeProfile('a'), fakeProfile('b')] }));
    expect(Object.keys(shape).sort()).toEqual(['confirm', 'daten', 'maxResults', 'verein']);
  });
});

describe('finalizeResult', () => {
  const objOf = (n: number) =>
    Object.fromEntries(Array.from({ length: n }, (_, i) => [`k${i}`, { id: i }])) as Record<string, unknown>;
  const stringOfJsonLength = (n: number) => 'x'.repeat(n - 2); // JSON.stringify adds two quotes

  it('truncates arrays', () => {
    expect(finalizeResult(Array.from({ length: 60 }, (_, i) => i), 50)).toMatchObject({ total: 60, shown: 50, truncated: true });
  });
  it('truncates an id-keyed object list (more than maxResults keys, all object values)', () => {
    const out = finalizeResult(objOf(60), 50) as { total: number; shown: number; truncated: boolean; items: Record<string, unknown> };
    expect(out.total).toBe(60);
    expect(out.shown).toBe(50);
    expect(out.truncated).toBe(true);
    expect(Object.keys(out.items)).toEqual(Array.from({ length: 50 }, (_, i) => `k${i}`));
  });
  it('leaves an object with exactly maxResults keys, or with a non-object value, unchanged', () => {
    const exact = objOf(50);
    expect(finalizeResult(exact, 50)).toBe(exact);
    const mixed = { ...objOf(60), scalar: 1 };
    expect(finalizeResult(mixed, 50)).toBe(mixed);
    const withNull = { ...objOf(60), n: null };
    expect(finalizeResult(withNull, 50)).toBe(withNull);
  });
  it('small non-list results are returned unchanged', () => {
    const r = { a: 1, b: [1, 2, 3] };
    expect(finalizeResult(r, 50)).toBe(r);
    expect(finalizeResult('x', 50)).toBe('x');
  });
  it('exactly 100000 characters passes, 100001 triggers the cap envelope', () => {
    const ok = stringOfJsonLength(100_000);
    expect(JSON.stringify(ok)).toHaveLength(100_000);
    expect(finalizeResult(ok, 50)).toBe(ok);
    const big = stringOfJsonLength(100_001);
    expect(JSON.stringify(big)).toHaveLength(100_001);
    const out = finalizeResult(big, 50) as { truncated: boolean; totalChars: number; note: string; preview: string };
    expect(out.truncated).toBe(true);
    expect(out.totalChars).toBe(100_001);
    expect(out.preview).toHaveLength(20_000);
    expect(out.preview).toBe(JSON.stringify(big).slice(0, 20_000));
    expect(out.note).toBe(
      'Response too large (100001 characters); showing the first 20000 characters. Narrow with felder, filter or maxResults.',
    );
    expect(Object.keys(out).sort()).toEqual(['note', 'preview', 'totalChars', 'truncated']);
  });
  it('the cap applies to the already truncated value', () => {
    const items = Array.from({ length: 5 }, () => 'y'.repeat(30_000));
    const out = finalizeResult(items, 5) as { truncated: boolean; totalChars?: number };
    expect(out.totalChars).toBeGreaterThan(100_000);
    expect(out.truncated).toBe(true);
  });
  it('lists:false skips array/object truncation but keeps the size cap', () => {
    const arr = Array.from({ length: 80 }, (_, i) => i);
    expect(finalizeResult(arr, 50, { lists: false })).toBe(arr);
    const big = stringOfJsonLength(100_001);
    expect(finalizeResult(big, 50, { lists: false })).toMatchObject({ truncated: true, totalChars: 100_001 });
  });
  it('runFunction applies it: non-list tool with a huge field gets the envelope, list tool with an object list is truncated', async () => {
    const huge = { html: 'h'.repeat(150_000) };
    const out = (await runFunction(def(), {}, fakeConfig(), makeCall(huge))) as { truncated: boolean; preview: string };
    expect(out.truncated).toBe(true);
    expect(out.preview).toHaveLength(20_000);
    const lst = await runFunction(def({ list: true }), { maxResults: 10 }, fakeConfig(), makeCall(objOf(30)));
    expect(lst).toMatchObject({ total: 30, shown: 10, truncated: true });
    const small = { a: 1 };
    expect(await runFunction(def(), {}, fakeConfig(), makeCall(small))).toEqual(small);
  });
  it('a non-list tool keeps a small array unchanged', async () => {
    const arr = Array.from({ length: 80 }, (_, i) => i);
    expect(await runFunction(def(), {}, fakeConfig(), makeCall(arr))).toEqual(arr);
  });
});
