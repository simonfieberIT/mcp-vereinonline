import { z } from 'zod';
import type { FunctionDef } from '../registry';

export const SHOP: FunctionDef[] = [
  {
    api: 'GetShop',
    toolset: 'shop',
    klass: 'read',
    description:
      'List shop articles (main articles incl. extra fields, stock, url). Requires API-user role: Online-Shop = order.',
    params: {
      maximal: z.number().int().min(1).optional().describe('Maximum number of records.'),
      kategorie: z.string().optional().describe('Filter by category.'),
      parentid: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe('0 returns only main articles; >0 only the sub-articles of that main article.'),
      mandant: z.string().optional().describe('Filter by unit (VerbandOnline only).'),
      alle: z.literal('ja').optional().describe('"ja" returns all articles, not only orderable ones.'),
    },
    list: true,
  },
  {
    api: 'GetShopReservations',
    toolset: 'shop',
    klass: 'read',
    description:
      'List shop reservations of a member or external contact. Requires API-user role: Online-Shop verwalten = read.',
    params: {
      userid: z.number().int().describe('ID of the member or external contact.'),
    },
    list: true,
  },
];
