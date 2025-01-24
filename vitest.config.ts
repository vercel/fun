import { defineConfig } from 'vitest/config';
import structuredClone from '@ungap/structured-clone';

if (!("structuredClone" in globalThis)) {
  globalThis.structuredClone = structuredClone;
}

export default defineConfig({
	test: {
		globals: true,
		environment: 'node',
    testTimeout: 40_000,
    include: ['test/test.ts']
	}
});