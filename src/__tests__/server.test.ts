import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { OpenMercantilClient } from '../openmercantil-client.js';
import { GLOBAL_LIMIT_KEY, createServer, toolTitle } from '../server.js';

type Options = Partial<Parameters<typeof createServer>[0]>;

/** Starts the server and a real MCP client over a linked in-memory transport pair. */
async function connect(options: Options = {}) {
  const apiClient = new OpenMercantilClient();
  const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ items: [] });
  const { server, tools } = createServer({
    client: apiClient,
    version: '9.9.9',
    requestsPerMinute: 60,
    maxResponseChars: 60_000,
    ...options,
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, get, tools, close: () => client.close() };
}

const text = (result: unknown) => (result as { content: { text: string }[] }).content[0].text;

describe('createServer', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports its name and the injected version', async () => {
    const { client, close } = await connect();
    expect(client.getServerVersion()).toMatchObject({ name: 'mcp-borme', version: '9.9.9' });
    await close();
  });

  describe('tools/list', () => {
    it('lists the 37 tools, all read-only, open-world and titled', async () => {
      const { client, close } = await connect();
      const { tools } = await client.listTools();

      expect(tools).toHaveLength(37);
      for (const tool of tools) {
        expect(tool.annotations?.readOnlyHint, tool.name).toBe(true);
        expect(tool.annotations?.openWorldHint, tool.name).toBe(true);
        expect(tool.annotations?.title, tool.name).toMatch(/^[A-Z]/);
        expect(tool.inputSchema.type).toBe('object');
      }
      await close();
    });
  });

  describe('tools/call', () => {
    it('returns the serialized handler result', async () => {
      const { client, get, close } = await connect();
      const result = await client.callTool({
        name: 'borme_search_companies',
        arguments: { q: 'telefonica' },
      });

      expect(result.isError).toBeFalsy();
      expect(JSON.parse(text(result))).toEqual({ items: [] });
      expect(get).toHaveBeenCalledWith('/api/v1/search', { q: 'telefonica', limit: 10, offset: 0 });
      await close();
    });

    it('treats missing arguments as an empty object', async () => {
      const { client, get, close } = await connect();
      const result = await client.callTool({ name: 'borme_get_health' });
      expect(result.isError).toBeFalsy();
      expect(get).toHaveBeenCalledWith('/api/v1/health');
      await close();
    });

    it('rejects an unknown tool with a protocol error', async () => {
      const { client, close } = await connect();
      await expect(client.callTool({ name: 'borme_does_not_exist' })).rejects.toThrow(
        /Unknown tool: borme_does_not_exist/
      );
      await close();
    });

    it('returns isError with the message when the handler fails', async () => {
      const { client, get, close } = await connect();
      get.mockRejectedValue(new Error('OpenMercantil API error (503): projection_unavailable'));
      const result = await client.callTool({
        name: 'borme_get_company_grants',
        arguments: { slug: 'a-sl' },
      });

      expect(result.isError).toBe(true);
      expect(text(result)).toBe('Error: OpenMercantil API error (503): projection_unavailable');
      await close();
    });

    it('returns isError on validation failure without calling the API', async () => {
      const { client, get, close } = await connect();
      const result = await client.callTool({
        name: 'borme_get_company',
        arguments: { slug: '../admin' },
      });

      expect(result.isError).toBe(true);
      expect(text(result)).toMatch(/Validation error: slug/);
      expect(get).not.toHaveBeenCalled();
      await close();
    });

    it('caps oversized responses with a valid JSON envelope', async () => {
      const { client, get, close } = await connect({ maxResponseChars: 1_000 });
      get.mockResolvedValue({ blob: 'x'.repeat(5_000) });
      const result = await client.callTool({ name: 'borme_get_stats' });

      expect(text(result).length).toBeLessThanOrEqual(1_000);
      expect(JSON.parse(text(result))).toMatchObject({ truncated: true, max_chars: 1_000 });
      await close();
    });
  });

  describe('rate limiting', () => {
    it('blocks a single tool once its own window is exhausted, without hitting the API', async () => {
      const { client, get, close } = await connect({ perToolRequestsPerMinute: 2 });

      await client.callTool({ name: 'borme_get_stats' });
      await client.callTool({ name: 'borme_get_stats' });
      const blocked = await client.callTool({ name: 'borme_get_stats' });

      expect(blocked.isError).toBe(true);
      const body = JSON.parse(text(blocked));
      expect(body.error).toBe('Rate limit exceeded');
      expect(body.message).toMatch(/for tool 'borme_get_stats'/);
      expect(body.retryAfter).toBeGreaterThanOrEqual(1);
      expect(get).toHaveBeenCalledTimes(2);

      // Other tools are unaffected by that tool's window.
      const other = await client.callTool({ name: 'borme_get_health' });
      expect(other.isError).toBeFalsy();
      await close();
    });

    it('blocks every tool once the global window is exhausted', async () => {
      const { client, get, close } = await connect({ requestsPerMinute: 2 });

      await client.callTool({ name: 'borme_get_stats' });
      await client.callTool({ name: 'borme_get_health' });
      const blocked = await client.callTool({ name: 'borme_get_tender_stats' });

      expect(blocked.isError).toBe(true);
      const body = JSON.parse(text(blocked));
      expect(body.message).toMatch(/^Too many requests\. Please retry/);
      expect(body.message).not.toMatch(/for tool/);
      expect(get).toHaveBeenCalledTimes(2);
      await close();
    });

    it('lets calls through again after the window passes', async () => {
      const { client, close } = await connect({ requestsPerMinute: 1 });
      await client.callTool({ name: 'borme_get_stats' });
      expect((await client.callTool({ name: 'borme_get_stats' })).isError).toBe(true);

      vi.setSystemTime(Date.now() + 61_000);
      expect((await client.callTool({ name: 'borme_get_stats' })).isError).toBeFalsy();
      await close();
    });

    it('uses a dedicated key for the shared window', () => {
      expect(GLOBAL_LIMIT_KEY).toBe('__all_tools__');
    });
  });
});

describe('toolTitle', () => {
  it.each([
    ['borme_search_companies', 'Search companies'],
    ['borme_get_company_ted', 'Get company TED'],
    ['borme_get_cnae_tree', 'Get CNAE tree'],
    ['borme_get_company_bde', 'Get company BDE'],
  ])('%s -> %s', (name, title) => {
    expect(toolTitle(name)).toBe(title);
  });
});
