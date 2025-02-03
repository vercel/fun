import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		globals: true,
		environment: 'node',
		testTimeout: 40_000,
		include: ['dist/test/test.js'],
		exclude: ['**/node_modules/**','**/.{idea,git,cache,output,temp}/**']
	}
});
