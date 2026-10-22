import { describe, it, expect } from 'vitest';
import { OpenMercantilClient } from '../openmercantil-client.js';
import { getCompanyTools } from '../tools/companies.js';
import { getCompanySourceTools } from '../tools/company-sources.js';
import { getBulletinTools } from '../tools/bulletin.js';
import { getPersonTools } from '../tools/persons.js';
import { getSectorTools } from '../tools/sectors.js';
import { getLegalTools } from '../tools/legal.js';
import { getTenderTools } from '../tools/tenders.js';
import { getSystemTools } from '../tools/system.js';

const client = new OpenMercantilClient();
const allTools = {
  ...getCompanyTools(client),
  ...getCompanySourceTools(client),
  ...getBulletinTools(client),
  ...getPersonTools(client),
  ...getSectorTools(client),
  ...getLegalTools(client),
  ...getTenderTools(client),
  ...getSystemTools(client),
};
const entries = Object.entries(allTools);

describe('tool registry', () => {
  it('exposes the 37 documented tools', () => {
    expect(entries).toHaveLength(37);
  });

  it.each(entries)('%s is a read-only, well-formed tool', (name, tool) => {
    expect(name).toMatch(/^borme_[a-z_]+$/);
    expect(tool.readOnlyHint).toBe(true);
    expect(tool.description.length).toBeGreaterThan(80);
    expect(tool.inputSchema.type).toBe('object');
    expect(Array.isArray(tool.inputSchema.required)).toBe(true);
    expect(typeof tool.handler).toBe('function');
  });

  it('marks required parameters and keeps defaults optional', () => {
    const events = allTools.borme_get_company_events.inputSchema as {
      required: string[];
      properties: Record<string, { default?: unknown }>;
    };
    expect(events.required).toEqual(['slug']);
    expect(events.properties.page.default).toBe(1);
  });

  it('describes every parameter for the model', () => {
    for (const [name, tool] of entries) {
      const props = (tool.inputSchema.properties ?? {}) as Record<string, { description?: string }>;
      for (const [param, schema] of Object.entries(props)) {
        expect(schema.description, `${name}.${param} lacks a description`).toBeTruthy();
      }
    }
  });

  it('does not leak zod safe-integer bounds into the JSON schema', () => {
    expect(JSON.stringify(allTools)).not.toContain('9007199254740991');
  });
});
