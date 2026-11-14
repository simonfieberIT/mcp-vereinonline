import { describe, it, expect, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { GateError, type FunctionDef } from '../src/registry';
import { registerRaw, runRaw } from '../src/raw';
import { EVENTS } from '../src/definitions/events';
import { ALL_TOOLSETS } from '../src/config';
import { callTool, connectClient, fakeConfig, fakeProfile, makeCall } from './helpers';

const defs: FunctionDef[] = [
  { api: 'GetMembers', toolset: 'members', klass: 'read', description: 'd', params: { id: z.number().optional() }, list: true },
  { api: 'DeleteMember', toolset: 'members', klass: 'delete', description: 'd', params: { id: z.number() } },
  {
    api: 'CheckLogin',
    toolset: 'auth',
    klass: 'read',
    description: 'd',
    params: {},
    postProcess: (r) => {
      const { token: _token, ...rest } = r as Record<string, unknown>;
      return rest;
    },
  },
  { api: 'CreateMember', toolset: 'members', klass: 'write', description: 'd', params: {} },
  { api: 'SendNewsletter', toolset: 'newsletter', klass: 'send', description: 'd', params: {} },
];

const allOn = { write: true, delete: true, send: true };

async function setup(configOverrides = {}, result: unknown = { ok: true }) {
  const config = fakeConfig(configOverrides);
  const call = makeCall(result);
  const server = new McpServer({ name: 't', version: '0' });
  registerRaw(server, defs, config, call);
  const client = await connectClient(server);
  return { client, call };
}

describe('vo_raw', () => {
  it('is always registered', async () => {
    const { client } = await setup();
    const tools = await client.listTools();
    expect(tools.tools.map((t) => t.name)).toContain('vo_raw');
  });

  it('known read function passes', async () => {
    const { client, call } = await setup({}, [{ id: 1 }]);
    const res = await callTool(client, 'vo_raw', { function: 'GetMembers', params: { id: 1 } });
    expect(res.isError).toBeFalsy();
    expect(call.calls).toHaveLength(1);
    expect(call.calls[0]?.fn).toBe('GetMembers');
    expect(call.calls[0]?.params).toEqual({ id: 1 });
    expect(JSON.parse(res.text).total).toBe(1);
  });

  it('known function in disabled toolset is refused', async () => {
    const { client, call } = await setup();
    const res = await callTool(client, 'vo_raw', { function: 'CheckLogin' });
    expect(res.isError).toBe(true);
    expect(call.calls).toHaveLength(0);
  });

  it('known function with disabled class is refused', async () => {
    const { client, call } = await setup();
    const res = await callTool(client, 'vo_raw', { function: 'CreateMember', confirm: true });
    expect(res.isError).toBe(true);
    expect(call.calls).toHaveLength(0);
  });

  it('known delete needs flag and confirm', async () => {
    let s = await setup();
    let res = await callTool(s.client, 'vo_raw', { function: 'DeleteMember', params: { id: 1 }, confirm: true });
    expect(res.isError).toBe(true);
    expect(s.call.calls).toHaveLength(0);

    s = await setup({ allow: { write: false, delete: true, send: false } });
    res = await callTool(s.client, 'vo_raw', { function: 'DeleteMember', params: { id: 1 } });
    expect(res.isError).toBe(true);
    expect(s.call.calls).toHaveLength(0);

    res = await callTool(s.client, 'vo_raw', { function: 'DeleteMember', params: { id: 1 }, confirm: true });
    expect(res.isError).toBeFalsy();
    expect(s.call.calls).toHaveLength(1);
    expect(s.call.calls[0]?.params).toEqual({ id: 1 });
  });

  it('confirm inside params does not count', async () => {
    const s = await setup({ allow: allOn });
    const res = await callTool(s.client, 'vo_raw', { function: 'DeleteMember', params: { id: 1, confirm: true } });
    expect(res.isError).toBe(true);
    expect(s.call.calls).toHaveLength(0);
  });

  it('unknown Get name allowed', async () => {
    const { client, call } = await setup();
    const res = await callTool(client, 'vo_raw', { function: 'GetSomethingNew', params: { a: 1 } });
    expect(res.isError).toBeFalsy();
    expect(call.calls[0]?.fn).toBe('GetSomethingNew');
    expect(call.calls[0]?.params).toEqual({ a: 1 });
  });

  it('unknown Check name allowed', async () => {
    const { client, call } = await setup();
    const res = await callTool(client, 'vo_raw', { function: 'CheckSomething' });
    expect(res.isError).toBeFalsy();
    expect(call.calls[0]?.params).toEqual({});
  });

  it('unknown array results are truncated at the default 50', async () => {
    const big = Array.from({ length: 200 }, (_, i) => i);
    const { client } = await setup({}, big);
    const res = JSON.parse((await callTool(client, 'vo_raw', { function: 'GetSomethingNew' })).text);
    expect(res).toMatchObject({ total: 200, shown: 50, truncated: true });
    expect(res.items).toEqual(big.slice(0, 50));
  });

  it('unknown array results honor the top-level raw maxResults', async () => {
    const big = Array.from({ length: 200 }, (_, i) => i);
    const { client } = await setup({}, big);
    const res = JSON.parse((await callTool(client, 'vo_raw', { function: 'GetSomethingNew', maxResults: 7 })).text);
    expect(res).toMatchObject({ total: 200, shown: 7, truncated: true });
  });

  it('unknown id-keyed object lists are truncated', async () => {
    const obj = Object.fromEntries(Array.from({ length: 80 }, (_, i) => [`${i}`, { id: i }]));
    const { client } = await setup({}, obj);
    const res = JSON.parse((await callTool(client, 'vo_raw', { function: 'CheckSomething', maxResults: 10 })).text);
    expect(res).toMatchObject({ total: 80, shown: 10, truncated: true });
    expect(Object.keys(res.items)).toHaveLength(10);
  });

  it('unknown results over 100000 characters get the size-cap envelope', async () => {
    const { client } = await setup({}, { body: 'b'.repeat(150_000) });
    const res = JSON.parse((await callTool(client, 'vo_raw', { function: 'GetSomethingNew' })).text);
    expect(res.truncated).toBe(true);
    expect(res.preview).toHaveLength(20_000);
    expect(res.totalChars).toBeGreaterThan(150_000);
  });

  it('small unknown non-list results are unchanged', async () => {
    const { client } = await setup({}, { a: 1, list: [1, 2, 3] });
    const res = JSON.parse((await callTool(client, 'vo_raw', { function: 'GetSomethingNew' })).text);
    expect(res).toEqual({ a: 1, list: [1, 2, 3] });
  });

  it('known list function via raw is truncated with the raw maxResults', async () => {
    const big = Array.from({ length: 200 }, (_, i) => i);
    const { client } = await setup({}, big);
    const res = JSON.parse((await callTool(client, 'vo_raw', { function: 'GetMembers', maxResults: 3 })).text);
    expect(res).toMatchObject({ total: 200, shown: 3, truncated: true });
  });

  it('invalid raw maxResults is refused without a call (-1, 0, 1e9, 2.5, string)', async () => {
    const { client, call } = await setup({}, [1, 2, 3]);
    for (const maxResults of [-1, 0, 1e9, 501, 2.5, '5']) {
      const res = await callTool(client, 'vo_raw', { function: 'GetSomethingNew', maxResults });
      expect(res.isError).toBe(true);
    }
    expect(call.calls).toHaveLength(0);
  });

  it('runRaw clamps an invalid maxResults to 50 when called directly', async () => {
    const big = Array.from({ length: 200 }, (_, i) => i);
    for (const maxResults of [-1, 0, 1e9, '5']) {
      const call = makeCall(big);
      const res = (await runRaw({ function: 'GetSomethingNew', maxResults }, defs, fakeConfig(), call)) as { shown: number };
      expect(res.shown).toBe(50);
    }
  });

  describe('schema validation of known functions', () => {
    it('undeclared key is refused and names the key, zero calls', async () => {
      const { client, call } = await setup();
      const res = await callTool(client, 'vo_raw', { function: 'GetMembers', params: { id: 1, bogus: 'x' } });
      expect(res.isError).toBe(true);
      expect(res.text).toContain('bogus');
      expect(call.calls).toHaveLength(0);
    });

    it('invalid field value is refused and names the field', async () => {
      const { client, call } = await setup();
      const res = await callTool(client, 'vo_raw', { function: 'GetMembers', params: { id: 'abc' } });
      expect(res.isError).toBe(true);
      expect(res.text).toContain('id');
      expect(call.calls).toHaveLength(0);
    });

    it('missing required field is refused (DeleteMember without id), zero calls', async () => {
      const { client, call } = await setup({ allow: allOn });
      const res = await callTool(client, 'vo_raw', { function: 'DeleteMember', params: {}, confirm: true });
      expect(res.isError).toBe(true);
      expect(res.text).toContain('id');
      expect(call.calls).toHaveLength(0);
      const res2 = await callTool(client, 'vo_raw', { function: 'DeleteMember', confirm: true });
      expect(res2.isError).toBe(true);
      expect(call.calls).toHaveLength(0);
    });

    it('params.maxResults of a known list function is validated (-1, 0, 1e9, string refused)', async () => {
      const { client, call } = await setup();
      for (const maxResults of [-1, 0, 1e9, '5']) {
        const res = await callTool(client, 'vo_raw', { function: 'GetMembers', params: { maxResults } });
        expect(res.isError).toBe(true);
      }
      expect(call.calls).toHaveLength(0);
      const ok = await callTool(client, 'vo_raw', { function: 'GetMembers', params: { maxResults: 5 } });
      expect(ok.isError).toBeFalsy();
      expect(call.calls[0]?.params).toEqual({}); // control key, never part of the body
    });

    it('undeclared key on a function without declared params is refused', async () => {
      const { client, call } = await setup({ allow: allOn });
      const res = await callTool(client, 'vo_raw', { function: 'CreateMember', params: { vorname: 'A' }, confirm: true });
      expect(res.isError).toBe(true);
      expect(call.calls).toHaveLength(0);
    });

    it('unknown function names keep passing params through unchanged', async () => {
      const { client, call } = await setup();
      await callTool(client, 'vo_raw', { function: 'GetSomethingNew', params: { anything: [1, { b: 2 }], x: 'y' } });
      expect(call.calls[0]?.params).toEqual({ anything: [1, { b: 2 }], x: 'y' });
    });

    it("confirm:'true' (string) is refused at the protocol level, zero calls", async () => {
      const { client, call } = await setup({ allow: allOn });
      const res = await callTool(client, 'vo_raw', { function: 'DeleteMember', params: { id: 1 }, confirm: 'true' });
      expect(res.isError).toBe(true);
      expect(call.calls).toHaveLength(0);
    });

    it("runRaw refuses confirm:'true' (string) for a known delete function directly", async () => {
      const call = makeCall();
      await expect(
        runRaw({ function: 'DeleteMember', params: { id: 1 }, confirm: 'true' }, defs, fakeConfig({ allow: allOn }), call),
      ).rejects.toBeInstanceOf(GateError);
      expect(call.calls).toHaveLength(0);
    });

    it('non-object params (string, array, null) are refused, zero calls', async () => {
      const { client, call } = await setup();
      for (const params of ['x', [1], null]) {
        const res = await callTool(client, 'vo_raw', { function: 'GetSomethingNew', params });
        expect(res.isError).toBe(true);
      }
      expect(call.calls).toHaveLength(0);
      for (const params of ['x', [1], null, 5]) {
        await expect(runRaw({ function: 'GetSomethingNew', params }, defs, fakeConfig(), call)).rejects.toBeInstanceOf(GateError);
        await expect(runRaw({ function: 'GetMembers', params }, defs, fakeConfig(), call)).rejects.toBeInstanceOf(GateError);
      }
      expect(call.calls).toHaveLength(0);
    });
  });

  it('unknown other name needs all three flags and confirm', async () => {
    const { client, call } = await setup({ allow: allOn });
    const res = await callTool(client, 'vo_raw', {
      function: 'FrobnicateThing',
      params: { x: 'y', confirm: false, verein: 'zzz', maxResults: 3, daten: { k: 1 } },
      confirm: true,
    });
    expect(res.isError).toBeFalsy();
    expect(call.calls).toHaveLength(1);
    expect(call.calls[0]?.fn).toBe('FrobnicateThing');
    expect(call.calls[0]?.params).toEqual({ x: 'y' });
  });

  it('unknown other name without confirm is refused', async () => {
    const { client, call } = await setup({ allow: allOn });
    const res = await callTool(client, 'vo_raw', { function: 'FrobnicateThing' });
    expect(res.isError).toBe(true);
    expect(call.calls).toHaveLength(0);
  });

  it('unknown other name refused with only write flag', async () => {
    const { client, call } = await setup({ allow: { write: true, delete: false, send: false } });
    const res = await callTool(client, 'vo_raw', { function: 'FrobnicateThing', confirm: true });
    expect(res.isError).toBe(true);
    expect(call.calls).toHaveLength(0);
  });

  it('invalid function name refused', async () => {
    const { client, call } = await setup({ allow: allOn });
    for (const name of ['Get&api=Delete', 'Get Members', 'Get/x', '1Get', '', 'Get_x', 'GetÄ']) {
      const res = await callTool(client, 'vo_raw', { function: name, confirm: true });
      expect(res.isError).toBe(true);
    }
    expect(call.calls).toHaveLength(0);
  });

  it('unknown other name refused when any single flag is missing', async () => {
    const cases = [
      { write: false, delete: true, send: true },
      { write: true, delete: false, send: true },
      { write: true, delete: true, send: false },
    ];
    for (const allow of cases) {
      const { client, call } = await setup({ allow });
      const res = await callTool(client, 'vo_raw', { function: 'FrobnicateThing', confirm: true });
      expect(res.isError).toBe(true);
      expect(call.calls).toHaveLength(0);
    }
  });

  it('case variant of known name in disabled toolset is refused', async () => {
    const { client, call } = await setup();
    for (const name of ['Checklogin', 'CHECKLogin']) {
      const res = await callTool(client, 'vo_raw', { function: name });
      expect(res.isError).toBe(true);
    }
    expect(call.calls).toHaveLength(0);
  });

  it('case variant of known name uses def rules and canonical name', async () => {
    const { client, call } = await setup({ toolsets: new Set(ALL_TOOLSETS) }, { token: 'abc123', user: 'u' });
    const res = await callTool(client, 'vo_raw', { function: 'Checklogin' });
    expect(res.isError).toBeFalsy();
    expect(res.text).not.toContain('abc123');
    expect(call.calls[0]?.fn).toBe('CheckLogin');
  });

  it('lowercase delete name needs confirm; uppercase with confirm uses canonical name', async () => {
    const { client, call } = await setup({ allow: { write: false, delete: true, send: false } });
    const res = await callTool(client, 'vo_raw', { function: 'deletemember', params: { id: 1 } });
    expect(res.isError).toBe(true);
    expect(call.calls).toHaveLength(0);
    const ok = await callTool(client, 'vo_raw', { function: 'DELETEMEMBER', params: { id: 1 }, confirm: true });
    expect(ok.isError).toBeFalsy();
    expect(call.calls).toHaveLength(1);
    expect(call.calls[0]?.fn).toBe('DeleteMember');
  });

  it('CheckLogin via raw strips token', async () => {
    const config = { toolsets: new Set(ALL_TOOLSETS) };
    const { client } = await setup(config, { token: 'abc123', user: 'u' });
    const res = await callTool(client, 'vo_raw', { function: 'CheckLogin' });
    expect(res.isError).toBeFalsy();
    expect(res.text).not.toContain('abc123');
    expect(JSON.parse(res.text)).toEqual({ user: 'u' });
  });

  it('formats unexpected errors generically', async () => {
    const config = fakeConfig();
    const server = new McpServer({ name: 't', version: '0' });
    registerRaw(server, defs, config, async () => {
      throw new Error('secret-pw leaked');
    });
    const client = await connectClient(server);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await callTool(client, 'vo_raw', { function: 'GetSomethingNew' });
    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls.flat().join(' ')).not.toContain('secret-pw');
    spy.mockRestore();
    expect(res.isError).toBe(true);
    expect(res.text).not.toContain('secret-pw');
    expect(res.text).toContain('Internal error');
  });

  describe('verein handling matches other tools', () => {
    const two = { profiles: [fakeProfile('a'), fakeProfile('b')] };

    it('single profile: verein not in schema, profile used', async () => {
      const { client, call } = await setup();
      const tools = await client.listTools();
      const raw = tools.tools.find((t) => t.name === 'vo_raw');
      expect(Object.keys(raw?.inputSchema.properties ?? {})).not.toContain('verein');
      await callTool(client, 'vo_raw', { function: 'GetSomethingNew' });
      expect(call.calls[0]?.profile.name).toBe('default');
    });

    it('multiple profiles: verein required in schema', async () => {
      const { client } = await setup(two);
      const tools = await client.listTools();
      const raw = tools.tools.find((t) => t.name === 'vo_raw');
      expect(raw?.inputSchema.required).toContain('verein');
    });

    it('multiple profiles: selects named profile, never sends verein in body', async () => {
      const { client, call } = await setup(two);
      await callTool(client, 'vo_raw', { function: 'GetSomethingNew', verein: 'b', params: { q: 1 } });
      expect(call.calls[0]?.profile.name).toBe('b');
      expect(call.calls[0]?.params).toEqual({ q: 1 });
      await callTool(client, 'vo_raw', { function: 'GetMembers', verein: 'a' });
      expect(call.calls[1]?.profile.name).toBe('a');
    });

    it('multiple profiles: unknown verein refused without call', async () => {
      const { client, call } = await setup(two);
      const res = await callTool(client, 'vo_raw', { function: 'GetSomethingNew', verein: 'zzz' });
      expect(res.isError).toBe(true);
      expect(call.calls).toHaveLength(0);
    });
  });

  describe('ChangeRegistration mail guard via raw', () => {
    async function setupEvents(allow: { write: boolean; delete: boolean; send: boolean }) {
      const call = makeCall({ ok: true });
      const server = new McpServer({ name: 't', version: '0' });
      registerRaw(server, EVENTS, fakeConfig({ allow }), call);
      return { client: await connectClient(server), call };
    }

    it('mail set is refused without allow.send', async () => {
      const { client, call } = await setupEvents({ write: true, delete: false, send: false });
      const res = await callTool(client, 'vo_raw', {
        function: 'ChangeRegistration',
        params: { anmeldeid: 1, mail: '1' },
        confirm: true,
      });
      expect(res.isError).toBe(true);
      expect(call.calls).toHaveLength(0);
    });

    it('mail set with allow.send but without confirm is refused', async () => {
      const { client, call } = await setupEvents({ write: true, delete: false, send: true });
      const res = await callTool(client, 'vo_raw', { function: 'ChangeRegistration', params: { anmeldeid: 1, mail: '1' } });
      expect(res.isError).toBe(true);
      expect(call.calls).toHaveLength(0);
    });

    it('unset mail is dropped from the body, set mail with send+confirm is forwarded', async () => {
      const { client, call } = await setupEvents({ write: true, delete: false, send: true });
      let res = await callTool(client, 'vo_raw', { function: 'ChangeRegistration', params: { anmeldeid: 1, mail: 'false' } });
      expect(res.isError).toBeFalsy();
      expect(call.calls[0]?.params).toEqual({ anmeldeid: 1 });
      res = await callTool(client, 'vo_raw', {
        function: 'ChangeRegistration',
        params: { anmeldeid: 1, mail: '1' },
        confirm: true,
      });
      expect(res.isError).toBeFalsy();
      expect(call.calls[1]?.params).toEqual({ anmeldeid: 1, mail: '1' });
    });
  });
});
