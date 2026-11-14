import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Config, Profile, ToolClass } from './config';
import { callApi, VereinOnlineError } from './client';

export interface FunctionDef {
  api: string; // 'GetMembers'
  toolset: string; // one of the 13 toolsets
  klass: ToolClass;
  description: string; // English
  params: z.ZodRawShape; // documented parameters only
  openFields?: boolean; // adds `daten`, merged flat into the body (named params win)
  list?: boolean; // array results are truncated, `maxResults` is added
  mayMail?: boolean; // appends the "May send e-mail (unverified)." note
  guard?: (args: Record<string, unknown>, config: Config, body: Record<string, unknown>) => void; // throws GateError
  normalize?: (body: Record<string, unknown>) => void; // runs after the guard, before the call; may drop body keys
  postProcess?: (result: unknown) => unknown;
}

export class GateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GateError';
  }
}

export type CallFn = (
  profile: Profile,
  fn: string,
  params: Record<string, unknown>,
) => Promise<unknown>;

export const DEFAULT_MAX_RESULTS = 50;
export const MAX_RESULTS_LIMIT = 500;
export const MAX_RESPONSE_CHARS = 100_000;
export const PREVIEW_CHARS = 20_000;
export const CONTROL_KEYS = ['confirm', 'maxResults', 'verein', 'daten'] as const;

export function toolName(api: string): string {
  const snake = api
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
  return `vo_${snake}`;
}

export function isEnabled(def: FunctionDef, config: Config): boolean {
  if (!config.toolsets.has(def.toolset)) return false;
  return def.klass === 'read' || config.allow[def.klass] === true;
}

export function truncateList(result: unknown, max: number): unknown {
  if (!Array.isArray(result)) return result;
  const items = result.slice(0, max);
  return {
    total: result.length,
    shown: items.length,
    truncated: result.length > items.length,
    items,
  };
}

/** Only an integer from 1 to 500 is accepted; anything else falls back to the default. */
export function clampMaxResults(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_RESULTS_LIMIT
    ? value
    : DEFAULT_MAX_RESULTS;
}

function isIdKeyedObjectList(value: unknown, max: number): value is Record<string, Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const entries = Object.values(value as Record<string, unknown>);
  return entries.length > max && entries.every((v) => typeof v === 'object' && v !== null);
}

/**
 * Shared by every tool result: truncates arrays and id-keyed object lists (unless lists is false),
 * then caps the overall size so no response floods the model.
 */
export function finalizeResult(
  result: unknown,
  maxResults: number,
  options: { lists?: boolean } = {},
): unknown {
  let value = result;
  if (options.lists !== false) {
    if (Array.isArray(value)) {
      value = truncateList(value, maxResults);
    } else if (isIdKeyedObjectList(value, maxResults)) {
      const entries = Object.entries(value);
      value = {
        total: entries.length,
        shown: maxResults,
        truncated: true,
        items: Object.fromEntries(entries.slice(0, maxResults)),
      };
    }
  }
  const json = JSON.stringify(value);
  if (json !== undefined && json.length > MAX_RESPONSE_CHARS) {
    return {
      truncated: true,
      totalChars: json.length,
      note: `Response too large (${json.length} characters); showing the first ${PREVIEW_CHARS} characters. Narrow with felder, filter or maxResults.`,
      preview: json.slice(0, PREVIEW_CHARS),
    };
  }
  return value;
}

export function selectProfile(args: Record<string, unknown>, config: Config): Profile {
  const names = config.profiles.map((p) => p.name);
  if (config.profiles.length === 1) return config.profiles[0] as Profile;
  const wanted = args.verein;
  const profile = typeof wanted === 'string' ? config.profiles.find((p) => p.name === wanted) : undefined;
  if (!profile) {
    throw new GateError(
      `Parameter "verein" fehlt oder ist unbekannt. Gültige Werte: ${names.join(', ')}.`,
    );
  }
  return profile;
}

export async function runFunction(
  def: FunctionDef,
  args: Record<string, unknown>,
  config: Config,
  call: CallFn,
): Promise<unknown> {
  if ((def.klass === 'delete' || def.klass === 'send') && args.confirm !== true) {
    throw new GateError(
      `${def.api} braucht ausdrücklich confirm: true (Aktion der Klasse "${def.klass}").`,
    );
  }
  const profile = selectProfile(args, config);
  const isControl = (key: string) => (CONTROL_KEYS as readonly string[]).includes(key);
  const body: Record<string, unknown> = {};
  if (def.openFields && typeof args.daten === 'object' && args.daten !== null) {
    for (const [key, value] of Object.entries(args.daten as Record<string, unknown>)) {
      if (!isControl(key) && value !== undefined) body[key] = value;
    }
  }
  for (const [key, value] of Object.entries(args)) {
    if (isControl(key) || value === undefined) continue;
    body[key] = value;
  }
  def.guard?.(args, config, body);
  def.normalize?.(body);

  let result = await call(profile, def.api, body);
  if (def.postProcess) result = def.postProcess(result);
  return finalizeResult(result, clampMaxResults(args.maxResults), { lists: def.list === true });
}

export function buildShape(def: FunctionDef, config: Config): z.ZodRawShape {
  const shape: Record<string, z.core.$ZodType> = { ...def.params };
  if (def.list) {
    shape.maxResults = z
      .number()
      .int()
      .min(1)
      .max(MAX_RESULTS_LIMIT)
      .default(DEFAULT_MAX_RESULTS)
      .describe(`Maximum number of list entries to return (1-${MAX_RESULTS_LIMIT}, default ${DEFAULT_MAX_RESULTS}).`);
  }
  if (def.openFields) {
    shape.daten = z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
      .optional()
      .describe('Additional flat fields (e.g. key_Hobby) merged into the request body.');
  }
  if (def.klass === 'delete' || def.klass === 'send') {
    shape.confirm = z.literal(true).describe('Must be true to confirm this action.');
  }
  if (config.profiles.length > 1) {
    const names = config.profiles.map((p) => p.name) as [string, ...string[]];
    shape.verein = z.enum(names).describe('Name of the association profile to use.');
  }
  return shape;
}

export type ToolResult = { isError?: true; content: Array<{ type: 'text'; text: string }> };

export function errorResult(message: string): ToolResult {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

export function registerAll(
  server: McpServer,
  defs: FunctionDef[],
  config: Config,
  call: CallFn = callApi,
): string[] {
  const names: string[] = [];
  for (const def of defs) {
    if (!isEnabled(def, config)) continue;
    const name = toolName(def.api);
    const description = def.mayMail ? `${def.description} May send e-mail (unverified).` : def.description;
    server.registerTool(
      name,
      { description, inputSchema: buildShape(def, config) },
      async (args: Record<string, unknown>): Promise<ToolResult> => {
        try {
          const result = await runFunction(def, args ?? {}, config, call);
          return { content: [{ type: 'text', text: JSON.stringify(result) }] };
        } catch (err) {
          if (err instanceof GateError || err instanceof VereinOnlineError) {
            return errorResult(err.message);
          }
          // Never forward unknown error details (could contain secrets or internals).
          console.error(`Unexpected error in ${name}: ${err instanceof Error ? err.name : typeof err}`);
          return errorResult('Internal error while executing the tool.');
        }
      },
    );
    names.push(name);
  }
  return names;
}
