import { z } from 'zod';
import type { FunctionDef } from '../registry';

// Source: docs/vereinonline-api-doc.txt, section "Newsletter".
export const NEWSLETTER: FunctionDef[] = [
  {
    api: 'GetNewsletter',
    toolset: 'newsletter',
    klass: 'read',
    description:
      'List all public newsletters (id, datum, titel, html, beitraege). Required API-user role: none.',
    params: {},
    list: true,
  },
  {
    api: 'GetNewsletterBeitrag',
    toolset: 'newsletter',
    klass: 'read',
    description:
      'Get public newsletter articles (id, rubrik, datum, subject, body, attachments, newsletterid, extra fields). Filter by extra field with daten: { key_FIELDNAME: value }. Required API-user role: none.',
    params: {
      id: z.number().int().optional().describe('ID of a single article.'),
      monat: z.number().int().optional().describe('Only articles from the last N months.'),
    },
    openFields: true,
    list: true,
  },
  {
    api: 'CreateSubscriber',
    toolset: 'newsletter',
    klass: 'write',
    description:
      'Create a newsletter subscriber. Additional subscriber fields via daten. Required API-user role: External contacts = change/add.',
    params: {
      vorname: z.string().describe('First name.'),
      nachname: z.string().describe('Last name.'),
      g_email: z.string().describe('E-mail address.'),
      gruppe: z.string().optional().describe('Newsletter group.'),
    },
    openFields: true,
    mayMail: true,
  },
];
