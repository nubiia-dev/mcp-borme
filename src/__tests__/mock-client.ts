import { vi } from 'vitest';
import { OpenMercantilClient } from '../openmercantil-client.js';

export function createMockClient() {
  const client = new OpenMercantilClient('test-api-key');

  vi.spyOn(client, 'get').mockResolvedValue({});

  return client;
}
