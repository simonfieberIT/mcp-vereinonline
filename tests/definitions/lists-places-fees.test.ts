import { describe, it, expect } from 'vitest';
import { GateError, runFunction, toolName, type FunctionDef } from '../../src/registry';
import { NEWSLETTER } from '../../src/definitions/newsletter';
import { LISTS } from '../../src/definitions/lists';
import { PLACES } from '../../src/definitions/places';
import { FEES } from '../../src/definitions/fees';
import { EXPECTED } from '../expected-functions';
import { fakeConfig, makeCall, sent } from '../helpers';

const GROUPS: Record<string, FunctionDef[]> = {
  newsletter: NEWSLETTER,
  lists: LISTS,
  places: PLACES,
  fees: FEES,
};
const ALL = [...NEWSLETTER, ...LISTS, ...PLACES, ...FEES];

function find(api: string): FunctionDef {
  const d = ALL.find((x) => x.api === api);
  if (!d) throw new Error(`missing ${api}`);
  return d;
}

async function run(api: string, args: Record<string, unknown>, result: unknown = []) {
  const call = makeCall(result);
  const out = await runFunction(find(api), args, fakeConfig(), call);
  return { out, call };
}

describe('metadata against EXPECTED', () => {
  for (const [toolset, defs] of Object.entries(GROUPS)) {
    const expected = Object.entries(EXPECTED).filter(([, e]) => e.toolset === toolset);
    it(`${toolset} has exactly the expected functions`, () => {
      expect(defs.map((d) => d.api).sort()).toEqual(expected.map(([k]) => k).sort());
    });
    for (const [api, e] of expected) {
      it(`${api} has toolset ${e.toolset} and class ${e.klass}`, () => {
        const d = find(api);
        expect(d.toolset).toBe(e.toolset);
        expect(d.klass).toBe(e.klass);
        expect(d.description).toMatch(/^[A-Z]/);
        expect(d.description).toMatch(/role|Role|none/);
        expect(toolName(api)).toMatch(/^vo_/);
      });
    }
  }

  it('flags list, mayMail and openFields as required', () => {
    for (const api of ['GetNewsletter', 'GetLists', 'GetList', 'GetPlaceBookings', 'GetMemberFees', 'GetMemberUserfees']) {
      expect(find(api).list).toBe(true);
    }
    expect(find('CreateSubscriber').mayMail).toBe(true);
    expect(find('CreateSubscriber').openFields).toBe(true);
    expect(find('GetNewsletterBeitrag').openFields).toBe(true);
    expect(find('CreateListData').openFields).toBe(true);
    expect(find('UpdateListData').openFields).toBe(true);
    expect(find('GetListView').list).toBeFalsy();
  });
});

describe('newsletter extra fields via daten', () => {
  it('CreateSubscriber merges daten flat', async () => {
    const { call } = await run('CreateSubscriber', {
      vorname: 'Susi', nachname: 'Sorglos', g_email: 's@x.de', daten: { key_Hobby: 'Tennis' },
    });
    expect(call.calls[0]!.params).toEqual({ vorname: 'Susi', nachname: 'Sorglos', g_email: 's@x.de', key_Hobby: 'Tennis' });
    expect(find('CreateSubscriber').description).toContain('daten');
  });
  it('GetNewsletterBeitrag merges daten filter flat', async () => {
    const { call } = await run('GetNewsletterBeitrag', { id: 222, monat: 3, daten: { key_Thema: 'Verein' } });
    expect(call.calls[0]!.params).toEqual({ id: 222, monat: 3, key_Thema: 'Verein' });
    expect(find('GetNewsletterBeitrag').description).toContain('daten: { key_FIELDNAME: value }');
  });
});

describe('calls', () => {
  it('GetNewsletter sends no params', async () => {
    const { call } = await run('GetNewsletter', {});
    expect(sent(call.calls[0]!)).toEqual({ fn: 'GetNewsletter', params: {} });
  });
  it('GetNewsletterBeitrag passes id and monat', async () => {
    const { call } = await run('GetNewsletterBeitrag', { id: 222, monat: 3 });
    expect(sent(call.calls[0]!)).toEqual({ fn: 'GetNewsletterBeitrag', params: { id: 222, monat: 3 } });
  });
  it('CreateSubscriber passes its fields (needs write)', async () => {
    const { call } = await run('CreateSubscriber', {
      vorname: 'Susi', nachname: 'Sorglos', g_email: 'susi@sorglos.de', gruppe: 'A',
    });
    expect(sent(call.calls[0]!)).toEqual({
      fn: 'CreateSubscriber',
      params: { vorname: 'Susi', nachname: 'Sorglos', g_email: 'susi@sorglos.de', gruppe: 'A' },
    });
  });
  it('GetLists sends no params', async () => {
    const { call } = await run('GetLists', {});
    expect(sent(call.calls[0]!)).toEqual({ fn: 'GetLists', params: {} });
  });
  it('GetList requires id, passes filter and return', async () => {
    const { call } = await run('GetList', { id: 10, filter: 'mitglied=1234', return: 'object' });
    expect(sent(call.calls[0]!)).toEqual({ fn: 'GetList', params: { id: 10, filter: 'mitglied=1234', return: 'object' } });
    expect(find('GetList').params.id).toBeDefined();
    expect(find('GetList').params.id!.safeParse(undefined).success).toBe(false);
    expect(find('GetList').params.filter!.safeParse(undefined).success).toBe(true);
    expect(find('GetList').params.return!.safeParse(undefined).success).toBe(true);
  });
  it('GetListView passes id', async () => {
    const { call } = await run('GetListView', { id: 120 });
    expect(sent(call.calls[0]!)).toEqual({ fn: 'GetListView', params: { id: 120 } });
  });
  it('CreateListData passes file field via daten', async () => {
    const { call } = await run('CreateListData', {
      id: 10,
      daten: { feld1: '123', beleg: 'rechnung.pdf|SGVsbG8=' },
    });
    expect(sent(call.calls[0]!)).toEqual({
      fn: 'CreateListData',
      params: { id: 10, feld1: '123', beleg: 'rechnung.pdf|SGVsbG8=' },
    });
    expect(call.calls[0]!.params).not.toHaveProperty('daten');
    expect(find('CreateListData').description).toContain('dateiname|inhalt');
  });
  it('UpdateListData passes id, dataid and workflow fields via daten', async () => {
    const { call } = await run('UpdateListData', { id: 10, dataid: 77, daten: { _status: 'ok', f: 'x|y' } });
    expect(sent(call.calls[0]!)).toEqual({
      fn: 'UpdateListData',
      params: { id: 10, dataid: 77, _status: 'ok', f: 'x|y' },
    });
    expect(find('UpdateListData').description).toContain('dateiname|inhalt');
  });
  it('GetPlaceBookings passes optional filters', async () => {
    const { call } = await run('GetPlaceBookings', {
      platz: 'Tennis 1', beginn: '2023-07-24 18:00', ende: '2023-07-24 22:00', felder: 'veranstaltung:titel',
    });
    expect(sent(call.calls[0]!)).toEqual({
      fn: 'GetPlaceBookings',
      params: { platz: 'Tennis 1', beginn: '2023-07-24 18:00', ende: '2023-07-24 22:00', felder: 'veranstaltung:titel' },
    });
  });
  it('CheckPlace requires platz, beginn, ende', async () => {
    const { call } = await run('CheckPlace', { platz: 'Tennis 1', beginn: 'a', ende: 'b' }, { result: '-' });
    expect(sent(call.calls[0]!)).toEqual({ fn: 'CheckPlace', params: { platz: 'Tennis 1', beginn: 'a', ende: 'b' } });
    for (const k of ['platz', 'beginn', 'ende']) {
      expect(find('CheckPlace').params[k]!.safeParse(undefined).success).toBe(false);
    }
  });
  it('CreatePlaceBooking passes all fields', async () => {
    const args = {
      platz: 'Tennis 1', beginn: 'a', ende: 'b', userid: 5, veranstaltungid: 6, beschreibung: 'x', anmerkungen: 'y',
    };
    const { call } = await run('CreatePlaceBooking', args, { result: 1 });
    expect(sent(call.calls[0]!)).toEqual({ fn: 'CreatePlaceBooking', params: args });
  });
  it('DeletePlaceBookings needs confirm', async () => {
    const call = makeCall();
    await expect(runFunction(find('DeletePlaceBookings'), { id: 5 }, fakeConfig(), call)).rejects.toBeInstanceOf(GateError);
    expect(call.calls).toHaveLength(0);
  });
  it('DeletePlaceBookings accepts variant 1 (id) and variant 2 (platz/beginn/ende)', async () => {
    const a = await run('DeletePlaceBookings', { id: 5, confirm: true });
    expect(sent(a.call.calls[0]!)).toEqual({ fn: 'DeletePlaceBookings', params: { id: 5 } });
    expect(a.call.calls[0]!.params).not.toHaveProperty('confirm');
    const b = await run('DeletePlaceBookings', { platz: 'T1', beginn: 'a', ende: 'b', confirm: true });
    expect(b.call.calls[0]!.params).toEqual({ platz: 'T1', beginn: 'a', ende: 'b' });
  });
  it('DeletePlaceBookings rejects calls without either variant', async () => {
    const call = makeCall();
    await expect(runFunction(find('DeletePlaceBookings'), { confirm: true }, fakeConfig(), call)).rejects.toBeInstanceOf(GateError);
    await expect(runFunction(find('DeletePlaceBookings'), { platz: 'T1', confirm: true }, fakeConfig(), call)).rejects.toBeInstanceOf(GateError);
    expect(call.calls).toHaveLength(0);
  });
  it('GetMemberFees sends no params', async () => {
    const { call } = await run('GetMemberFees', {});
    expect(sent(call.calls[0]!)).toEqual({ fn: 'GetMemberFees', params: {} });
  });
  it('GetMemberUserfees passes userid', async () => {
    const { call } = await run('GetMemberUserfees', { userid: 12 });
    expect(sent(call.calls[0]!)).toEqual({ fn: 'GetMemberUserfees', params: { userid: 12 } });
  });
  it('AddMemberUserfees passes fields', async () => {
    const args = { userid: 1234, beitragid: 20, anzahl: 2, datum1: '2026-01-01', datum2: '2026-12-31', datumerstellt: '2026-06-01', anmerkung: 'n' };
    const { call } = await run('AddMemberUserfees', args, { id: 9 });
    expect(sent(call.calls[0]!)).toEqual({ fn: 'AddMemberUserfees', params: args });
  });
  it('AddMemberUserfees needs beitragid or beitraggruppe', async () => {
    const call = makeCall();
    await expect(runFunction(find('AddMemberUserfees'), { userid: 1 }, fakeConfig(), call)).rejects.toBeInstanceOf(GateError);
    const ok = await run('AddMemberUserfees', { userid: 1, beitraggruppe: 'Jugend' });
    expect(ok.call.calls[0]!.params).toEqual({ userid: 1, beitraggruppe: 'Jugend' });
  });
  it('UpdateMemberUserfees accepts the three identification variants', async () => {
    for (const ident of [{ userid: 1, beitragid: 2 }, { userid: 1, beitraggruppe: 'G' }, { id: 7 }]) {
      const { call } = await run('UpdateMemberUserfees', { ...ident, anzahl: 2 });
      expect(sent(call.calls[0]!)).toEqual({ fn: 'UpdateMemberUserfees', params: { ...ident, anzahl: 2 } });
    }
  });
  it('UpdateMemberUserfees rejects missing identification', async () => {
    const call = makeCall();
    await expect(runFunction(find('UpdateMemberUserfees'), { userid: 1, anzahl: 2 }, fakeConfig(), call)).rejects.toBeInstanceOf(GateError);
    expect(call.calls).toHaveLength(0);
  });
  it('DeleteMemberUserfees needs confirm', async () => {
    const call = makeCall();
    await expect(runFunction(find('DeleteMemberUserfees'), { id: 1234 }, fakeConfig(), call)).rejects.toBeInstanceOf(GateError);
    expect(call.calls).toHaveLength(0);
    const ok = await run('DeleteMemberUserfees', { id: 1234, userid: 5, confirm: true });
    expect(sent(ok.call.calls[0]!)).toEqual({ fn: 'DeleteMemberUserfees', params: { id: 1234, userid: 5 } });
  });
});
