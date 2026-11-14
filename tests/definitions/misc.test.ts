import { describe, it, expect } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAll, toolName, runFunction, type FunctionDef } from '../../src/registry';
import { ALL_TOOLSETS } from '../../src/config';
import { EXPECTED } from '../expected-functions';
import { callTool, connectClient, fakeConfig, makeCall } from '../helpers';
import { NEWS } from '../../src/definitions/news';
import { ACCOUNTING } from '../../src/definitions/accounting';
import { GROUPS } from '../../src/definitions/groups';
import { PICTURES } from '../../src/definitions/pictures';
import { SHOP } from '../../src/definitions/shop';
import { AUTH } from '../../src/definitions/auth';

const ALL: FunctionDef[] = [...NEWS, ...ACCOUNTING, ...GROUPS, ...PICTURES, ...SHOP, ...AUTH];
const byApi = (api: string) => ALL.find((d) => d.api === api) as FunctionDef;

async function setup(result: unknown, allow = { write: true, delete: false, send: true }) {
  const config = fakeConfig({ toolsets: new Set(ALL_TOOLSETS), allow });
  const call = makeCall(result);
  const server = new McpServer({ name: 't', version: '0' });
  registerAll(server, ALL, config, call);
  const client = await connectClient(server);
  return { client, call, config };
}

describe('metadata against EXPECTED', () => {
  const own = Object.entries(EXPECTED).filter(([, e]) =>
    ['news', 'accounting', 'groups', 'pictures', 'shop', 'auth'].includes(e.toolset),
  );
  it('covers exactly the expected functions (13)', () => {
    expect(own).toHaveLength(13);
    expect(ALL.map((d) => d.api).sort()).toEqual(own.map(([k]) => k).sort());
  });
  for (const [api, exp] of own) {
    it(`${api} matches toolset and class`, () => {
      const d = byApi(api);
      expect(d.toolset).toBe(exp.toolset);
      expect(d.klass).toBe(exp.klass);
      expect(d.description.length).toBeGreaterThan(10);
    });
  }
  it('list functions are marked list', () => {
    for (const api of ['GetNews', 'GetJournal', 'GetShopPurchases', 'GetGroups', 'GetPictures', 'GetShop', 'GetShopReservations']) {
      expect(byApi(api).list, api).toBe(true);
    }
    expect(byApi('GetInvoice').list).not.toBe(true);
  });
  it('openFields only on CreateInvoice and CreateGroup', () => {
    expect(ALL.filter((d) => d.openFields).map((d) => d.api).sort()).toEqual(['CreateGroup', 'CreateInvoice']);
  });
});

describe('CreateInvoice', () => {
  it('flattens kontonr1 and positiontext1', async () => {
    const { client, call } = await setup({ id: 1 });
    const res = await callTool(client, toolName('CreateInvoice'), {
      datum: '3.7.2026',
      betrag: 123.45,
      daten: { kontonr1: '1000', kontobetrag1: 123.45, positiontext1: 'A', positionanzahl1: 3 },
    });
    expect(res.isError).toBeUndefined();
    expect(call.calls[0]?.fn).toBe('CreateInvoice');
    expect(call.calls[0]?.params).toEqual({
      datum: '3.7.2026',
      betrag: 123.45,
      kontonr1: '1000',
      kontobetrag1: 123.45,
      positiontext1: 'A',
      positionanzahl1: 3,
    });
  });
  it('requires datum and betrag, description shows numbered keys', async () => {
    const { client } = await setup({ id: 1 });
    const res = await callTool(client, toolName('CreateInvoice'), { datum: '3.7.2026' });
    expect(res.isError).toBe(true);
    const d = byApi('CreateInvoice').description;
    expect(d).toContain('kontonr1');
    expect(d).toContain('positiontext1');
    expect(d).not.toContain('GetInvoice');
  });
});

describe('auth', () => {
  it('CheckLogin strips token', () => {
    const post = byApi('CheckLogin').postProcess as (r: unknown) => unknown;
    expect(post({ id: 1, token: 'A/x/y' })).not.toHaveProperty('token');
  });
  it('CheckLogin keeps other fields and non-objects', () => {
    const post = byApi('CheckLogin').postProcess as (r: unknown) => unknown;
    const r = { id: 1, email: 'a@b.de', vorname: 'A', nachname: 'B', rolle: 'x', token: 't' };
    const { token: _t, ...rest } = r;
    expect(post(r)).toEqual(rest);
    expect(post('x')).toBe('x');
    expect(post(null)).toBeNull();
    expect(post([{ token: 't' }])).toEqual([{ token: 't' }]);
  });
  it('CheckLogin strips token through the registry', async () => {
    const { client } = await setup({ id: 1, token: 'SECRET', email: 'a@b.de' });
    const res = await callTool(client, toolName('CheckLogin'), { user: 'susi', password: 'pw' });
    expect(res.text).not.toContain('SECRET');
    expect(JSON.parse(res.text)).toEqual({ id: 1, email: 'a@b.de' });
  });
  for (const value of ['', 'Meier, Anton', 12345, { name: 'Meier', email: 'm@x.de' }]) {
    it(`VerifyLogin passes through ${JSON.stringify(value)}`, async () => {
      const { client, call } = await setup(value);
      const res = await callTool(client, toolName('VerifyLogin'), { user: 'susi', password: 'pw', result: 'id' });
      expect(res.isError).toBeUndefined();
      expect(JSON.parse(res.text)).toEqual(value);
      expect(call.calls[0]?.params).toEqual({ user: 'susi', password: 'pw', result: 'id' });
    });
  }
  it('login descriptions warn about the password', () => {
    for (const api of ['VerifyLogin', 'CheckLogin']) {
      expect(byApi(api).description.toLowerCase()).toContain('password');
      expect(byApi(api).description.toLowerCase()).toContain('conversation');
    }
  });
  it('SendLogin needs confirm', async () => {
    const config = fakeConfig({ allow: { write: false, delete: false, send: true } });
    await expect(runFunction(byApi('SendLogin'), { id: 5 }, config, makeCall(''))).rejects.toThrow(/confirm/);
    const { client, call } = await setup('ok');
    const bad = await callTool(client, toolName('SendLogin'), { id: 5 });
    expect(bad.isError).toBe(true);
    const ok = await callTool(client, toolName('SendLogin'), { id: 5, confirm: true });
    expect(ok.isError).toBeUndefined();
    expect(call.calls[0]?.params).toEqual({ id: 5 });
  });
});

describe('lists', () => {
  it('GetJournal is truncated by maxResults', async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ id: i }));
    const { client } = await setup(rows);
    const res = await callTool(client, toolName('GetJournal'), { datumab: '1.1.2026', datumbis: '31.12.2026', maxResults: 2 });
    const parsed = JSON.parse(res.text);
    expect(parsed).toMatchObject({ total: 5, shown: 2, truncated: true });
  });
  it('GetJournal requires datumab and datumbis', async () => {
    const { client } = await setup([]);
    expect((await callTool(client, toolName('GetJournal'), { datumab: '1.1.2026' })).isError).toBe(true);
  });
  it('CreateGroup requires name and writes with daten', async () => {
    const { client, call } = await setup({ id: 9 });
    await callTool(client, toolName('CreateGroup'), { name: 'Test', daten: { extra: 'x' } });
    expect(call.calls[0]?.params).toEqual({ name: 'Test', extra: 'x' });
  });
});
