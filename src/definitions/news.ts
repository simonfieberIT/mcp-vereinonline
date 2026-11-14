import { z } from 'zod';
import type { FunctionDef } from '../registry';

export const NEWS: FunctionDef[] = [
  {
    api: 'GetNews',
    toolset: 'news',
    klass: 'read',
    description:
      'List current public news items (only valid, public, unrestricted ones). Requires API-user role: Startseite Aktuelles = read.',
    params: {
      alle: z.literal('ja').optional().describe('"ja" also returns expired news.'),
      maximal: z.number().int().min(1).optional().describe('Maximum number of news items.'),
      id: z.number().int().optional().describe('Load only this news ID.'),
      condition: z.string().optional().describe('Filter: field=value, gruppenid=.. or rollenid=..'),
    },
    list: true,
  },
];
