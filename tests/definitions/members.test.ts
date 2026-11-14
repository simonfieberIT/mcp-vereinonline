import { describe, it, expect } from 'vitest';
import { CONTACTS } from '../../src/definitions/contacts';
import { MEMBERS } from '../../src/definitions/members';
import { GateError, runFunction, toolName, type FunctionDef } from '../../src/registry';
import { EXPECTED } from '../expected-functions';
import { fakeConfig, makeCall, sent } from '../helpers';

const ALL = [...MEMBERS, ...CONTACTS];
const byApi = (api: string): FunctionDef => ALL.find((d) => d.api === api) as FunctionDef;

describe('members and contacts definitions', () => {
  it('cover exactly the expected functions', () => {
    const expected = Object.entries(EXPECTED)
      .filter(([, v]) => v.toolset === 'members' || v.toolset === 'contacts')
      .map(([k]) => k)
      .sort();
    expect(ALL.map((d) => d.api).sort()).toEqual(expected);
    expect(MEMBERS).toHaveLength(5);
    expect(CONTACTS).toHaveLength(3);
  });

  it.each(ALL.map((d) => [d.api, d] as const))('%s matches EXPECTED metadata', (api, d) => {
    expect(d.toolset).toBe(EXPECTED[api]?.toolset);
    expect(d.klass).toBe(EXPECTED[api]?.klass);
    expect(toolName(api)).toMatch(/^vo_[a-z_]+$/);
    expect(d.description.length).toBeGreaterThan(10);
    expect(d.description.length).toBeLessThan(260);
  });

  it('flags list/openFields/mayMail as specified', () => {
    expect(byApi('GetMembers').list).toBe(true);
    expect(byApi('GetContacts').list).toBe(true);
    expect(byApi('GetMember').list).toBeFalsy();
    expect(byApi('CreateMember').openFields).toBe(true);
    expect(byApi('CreateMember').mayMail).toBe(true);
    expect(byApi('UpdateMember').openFields).toBe(true);
    expect(byApi('CreateContact').openFields).toBe(true);
    expect(byApi('DeleteMember').openFields).toBeFalsy();
  });

  it('GetMembers description mentions operator field restriction', () => {
    expect(byApi('GetMembers').description).toMatch(/operator.*restrict.*fields/i);
  });

  it('GetMembers sends filter and suche', async () => {
    const call = makeCall([]);
    await runFunction(byApi('GetMembers'), { filter: "nachname LIKE 'Mü%'", suche: 'Meier', km: 5 }, fakeConfig(), call);
    expect(call.calls[0]?.fn).toBe('GetMembers');
    expect(call.calls[0]?.params).toEqual({ filter: "nachname LIKE 'Mü%'", suche: 'Meier', km: 5 });
  });

  it('GetMembers accepts all documented optional params', () => {
    const keys = Object.keys(byApi('GetMembers').params).sort();
    expect(keys).toEqual(['felder', 'filter', 'gruppe', 'km', 'plz', 'rolle', 'sort', 'suche']);
    for (const k of keys) expect(byApi('GetMembers').params[k]?.safeParse(undefined).success).toBe(true);
  });

  it('GetMembers description lists the documented default fields and the added name/fotourl', () => {
    const d = byApi('GetMembers').description;
    expect(d).toContain('id, mandant, vorname, nachname, firma, p_freigabe, g_freigabe, freigabe, foto');
    expect(d).toContain('name');
    expect(d).toContain('fotourl');
  });

  it('GetMember sends id and requires it', async () => {
    const call = makeCall({});
    await runFunction(byApi('GetMember'), { id: 12345 }, fakeConfig(), call);
    expect(sent(call.calls[0]!)).toEqual({ fn: 'GetMember', params: { id: 12345 } });
    expect(byApi('GetMember').params.id?.safeParse(undefined).success).toBe(false);
    expect(byApi('GetContact').params.id?.safeParse(undefined).success).toBe(false);
  });

  it('CreateMember merges daten into body, named params win', async () => {
    const call = makeCall({ id: 1 });
    await runFunction(
      byApi('CreateMember'),
      { vorname: 'Anton', daten: { nachname: 'Meier', vorname: 'X', key_Hobby: 'Tennis' } },
      fakeConfig({ allow: { write: true, delete: false, send: false } }),
      call,
    );
    expect(sent(call.calls[0]!)).toEqual({
      fn: 'CreateMember',
      params: { vorname: 'Anton', nachname: 'Meier', key_Hobby: 'Tennis' },
    });
  });

  it('UpdateMember requires id and offers the list params', () => {
    const p = byApi('UpdateMember').params;
    expect(p.id?.safeParse(undefined).success).toBe(false);
    for (const k of ['rollen', 'gruppen', 'beitraege', 'beitragsgruppen', 'beitraganzahl', 'beitragstart', 'beitragende']) {
      expect(p[k], k).toBeDefined();
      expect(p[k]?.safeParse(undefined).success).toBe(true);
    }
  });

  it('DeleteMember needs confirm', async () => {
    const call = makeCall({});
    await expect(runFunction(byApi('DeleteMember'), { id: 1 }, fakeConfig(), call)).rejects.toBeInstanceOf(GateError);
    expect(call.calls).toHaveLength(0);
    await runFunction(byApi('DeleteMember'), { id: 1, confirm: true }, fakeConfig(), call);
    expect(sent(call.calls[0]!)).toEqual({ fn: 'DeleteMember', params: { id: 1 } });
  });

  it('CreateContact and GetContacts reuse the member parameters', () => {
    expect(Object.keys(byApi('GetContacts').params).sort()).toEqual(Object.keys(byApi('GetMembers').params).sort());
    expect(Object.keys(byApi('CreateContact').params).sort()).toEqual(Object.keys(byApi('CreateMember').params).sort());
  });
});
