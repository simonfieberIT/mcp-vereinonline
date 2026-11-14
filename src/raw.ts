import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Config } from './config';
import { callApi, VereinOnlineError } from './client';
import {
  CONTROL_KEYS,
  GateError,
  MAX_RESULTS_LIMIT,
  buildShape,
  clampMaxResults,
  errorResult,
  finalizeResult,
  isEnabled,
  runFunction,
  selectProfile,
  type CallFn,
  type FunctionDef,
  type ToolResult,
} from './registry';

const NAME_PATTERN = /^[A-Za-z][A-Za-z0-9]*$/;
const READ_PREFIX = /^(Get|Check)/;

function buildRawShape(config: Config): z.ZodRawShape {
  const shape: Record<string, z.core.$ZodType> = {
    function: z.string().describe('API function name, e.g. GetMembers.'),
    params: z
      .record(z.string(), z.unknown())
      .optional()
      .describe(
        'Request body parameters. Known functions validate them against their documented parameters (undeclared keys are refused); unknown names are sent unchanged.',
      ),
    maxResults: z
      .number()
      .int()
      .min(1)
      .max(MAX_RESULTS_LIMIT)
      .optional()
      .describe(`Maximum number of list entries to return (1-${MAX_RESULTS_LIMIT}, default 50).`),
    confirm: z
      .boolean()
      .optional()
      .describe('Must be true for delete/send functions and for unknown non-read functions.'),
  };
  if (config.profiles.length > 1) {
    const names = config.profiles.map((p) => p.name) as [string, ...string[]];
    shape.verein = z.enum(names).describe('Name of the association profile to use.');
  }
  return shape;
}

/** Same schema as the dedicated tool, minus the top-level control arguments; undeclared keys are refused. */
function validateKnownParams(def: FunctionDef, params: Record<string, unknown>, config: Config): void {
  const shape: Record<string, z.core.$ZodType> = { ...buildShape(def, config) };
  delete shape.confirm;
  delete shape.verein;
  const parsed = z.object(shape).strict().safeParse(params);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => {
        const where = issue.path.length > 0 ? issue.path.join('.') : '(Parameter)';
        return `${where}: ${issue.message}`;
      })
      .join('; ');
    throw new GateError(`Ungültige Parameter für ${def.api}: ${problems}`);
  }
}

export async function runRaw(
  args: Record<string, unknown>,
  defs: FunctionDef[],
  config: Config,
  call: CallFn,
): Promise<unknown> {
  const fn = args.function;
  if (typeof fn !== 'string' || !NAME_PATTERN.test(fn)) {
    throw new GateError('Ungültiger Funktionsname: erlaubt sind nur Buchstaben und Ziffern, beginnend mit einem Buchstaben.');
  }
  if (
    args.params !== undefined &&
    (typeof args.params !== 'object' || args.params === null || Array.isArray(args.params))
  ) {
    throw new GateError('"params" muss ein Objekt sein.');
  }
  const params = (args.params ?? {}) as Record<string, unknown>;

  const def = defs.find((d) => d.api.toLowerCase() === fn.toLowerCase());
  if (def) {
    // Known function: exactly the single-tool rules. Control keys come only from top level.
    const known: Record<string, unknown> = { ...params };
    delete known.confirm;
    delete known.verein;
    if (!isEnabled(def, config)) {
      throw new GateError(
        `${fn} ist nicht freigegeben (Toolset "${def.toolset}" oder Klasse "${def.klass}" deaktiviert).`,
      );
    }
    validateKnownParams(def, known, config);
    if (args.maxResults !== undefined) known.maxResults = args.maxResults;
    if (args.confirm !== undefined) known.confirm = args.confirm;
    if (args.verein !== undefined) known.verein = args.verein;
    return runFunction(def, known, config, call);
  }

  if (!READ_PREFIX.test(fn)) {
    const { write, delete: del, send } = config.allow;
    if (!(write && del && send)) {
      throw new GateError(
        `${fn} ist unbekannt und kein Lesezugriff (Get/Check): vo_raw braucht dafür allow.write, allow.delete und allow.send.`,
      );
    }
    if (args.confirm !== true) {
      throw new GateError(`${fn} ist unbekannt und braucht ausdrücklich confirm: true.`);
    }
  }
  const profile = selectProfile(args, config);
  const body: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if ((CONTROL_KEYS as readonly string[]).includes(key) || value === undefined) continue;
    body[key] = value;
  }
  return finalizeResult(await call(profile, fn, body), clampMaxResults(args.maxResults));
}

export function registerRaw(
  server: McpServer,
  defs: FunctionDef[],
  config: Config,
  call: CallFn = callApi,
): void {
  server.registerTool(
    'vo_raw',
    {
      description:
        'Call any VereinOnline API function by name. Known functions follow the same rules as their dedicated tools. ' +
        'Unknown Get*/Check* names are allowed as reads; any other unknown name needs all of allow.write, allow.delete and allow.send plus confirm: true.',
      inputSchema: buildRawShape(config),
    },
    async (args: Record<string, unknown>): Promise<ToolResult> => {
      try {
        const result = await runRaw(args ?? {}, defs, config, call);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (err) {
        if (err instanceof GateError || err instanceof VereinOnlineError) {
          return errorResult(err.message);
        }
        console.error(`Unexpected error in vo_raw: ${err instanceof Error ? err.name : typeof err}`);
        return errorResult('Internal error while executing the tool.');
      }
    },
  );
}
