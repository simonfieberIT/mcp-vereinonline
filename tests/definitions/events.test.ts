import { describe, it, expect } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { EVENTS } from '../../src/definitions/events';
import { GateError, registerAll, runFunction, toolName, type FunctionDef } from '../../src/registry';
import { EXPECTED } from '../expected-functions';
import { callTool, connectClient, fakeConfig, makeCall } from '../helpers';

function find(api: string): FunctionDef {
  const d = EVENTS.find((e) => e.api === api);
  if (!d) throw new Error(`missing ${api}`);
  return d;
}

const write = () => fakeConfig({ allow: { write: true, delete: false, send: false } });
const writeSend = () => fakeConfig({ allow: { write: true, delete: false, send: true } });

describe('EVENTS metadata', () => {
  const expected = Object.entries(EXPECTED).filter(([, v]) => v.toolset === 'events');

  it('covers exactly the 9 expected events functions', () => {
    expect(EVENTS.map((d) => d.api).sort()).toEqual(expected.map(([k]) => k).sort());
    expect(EVENTS).toHaveLength(9);
  });

  for (const [api, meta] of expected) {
    it(`${api} has toolset and klass from EXPECTED`, () => {
      const d = find(api);
      expect(d.toolset).toBe(meta.toolset);
      expect(d.klass).toBe(meta.klass);
      expect(d.description.length).toBeGreaterThan(10);
      expect(d.description).toMatch(/role/i);
    });
  }

  it('sets flags as specified', () => {
    expect(find('GetEvents').list).toBe(true);
    expect(find('GetRegistrations').list).toBe(true);
    expect(find('GetEvent').list).toBeUndefined();
    expect(find('CreateRegistration').mayMail).toBe(true);
    expect(find('ChangeRegistration').guard).toBeTypeOf('function');
    expect(find('ChangeRegistration').openFields).toBeFalsy();
    expect(find('CreateEvent').openFields).toBe(true);
    expect(find('UpdateEvent').openFields).toBe(true);
  });

  it('declares documented params', () => {
    expect(Object.keys(find('GetEvents').params).sort()).toEqual(
      ['typ', 'filter', 'jahr', 'limit', 'gruppenid', 'monat', 'abmonat', 'bismonat', 'kostenfremd', 'search', 'restriction', 'sichtbar'].sort(),
    );
    expect(Object.keys(find('GetEvent').params).sort()).toEqual(['id', 'typ']);
    expect(Object.keys(find('GetRegistrations').params)).toEqual(['id']);
    expect(Object.keys(find('GetCalendar').params).sort()).toEqual(['m', 'typ', 'y']);
    expect(Object.keys(find('CreateRegistration').params).sort()).toEqual(
      ['anmerkung', 'nachname', 'userid', 'veranstaltungid', 'vorname'],
    );
    expect(Object.keys(find('ChangeRegistration').params).sort()).toEqual(
      ['anmeldeid', 'anmerkung', 'anwesend', 'confirm', 'kurs', 'mail', 'status'],
    );
    expect(Object.keys(find('UpdateEvent').params).sort()).toEqual(['id', 'kurs']);
    expect(Object.keys(find('DeleteEvent').params)).toEqual(['id']);
  });

  it('GetEvents description distinguishes limit from maxResults', () => {
    const d = find('GetEvents').description;
    expect(d).toContain('limit');
    expect(d).toContain('maxResults');
  });
});

describe('GetEvents', () => {
  it('forwards jahr and limit to the API and truncates with maxResults separately', async () => {
    const items = Array.from({ length: 5 }, (_, i) => ({ id: i }));
    const call = makeCall(items);
    const res = (await runFunction(find('GetEvents'), { jahr: 'zukunft', limit: 20, maxResults: 2 }, fakeConfig(), call)) as {
      total: number;
      shown: number;
      truncated: boolean;
    };
    expect(call.calls[0]?.fn).toBe('GetEvents');
    expect(call.calls[0]?.params).toEqual({ jahr: 'zukunft', limit: 20 });
    expect(res).toMatchObject({ total: 5, shown: 2, truncated: true });
  });
});

describe('GetCalendar', () => {
  it('requires m and y via the tool schema', async () => {
    const server = new McpServer({ name: 't', version: '0' });
    const call = makeCall({});
    registerAll(server, EVENTS, fakeConfig(), call);
    const client = await connectClient(server);
    const bad = await callTool(client, toolName('GetCalendar'), { m: 7 });
    expect(bad.isError).toBe(true);
    expect(call.calls).toHaveLength(0);
    const ok = await callTool(client, toolName('GetCalendar'), { m: 7, y: 2023 });
    expect(ok.isError).toBeFalsy();
    expect(call.calls[0]?.params).toEqual({ m: 7, y: 2023 });
  });
});

describe('CreateRegistration', () => {
  it('sends userid and merges companions from daten', async () => {
    const call = makeCall({ id: 1 });
    await runFunction(
      find('CreateRegistration'),
      { veranstaltungid: 12345, userid: 789, daten: { 'begleiter1.vorname': 'Anna', 'begleiter1.nachname': 'Beispiel' } },
      write(),
      call,
    );
    expect(call.calls[0]?.fn).toBe('CreateRegistration');
    expect(call.calls[0]?.params).toEqual({
      veranstaltungid: 12345,
      userid: 789,
      'begleiter1.vorname': 'Anna',
      'begleiter1.nachname': 'Beispiel',
    });
  });

  it('notes possible mail sending in the tool description', async () => {
    const server = new McpServer({ name: 't', version: '0' });
    registerAll(server, EVENTS, write(), makeCall());
    const client = await connectClient(server);
    const tools = (await client.listTools()).tools;
    expect(tools.find((t) => t.name === 'vo_create_registration')?.description).toContain('May send e-mail (unverified).');
  });
});

describe('ChangeRegistration', () => {
  const def = () => find('ChangeRegistration');

  it('status only needs write', async () => {
    const call = makeCall({});
    await runFunction(def(), { anmeldeid: 1, status: 1, anmerkung: 'xyz' }, write(), call);
    expect(call.calls[0]?.params).toEqual({ anmeldeid: 1, status: 1, anmerkung: 'xyz' });
  });

  for (const mail of ['1', 1, true, 'true']) {
    it(`mail=${JSON.stringify(mail)} without send flag throws GateError and does not call`, async () => {
      const call = makeCall({});
      await expect(runFunction(def(), { anmeldeid: 1, status: 1, mail }, write(), call)).rejects.toBeInstanceOf(GateError);
      expect(call.calls).toHaveLength(0);
    });

    it(`mail=${JSON.stringify(mail)} with send flag but no confirm throws GateError`, async () => {
      const call = makeCall({});
      await expect(runFunction(def(), { anmeldeid: 1, mail }, writeSend(), call)).rejects.toBeInstanceOf(GateError);
      expect(call.calls).toHaveLength(0);
    });
  }

  it('mail=1 with send flag and confirm calls without confirm in body', async () => {
    const call = makeCall({});
    await runFunction(def(), { anmeldeid: 1, mail: '1', confirm: true }, writeSend(), call);
    expect(call.calls[0]?.params).toEqual({ anmeldeid: 1, mail: '1' });
  });

  it('confirm alone does not bypass the missing send flag', async () => {
    const call = makeCall({});
    await expect(runFunction(def(), { anmeldeid: 1, mail: '1', confirm: true }, write(), call)).rejects.toBeInstanceOf(GateError);
    expect(call.calls).toHaveLength(0);
  });

  for (const mail of ['TRUE', 'True', ' 1 ', '01', '1.0', 'yes', 'on']) {
    it(`mail=${JSON.stringify(mail)} fails closed without send flag`, async () => {
      const call = makeCall({});
      await expect(runFunction(def(), { anmeldeid: 1, mail }, write(), call)).rejects.toBeInstanceOf(GateError);
      expect(call.calls).toHaveLength(0);
    });
  }

  for (const mail of ['0', false, 'false', 'FALSE', ' false ', '', 0]) {
    it(`mail=${JSON.stringify(mail)} is not set, needs no send flag and is not forwarded`, async () => {
      const call = makeCall({});
      await runFunction(def(), { anmeldeid: 1, mail }, write(), call);
      expect(call.calls).toHaveLength(1);
      expect(call.calls[0]?.params).toEqual({ anmeldeid: 1 });
      expect(Object.keys(call.calls[0]!.params)).not.toContain('mail');
    });
  }

  for (const mail of ['1', 1, true, 'true', 'TRUE', ' 1 ']) {
    it(`mail=${JSON.stringify(mail)} with send flag and confirm is forwarded unchanged`, async () => {
      const call = makeCall({});
      await runFunction(def(), { anmeldeid: 1, mail, confirm: true }, writeSend(), call);
      expect(call.calls[0]?.params).toEqual({ anmeldeid: 1, mail });
    });
  }

  it('def.normalize drops an unset mail key from the body', () => {
    const body: Record<string, unknown> = { anmeldeid: 1, mail: 'false' };
    def().normalize?.(body);
    expect(body).toEqual({ anmeldeid: 1 });
    const set: Record<string, unknown> = { anmeldeid: 1, mail: '1' };
    def().normalize?.(set);
    expect(set).toEqual({ anmeldeid: 1, mail: '1' });
  });

  it('mail=null or undefined is not set (guard)', () => {
    expect(() => def().guard?.({}, write(), { anmeldeid: 1, mail: null })).not.toThrow();
    expect(() => def().guard?.({}, write(), { anmeldeid: 1, mail: undefined })).not.toThrow();
  });

  it('ignores daten (no openFields), so mail cannot be smuggled that way', async () => {
    const call = makeCall({});
    await runFunction(def(), { anmeldeid: 1, daten: { mail: '1' } }, write(), call);
    expect(call.calls[0]?.params).toEqual({ anmeldeid: 1 });
  });

  it('guard decides on the built body (mail smuggled outside params path)', () => {
    expect(() => def().guard?.({ anmeldeid: 1 }, write(), { anmeldeid: 1, mail: '1' })).toThrow(GateError);
    expect(() => def().guard?.({ anmeldeid: 1 }, write(), { anmeldeid: 1 })).not.toThrow();
  });

  it('protocol level: mail=1 with send flag and confirm=true succeeds and forwards mail', async () => {
    const server = new McpServer({ name: 't', version: '0' });
    const call = makeCall({ ok: true });
    registerAll(server, EVENTS, writeSend(), call);
    const client = await connectClient(server);
    const res = await callTool(client, 'vo_change_registration', { anmeldeid: 1, mail: '1', confirm: true });
    expect(res.isError).toBeFalsy();
    expect(call.calls).toHaveLength(1);
    expect({ fn: call.calls[0]!.fn, params: call.calls[0]!.params }).toEqual({
      fn: 'ChangeRegistration',
      params: { anmeldeid: 1, mail: '1' },
    });
  });

  it('protocol level: confirm is not required in the input schema', async () => {
    const server = new McpServer({ name: 't', version: '0' });
    registerAll(server, EVENTS, writeSend(), makeCall({}));
    const client = await connectClient(server);
    const tool = (await client.listTools()).tools.find((t) => t.name === 'vo_change_registration');
    const schema = tool!.inputSchema as { properties?: Record<string, unknown>; required?: string[] };
    expect(schema.properties?.confirm).toBeDefined();
    expect(schema.required ?? []).not.toContain('confirm');
  });

  it('through the tool layer: mail=1 without send flag is an error result, confirm is optional in the schema', async () => {
    const server = new McpServer({ name: 't', version: '0' });
    const call = makeCall({});
    registerAll(server, EVENTS, write(), call);
    const client = await connectClient(server);
    const ok = await callTool(client, 'vo_change_registration', { anmeldeid: 1, status: 1 });
    expect(ok.isError).toBeFalsy();
    const bad = await callTool(client, 'vo_change_registration', { anmeldeid: 1, mail: '1' });
    expect(bad.isError).toBe(true);
    expect(call.calls).toHaveLength(1);
  });
});

describe('Create/Update/DeleteEvent', () => {
  it('CreateEvent merges daten flat', async () => {
    const call = makeCall({ id: 9 });
    await runFunction(find('CreateEvent'), { daten: { datum: '2023-07-24', titel: 'Sommerfest', key_Ort: 'Halle' } }, write(), call);
    expect(call.calls[0]?.params).toEqual({ datum: '2023-07-24', titel: 'Sommerfest', key_Ort: 'Halle' });
  });

  it('UpdateEvent sends id, kurs and daten', async () => {
    const call = makeCall({});
    await runFunction(find('UpdateEvent'), { id: 5, kurs: '1', daten: { titel: 'neu' } }, write(), call);
    expect(call.calls[0]?.params).toEqual({ id: 5, kurs: '1', titel: 'neu' });
  });

  it('DeleteEvent needs confirm', async () => {
    const cfg = fakeConfig({ allow: { write: true, delete: true, send: false } });
    const call = makeCall({});
    await expect(runFunction(find('DeleteEvent'), { id: 5 }, cfg, call)).rejects.toBeInstanceOf(GateError);
    expect(call.calls).toHaveLength(0);
    await runFunction(find('DeleteEvent'), { id: 5, confirm: true }, cfg, call);
    expect(call.calls[0]?.params).toEqual({ id: 5 });
  });
});
