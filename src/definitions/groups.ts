import { z } from 'zod';
import type { FunctionDef } from '../registry';

export const GROUPS: FunctionDef[] = [
  {
    api: 'GetGroups',
    toolset: 'groups',
    klass: 'read',
    description: 'List all groups (id, name, ...). No special API-user role required.',
    params: {
      typ: z.literal('v').optional().describe('"v" returns only event groups.'),
    },
    list: true,
  },
  {
    api: 'CreateGroup',
    toolset: 'groups',
    klass: 'write',
    description: 'Create a group, returns the new group id. Requires API-user role: Administration Gruppen = change/add.',
    params: {
      name: z.string().describe('Group name.'),
      beschreibung: z.string().optional().describe('Description.'),
      parentid: z.number().int().optional().describe('ID of the parent group.'),
      autoregeln: z.string().optional().describe('Auto rules.'),
    },
    openFields: true,
  },
];
