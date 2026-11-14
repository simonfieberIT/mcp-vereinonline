import { z } from 'zod';
import type { FunctionDef } from '../registry';

const str = (description: string) => z.string().optional().describe(description);

/** Query parameters of GetMembers (shared with GetContacts, documented as "analog"). */
export const LIST_PARAMS = {
  felder: str(
    'Additional fields to return, comma-separated; also "rollen", "gruppen", "beitraege", "beitraegewert", "beitragsdaten" and extra fields "key_...".',
  ),
  filter: str(
    "SQL-like restriction on member fields only (no extra fields, no parentheses), e.g. nachname='Meier' AND geburtstag>'2010-01-01'; or rolle=123, gruppe=456, gruppenleiter=123, key_FELDNAME=wert.",
  ),
  rolle: str('Restrict to one role, e.g. "Mitglieder".'),
  gruppe: str('Restrict to one group, e.g. "Tennis".'),
  sort: str('Fields to sort by (default: nachname, vorname).'),
  suche: str('Search term, matches first and last name.'),
  plz: str('Postal code (##### or D-##### or A-#### or CH-####); returns geo position and distance in km (geodata must be enabled).'),
  km: z.number().optional().describe('Radius in km to restrict the plz search.'),
};

/** Fields for creating a member (shared with CreateContact, documented as "analog"). */
export const CREATE_PARAMS = {
  vorname: str('First name.'),
  nachname: str('Last name.'),
  rolle: str('Role name.'),
  gruppe: str('Group name.'),
  rollen: str('Role names, comma-separated.'),
  gruppen: str('Group names, comma-separated.'),
  beitraege: str('Fee names, comma-separated.'),
  beitragsgruppen: str('Fee group names, comma-separated.'),
  einheit: str('Unit abbreviation (VerbandOnline only).'),
};

const idParam = z.union([z.number(), z.string()]).describe('ID of the record.');

export const MEMBERS: FunctionDef[] = [
  {
    api: 'GetMembers',
    toolset: 'members',
    klass: 'read',
    description:
      'List members (default fields: id, mandant, vorname, nachname, firma, p_freigabe, g_freigabe, freigabe, foto; name and fotourl are added to the result). The operator may restrict the fields. Requires member data = read.',
    params: LIST_PARAMS,
    list: true,
  },
  {
    api: 'GetMember',
    toolset: 'members',
    klass: 'read',
    description:
      'Get all data of one member by id (incl. extra fields, rollen, gruppen). The operator may restrict the returned fields. Requires member data = read.',
    params: { id: idParam },
  },
  {
    api: 'CreateMember',
    toolset: 'members',
    klass: 'write',
    description:
      'Create a member; returns the new id. Further fields (e.g. key_FELDNAME) go into "daten". Requires member data = change/add.',
    params: CREATE_PARAMS,
    openFields: true,
    mayMail: true,
  },
  {
    api: 'UpdateMember',
    toolset: 'members',
    klass: 'write',
    description:
      'Update a member by id. Further fields go into "daten". For rollen, gruppen, beitraege, beitragsgruppen a leading "-" on a name removes it. Requires member data = change.',
    params: {
      id: idParam,
      vorname: CREATE_PARAMS.vorname,
      nachname: CREATE_PARAMS.nachname,
      rollen: str('Role names, comma-separated; prefix a name with "-" to remove it.'),
      gruppen: str('Group names, comma-separated; prefix a name with "-" to remove it.'),
      beitraege: str('Fee names, comma-separated; prefix a name with "-" to remove it.'),
      beitragsgruppen: str('Fee group names, comma-separated; prefix a name with "-" to remove it.'),
      beitraganzahl: z.number().optional().describe('Number of fees (together with beitraege).'),
      beitragstart: str('Fee start date, e.g. "1.1.2025" (together with beitraege).'),
      beitragende: str('Fee end date, e.g. "31.12.2025" (together with beitraege).'),
      einheit: CREATE_PARAMS.einheit,
    },
    openFields: true,
  },
  {
    api: 'DeleteMember',
    toolset: 'members',
    klass: 'delete',
    description: 'Delete a member by id. Irreversible. Requires member data = change/add/delete.',
    params: { id: idParam },
  },
];
