import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		globals: true,
		environment: 'node',
    testTimeout: 40_000,
    include: ['test/test.ts']
	}
});