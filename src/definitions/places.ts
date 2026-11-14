import { z } from 'zod';
import { GateError, type FunctionDef } from '../registry';

// Source: https://www.vereinonline.org/api, section "Platzbuchung".
// The doc heading says "DeletePlaceBooking", the method name is `DeletePlaceBookings`.

export const PLACES: FunctionDef[] = [
  {
    api: 'GetPlaceBookings',
    toolset: 'places',
    klass: 'read',
    description: 'List place bookings. Required API-user role: Place booking = read.',
    params: {
      beginn: z.string().optional().describe('Start: YYYY-MM-DD or YYYY-MM-DD HH:MM.'),
      ende: z.string().optional().describe('End: YYYY-MM-DD or YYYY-MM-DD HH:MM.'),
      platz: z.string().optional().describe('Place name or place ID.'),
      felder: z
        .string()
        .optional()
        .describe('Further event fields, e.g. "veranstaltung:titel,veranstaltung:key_eventtyp".'),
    },
    list: true,
  },
  {
    api: 'CheckPlace',
    toolset: 'places',
    klass: 'read',
    description:
      'Check whether a place is free in a time range ("-" if free, otherwise "belegt" or details). Required API-user role: Place booking = read.',
    params: {
      platz: z.string().describe('Place name or place ID.'),
      beginn: z.string().describe('Start: YYYY-MM-DD HH:MM.'),
      ende: z.string().describe('End: YYYY-MM-DD HH:MM.'),
    },
  },
  {
    api: 'CreatePlaceBooking',
    toolset: 'places',
    klass: 'write',
    description: 'Create a place booking and return its id. Required API-user role: Place booking = change/add.',
    params: {
      platz: z.string().describe('Place name or place ID.'),
      beginn: z.string().describe('Start: YYYY-MM-DD HH:MM.'),
      ende: z.string().describe('End: YYYY-MM-DD HH:MM.'),
      userid: z.number().int().optional().describe('Member ID.'),
      veranstaltungid: z.number().int().optional().describe('Event ID.'),
      beschreibung: z.string().optional().describe('Public description.'),
      anmerkungen: z.string().optional().describe('Internal note.'),
    },
  },
  {
    api: 'DeletePlaceBookings',
    toolset: 'places',
    klass: 'delete',
    description:
      'Delete place bookings, either by id, or by platz plus beginn and ende (all bookings in that range). Returns the deleted IDs. Required API-user role: Place booking = change/add/delete.',
    params: {
      id: z.number().int().optional().describe('Variant 1: ID of the place booking.'),
      platz: z.string().optional().describe('Variant 2: place name or place ID.'),
      beginn: z.string().optional().describe('Variant 2: start, YYYY-MM-DD HH:MM.'),
      ende: z.string().optional().describe('Variant 2: end, YYYY-MM-DD HH:MM.'),
    },
    guard: (_args, _config, body) => {
      const byId = body.id !== undefined;
      const byRange = body.platz !== undefined && body.beginn !== undefined && body.ende !== undefined;
      if (!byId && !byRange) {
        throw new GateError('DeletePlaceBookings braucht entweder id oder platz, beginn und ende.');
      }
    },
  },
];
