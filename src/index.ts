#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ConfigError, loadConfig } from './config';
import { createServer } from './server';

async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      // stdout is reserved for the MCP protocol: diagnostics go to stderr only.
      process.stderr.write(`mcp-vereinonline: ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }
  const server = createServer(config);
  await server.connect(new StdioServerTransport());
}

main().catch((err: unknown) => {
  process.stderr.write(`mcp-vereinonline: fatal: ${err instanceof Error ? err.name : 'unknown error'}\n`);
  process.exit(1);
});
