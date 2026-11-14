import type { FunctionDef } from '../registry';

export const PICTURES: FunctionDef[] = [
  {
    api: 'GetPictures',
    toolset: 'pictures',
    klass: 'read',
    description:
      'List picture galleries (id, datum, titel, nachlese, bilder, bildersmall, text). Requires API-user role: Bilder = read.',
    params: {},
    list: true,
  },
];
