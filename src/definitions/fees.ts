import { z } from 'zod';
import { GateError, type FunctionDef } from '../registry';

// Source: docs/vereinonline-api-doc.txt, section "Mitgliedsbeiträge".
// Unverified: for DeleteMemberUserfees the doc calls `id` "Beitrags-ID" (probably the ID of the assignment).

const DATE_FORMAT = 'tt.mm.jjjj or jjjj-mm-tt';

export const FEES: FunctionDef[] = [
  {
    api: 'GetMemberFees',
    toolset: 'fees',
    klass: 'read',
    description: 'List all membership fees. Required API-user role: Members fees = read.',
    params: {},
    list: true,
  },
  {
    api: 'GetMemberUserfees',
    toolset: 'fees',
    klass: 'read',
    description:
      'List fee assignments of members. Required API-user role: Members = read all/change.',
    params: {
      userid: z.number().int().optional().describe('Member ID.'),
    },
    list: true,
  },
  {
    api: 'AddMemberUserfees',
    toolset: 'fees',
    klass: 'write',
    description:
      'Create a fee assignment for a member (beitragid or beitraggruppe is required). Required API-user role: Member data = change.',
    params: {
      userid: z.number().int().describe('Member ID.'),
      anzahl: z.number().int().optional().describe('Count (set to 1 if missing).'),
      beitragid: z.number().int().optional().describe('Fee ID (beitragid or beitraggruppe is required).'),
      beitraggruppe: z.string().optional().describe('Fee group name (beitragid or beitraggruppe is required).'),
      datum1: z.string().optional().describe(`Fee start (${DATE_FORMAT}).`),
      datum2: z.string().optional().describe(`Fee end (${DATE_FORMAT}).`),
      datumerstellt: z.string().optional().describe(`Created until (${DATE_FORMAT}).`),
      anmerkung: z.string().optional().describe('Note.'),
    },
    guard: (_args, _config, body) => {
      if (body.beitragid === undefined && body.beitraggruppe === undefined) {
        throw new GateError('AddMemberUserfees braucht beitragid oder beitraggruppe.');
      }
    },
  },
  {
    api: 'UpdateMemberUserfees',
    toolset: 'fees',
    klass: 'write',
    description:
      'Update fee assignments. Identify them by userid plus beitragid, by userid plus beitraggruppe, or by id. Required API-user role: Member data = change.',
    params: {
      userid: z.number().int().optional().describe('Member ID (with beitragid or beitraggruppe).'),
      beitragid: z.number().int().optional().describe('Fee ID (with userid).'),
      beitraggruppe: z.string().optional().describe('Fee group name (with userid).'),
      id: z.number().int().optional().describe('ID of the fee assignment.'),
      anzahl: z.number().int().optional().describe('Count (set to 1 if missing).'),
      datum1: z.string().optional().describe(`Fee start (${DATE_FORMAT}).`),
      datum2: z.string().optional().describe(`Fee end (${DATE_FORMAT}).`),
      datumerstellt: z.string().optional().describe(`Created until (${DATE_FORMAT}).`),
      anmerkung: z.string().optional().describe('Note.'),
    },
    guard: (_args, _config, body) => {
      const byId = body.id !== undefined;
      const byUser = body.userid !== undefined && (body.beitragid !== undefined || body.beitraggruppe !== undefined);
      if (!byId && !byUser) {
        throw new GateError('UpdateMemberUserfees braucht id oder userid mit beitragid bzw. beitraggruppe.');
      }
    },
  },
  {
    api: 'DeleteMemberUserfees',
    toolset: 'fees',
    klass: 'delete',
    description:
      'Delete fee assignments and return the number deleted. Required API-user role: Member data = change.',
    params: {
      id: z.number().int().describe('Fee ID.'),
      userid: z.number().int().optional().describe('Member ID.'),
    },
  },
];
