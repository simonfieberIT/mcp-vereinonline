import { z } from 'zod';
import type { FunctionDef } from '../registry';

// Source: docs/vereinonline-api-doc.txt, section "Flexible Listen".
//
// Known documentation issue (spec "Doku-Unstimmigkeiten"): the doc contains a
// second `GetList` entry with identical content under a truncated heading.
// Which function it belongs to is unresolved. It is ignored here; only the
// first, named `GetList` entry is implemented.
//
// Also unverified: the doc names the record id of UpdateListData only as
// "data id"; it is implemented as `dataid` (GetList returns it as `_dataid`).

const FILE_NOTE =
  'File fields go through `daten` as "dateiname|inhalt" (file name, pipe, content), e.g. {"beleg": "rechnung.pdf|<content>"}.';

export const LISTS: FunctionDef[] = [
  {
    api: 'GetLists',
    toolset: 'lists',
    klass: 'read',
    description:
      'List flexible list definitions (id, name, schemaid, schemaname). Required API-user role: Administration Lists = read, or Data Lists = read (if the list is released for data storage).',
    params: {},
    list: true,
  },
  {
    api: 'GetList',
    toolset: 'lists',
    klass: 'read',
    description:
      'Get records of a flexible list. Required API-user role: Administration Lists = read, or Data Lists = read (if the list is released for data storage).',
    params: {
      id: z.number().int().describe('ID of the flexible list.'),
      filter: z.string().optional().describe('A value in the record, e.g. "mitglied=1234".'),
      return: z.enum(['object']).optional().describe('"object" returns the data as key-value objects.'),
    },
    list: true,
  },
  {
    api: 'GetListView',
    toolset: 'lists',
    klass: 'read',
    description:
      'Get a flexible list view (view name, header fields, data). Required API-user role: Administration Lists = read, or Data Lists = read (if the list is released for data storage).',
    params: {
      id: z.number().int().describe('ID of the flexible list.'),
    },
  },
  {
    api: 'CreateListData',
    toolset: 'lists',
    klass: 'write',
    description: `Create a record in a flexible list and return its id. Pass the list fields in \`daten\` (FIELDNAME: value). ${FILE_NOTE} Required API-user role: Administration Lists = change/add.`,
    params: {
      id: z.number().int().describe('ID of the flexible list.'),
    },
    openFields: true,
  },
  {
    api: 'UpdateListData',
    toolset: 'lists',
    klass: 'write',
    description: `Update a record in a flexible list. Pass the fields to set in \`daten\` (FIELDNAME: value; workflow fields _status and _protokoll are possible). ${FILE_NOTE} Required API-user role: Administration Lists = change, or Data Lists = change.`,
    params: {
      id: z.number().int().describe('ID of the flexible list.'),
      dataid: z.number().int().describe('ID of the record (returned as "_dataid" by GetList).'),
    },
    openFields: true,
  },
];
