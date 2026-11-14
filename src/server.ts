import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Config } from './config';
import { ALL_DEFINITIONS } from './definitions/index';
import { registerRaw } from './raw';
import { registerAll, type CallFn } from './registry';

const FALLBACK_VERSION = '0.1.0';

function readVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, '..', 'package.json'), 'utf8')) as {
      version?: unknown;
    };
    return typeof pkg.version === 'string' ? pkg.version : FALLBACK_VERSION;
  } catch {
    return FALLBACK_VERSION;
  }
}

export function createServer(config: Config, call?: CallFn): McpServer {
  const server = new McpServer({ name: 'mcp-vereinonline', version: readVersion() });
  registerAll(server, ALL_DEFINITIONS, config, call);
  registerRaw(server, ALL_DEFINITIONS, config, call);
  return server;
}
