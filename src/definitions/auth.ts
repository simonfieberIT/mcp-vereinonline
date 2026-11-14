import { z } from 'zod';
import type { FunctionDef } from '../registry';

const PASSWORD_WARNING =
  'WARNING: the member\'s password is passed as a tool argument and therefore appears in the conversation.';

/** Removes the session token from object results; everything else is returned unchanged. */
function stripToken(result: unknown): unknown {
  if (typeof result !== 'object' || result === null || Array.isArray(result)) return result;
  const { token: _token, ...rest } = result as Record<string, unknown>;
  return rest;
}

export const AUTH: FunctionDef[] = [
  {
    api: 'VerifyLogin',
    toolset: 'auth',
    klass: 'read',
    description:
      `Check a member login. ${PASSWORD_WARNING} ` +
      'Returns "lastname, firstname" (default), the id, or name and email; an empty string means failed login. ' +
      'Requires API-user role: Mitgliederdaten = read all or change.',
    params: {
      user: z.string().describe('User login.'),
      password: z.string().describe('Password of the member (appears in the conversation).'),
      result: z
        .enum(['id', 'nameemail'])
        .optional()
        .describe('"id" returns the id, "nameemail" returns name and email; otherwise "lastname, firstname".'),
    },
  },
  {
    api: 'CheckLogin',
    toolset: 'auth',
    klass: 'read',
    description:
      `Check a member login and return email, first/last name, role and id (the token is removed). ${PASSWORD_WARNING} ` +
      'Requires API-user role: Mitgliederdaten = read all or change.',
    params: {
      user: z.string().describe('User login.'),
      password: z.string().describe('Password of the member (appears in the conversation).'),
      auth: z
        .string()
        .optional()
        .describe('Check role/group membership, e.g. "rolle:NAME1,rolle:NAME2,gruppe:NAME3" (IDs also possible).'),
      felder: z.string().optional().describe('Extra fields to return: p_email,g_email,rollen,gruppen.'),
    },
    postProcess: stripToken,
  },
  {
    api: 'SendLogin',
    toolset: 'auth',
    klass: 'send',
    description:
      'Create and send new access credentials to a member by e-mail. Requires confirm. ' +
      'Requires API-user roles: Mitgliederdaten = change and Mail senden = send.',
    params: {
      id: z.number().int().describe('Member ID.'),
    },
  },
];
