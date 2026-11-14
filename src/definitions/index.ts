import type { FunctionDef } from '../registry';
import { ACCOUNTING } from './accounting';
import { AUTH } from './auth';
import { CONTACTS } from './contacts';
import { EVENTS } from './events';
import { FEES } from './fees';
import { GROUPS } from './groups';
import { LISTS } from './lists';
import { MEMBERS } from './members';
import { NEWS } from './news';
import { NEWSLETTER } from './newsletter';
import { PICTURES } from './pictures';
import { PLACES } from './places';
import { SHOP } from './shop';

export const ALL_DEFINITIONS: FunctionDef[] = [
  ...MEMBERS,
  ...CONTACTS,
  ...EVENTS,
  ...NEWSLETTER,
  ...LISTS,
  ...PLACES,
  ...FEES,
  ...NEWS,
  ...ACCOUNTING,
  ...GROUPS,
  ...PICTURES,
  ...SHOP,
  ...AUTH,
];
