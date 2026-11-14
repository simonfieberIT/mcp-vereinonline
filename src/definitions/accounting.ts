import { z } from 'zod';
import type { FunctionDef } from '../registry';

const dateHint = 'Format dd.mm.yyyy or yyyy-mm-dd.';

export const ACCOUNTING: FunctionDef[] = [
  {
    api: 'GetJournal',
    toolset: 'accounting',
    klass: 'read',
    description:
      'List bookings of the journal for a date range. Requires API-user role: Kasse Buchführung = read.',
    params: {
      datumab: z.string().describe(`Start date (required). ${dateHint}`),
      datumbis: z.string().describe(`End date (required). ${dateHint}`),
    },
    list: true,
  },
  {
    api: 'GetInvoice',
    toolset: 'accounting',
    klass: 'read',
    description:
      'Get one invoice with all fields, extra fields and positions. Requires API-user role: Kasse Buchführung = read.',
    params: {
      id: z.number().int().describe('Invoice ID.'),
    },
  },
  {
    // NOTE: The API documentation lists the method name of "Erstellen einer Rechnung/Buchung"
    // mistakenly as "GetInvoice". The example call and the section title both use "CreateInvoice",
    // which is the name used here.
    api: 'CreateInvoice',
    toolset: 'accounting',
    klass: 'write',
    description:
      'Create an invoice/booking. Requires API-user role: Kasse Buchführung = change/add. ' +
      'Numbered keys go into "daten" and use 1, 2, 3, ... instead of #: kontonr#/kontobetrag# (booking accounts and amounts), ' +
      'positionanzahl#/positionbetrag#/positiontext#/positiontextlang#/positionartikelid# (invoice positions). ' +
      'Example daten: {"kontonr1":"1000","kontobetrag1":123.45,"kontonr2":"1001","kontobetrag2":-123.45,' +
      '"positionanzahl1":3,"positionbetrag1":30,"positiontext1":"A"}.',
    params: {
      datum: z.string().describe('Booking date.'),
      betrag: z.number().describe('Booking amount.'),
      bezahltdatum: z.string().optional().describe('Paid date.'),
      mwst: z.number().optional().describe('VAT, e.g. 19.'),
      bezahlt: z.number().optional().describe('Paid amount.'),
      status: z.number().int().min(0).max(3).optional().describe('0=unsent, 1=open, 2=in payment, 3=paid.'),
      userid: z.number().int().optional().describe('Member ID.'),
      zweck: z.string().optional().describe('Purpose of the booking/invoice.'),
      rechnungsnummer: z.string().optional().describe('Invoice number.'),
      beleg: z.string().optional().describe('Receipt number.'),
      bezahlart: z.number().int().optional().describe('Payment method: 1=direct debit, 2=transfer, 9=cash.'),
      attachment: z.string().optional().describe('Content of a PDF, stored as attachment.'),
      kostenstelle: z.string().optional().describe('Cost center.'),
      quelle: z
        .number()
        .int()
        .min(0)
        .max(5)
        .optional()
        .describe('Source: 0=general receipt, 1=membership fee, 2=shop purchase, 3=paid event, 4=donation, 5=place booking.'),
    },
    openFields: true,
  },
  {
    api: 'GetShopPurchases',
    toolset: 'accounting',
    klass: 'read',
    description:
      'List shop purchases of a member or external contact (date, quantity, article ID). Requires API-user role: Kasse Buchführung = read.',
    params: {
      userid: z.number().int().describe('ID of the member or external contact.'),
    },
    list: true,
  },
];
