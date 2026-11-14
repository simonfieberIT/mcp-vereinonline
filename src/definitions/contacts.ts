import type { FunctionDef } from '../registry';
import { CREATE_PARAMS, LIST_PARAMS, MEMBERS } from './members';

// The API documents contacts only as "analog" to the member functions
// (GetContacts, GetContact, CreateContact), so the member parameter sets are reused.
const getMember = MEMBERS.find((d) => d.api === 'GetMember') as FunctionDef;

export const CONTACTS: FunctionDef[] = [
  {
    api: 'GetContacts',
    toolset: 'contacts',
    klass: 'read',
    description:
      'List external contacts (same parameters as GetMembers). The operator may restrict the returned fields. Requires member data = read.',
    params: LIST_PARAMS,
    list: true,
  },
  {
    api: 'GetContact',
    toolset: 'contacts',
    klass: 'read',
    description: 'Get all data of one external contact by id. Requires member data = read.',
    params: getMember.params,
  },
  {
    api: 'CreateContact',
    toolset: 'contacts',
    klass: 'write',
    description:
      'Create an external contact; returns the new id. Further fields (e.g. key_FELDNAME) go into "daten". Requires member data = change/add.',
    params: CREATE_PARAMS,
    openFields: true,
  },
];
