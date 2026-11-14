import { z } from 'zod';
import { GateError, type FunctionDef } from '../registry';

const id = (what: string) => z.union([z.number().int(), z.string()]).describe(what);
const TYP =
  '"1" = public event, "11" = internal event, "100", "101", ... custom types, "kurs" = courses (GetEvents only).';
const flag = z.union([z.string(), z.number(), z.boolean()]);

// Fail-closed: anything except an explicit "off" value counts as "mail requested".
function isSet(value: unknown): boolean {
  if (value === undefined || value === null || value === false || value === 0) return false;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    return !(v === '' || v === '0' || v === 'false');
  }
  return true;
}

export const EVENTS: FunctionDef[] = [
  {
    api: 'GetEvents',
    toolset: 'events',
    klass: 'read',
    description:
      'List events. Needs API-user role "Veranstaltungen" = read. Only public events unless sichtbar="alle". ' +
      'The API parameter "limit" is passed to VereinOnline; "maxResults" additionally truncates the returned list on the client. They are separate.',
    list: true,
    params: {
      typ: z.string().optional().describe(`Event type: ${TYP}`),
      filter: z.string().optional().describe('SQL expression restricting the records.'),
      jahr: z
        .string()
        .optional()
        .describe('"2020" = that year, "zukunft", "zukunft12", "aktuellermonat", "vergangenheit", "aktuellesjahr", "naechstermonat".'),
      limit: z.number().int().min(1).optional().describe('API parameter: limits the records delivered by VereinOnline.'),
      gruppenid: z.string().optional().describe('Group ID; "1234+" includes subgroups.'),
      monat: z.string().optional().describe('Only this month (YYYYMM).'),
      abmonat: z.string().optional().describe('Only from this month on (YYYYMM).'),
      bismonat: z.string().optional().describe('Only up to this month (YYYYMM).'),
      kostenfremd: z.string().optional().describe('Cost range, e.g. "1000-2000".'),
      search: z.string().optional().describe('Search term in titel, beschreibung, ort.'),
      restriction: z.string().optional().describe('Restrictions as feldname=wert;...'),
      sichtbar: z.string().optional().describe('"alle" = events of all visibilities (default: public only).'),
    },
  },
  {
    api: 'GetEvent',
    toolset: 'events',
    klass: 'read',
    description: 'Get all data of one event. Needs API-user role "Veranstaltungen" = read.',
    params: {
      id: id('Event ID.'),
      typ: z.string().optional().describe(`Event type: ${TYP}`),
    },
  },
  {
    api: 'GetRegistrations',
    toolset: 'events',
    klass: 'read',
    description: 'List the registrations of an event. Needs API-user role "Veranstaltungen anmelden" = read.',
    list: true,
    params: { id: id('Event ID.') },
  },
  {
    api: 'GetCalendar',
    toolset: 'events',
    klass: 'read',
    description:
      'Get the central calendar data of one month (days with events). Needs API-user role "Veranstaltungen" = read. Only public events.',
    params: {
      m: z.union([z.number().int().min(1).max(12), z.string()]).describe('Month (1-12).'),
      y: z.union([z.number().int(), z.string()]).describe('Year, e.g. 2023.'),
      typ: z.string().optional().describe(`Event type: ${TYP}`),
    },
  },
  {
    api: 'CreateRegistration',
    toolset: 'events',
    klass: 'write',
    mayMail: true,
    openFields: true,
    description:
      'Register a member (userid) or an external participant (vorname, nachname) for an event. ' +
      'Companions go into daten, e.g. "begleiter1.vorname", "begleiter1.nachname". ' +
      'Needs API-user role "Veranstaltungen anmelden" = change/+.',
    params: {
      veranstaltungid: id('Event ID.'),
      userid: id('Member ID (instead of vorname/nachname).').optional(),
      vorname: z.string().optional().describe('First name of an external participant.'),
      nachname: z.string().optional().describe('Last name of an external participant.'),
      anmerkung: z.string().optional().describe('Text appended as note.'),
    },
  },
  {
    api: 'ChangeRegistration',
    toolset: 'events',
    klass: 'write',
    description:
      'Change a registration (status, attendance, note). mail="1" sends the status confirmation e-mail and then needs ALLOW_SEND plus confirm=true. ' +
      'Needs API-user role "Veranstaltungen anmelden" = change.',
    params: {
      anmeldeid: id('Registration ID.'),
      status: z
        .union([z.number().int().min(0).max(3), z.enum(['0', '1', '2', '3'])])
        .optional()
        .describe('0 = registered, 1 = unregistered, 2 = no-show, 3 = waiting list.'),
      anwesend: z.union([z.literal(0), z.literal(1), z.enum(['0', '1'])]).optional().describe('0 = absent, 1 = present.'),
      anmerkung: z.string().optional().describe('Text appended as note.'),
      kurs: flag.optional().describe('"1" = apply to all linked series dates.'),
      mail: flag.optional().describe('"1" = send the status confirmation e-mail (needs ALLOW_SEND and confirm=true).'),
      confirm: z.literal(true).optional().describe('Must be true when mail is set.'),
    },
    guard: (args, config, body) => {
      if (!isSet(body.mail)) return;
      if (!config.allow.send) {
        throw new GateError(
          'ChangeRegistration mit mail=1 versendet eine E-Mail und braucht ALLOW_SEND (send-Freigabe).',
        );
      }
      if (args.confirm !== true) {
        throw new GateError('ChangeRegistration mit mail=1 braucht ausdrücklich confirm: true.');
      }
    },
    // An "off" value ('false', '0', '') must never reach the API: a truthiness check there could read it as "send".
    normalize: (body) => {
      if (!isSet(body.mail)) delete body.mail;
    },
  },
  {
    api: 'CreateEvent',
    toolset: 'events',
    klass: 'write',
    openFields: true,
    description:
      'Create an event. Pass datum, titel, key_... extra fields, anmeldung1=... registration fields and bild (base64 .jpg) in daten. ' +
      'Needs API-user role "Veranstaltungen" = change/+.',
    params: {},
  },
  {
    api: 'UpdateEvent',
    toolset: 'events',
    klass: 'write',
    openFields: true,
    description:
      'Update an event. Pass the fields to change (datum, titel, key_..., bild) in daten. ' +
      'Needs API-user role "Veranstaltungen" = change.',
    params: {
      id: id('Event ID.'),
      kurs: flag.optional().describe('"1" = apply to all linked series dates.'),
    },
  },
  {
    api: 'DeleteEvent',
    toolset: 'events',
    klass: 'delete',
    description: 'Delete an event. Needs API-user role "Veranstaltungen" = change/+/-.',
    params: { id: id('Event ID.') },
  },
];
