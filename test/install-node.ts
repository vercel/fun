import { join } from 'path';
import { tmpdir } from 'os';
import * as execa from 'execa';
import * as assert from 'assert';
import { mkdirp, remove } from 'fs-extra';
import { generateTarballUrl, installNode } from '../src/install-node';

describe('generateTarballUrl()', () => {
	it('should generate a Node.js tarball URL', async function () {
		assert.equal(
			'https://nodejs.org/dist/v8.10.0/node-v8.10.0-darwin-x64.tar.gz',
			generateTarballUrl('8.10.0', 'darwin', 'x64')
		);
	});
});

describe('installNode()', () => {
	it(`should install a \`node\` binary for "${process.platform}"`, async function () {
		this.slow(5 * 1000);
		this.timeout(10 * 1000);

		const version = 'v10.0.0';
		const dest = join(
			tmpdir(),
			`install-node-${Math.random()
				.toString(16)
				.substring(2)}`
		);
		await mkdirp(dest);
		try {
			await installNode(dest, version);
			const res = await execa(join(dest, 'bin/node'), [
				'-p',
				'process.version'
			]);
			assert.equal(res.stdout.trim(), version);
		} finally {
			// Clean up
			await remove(dest);
		}
	});
});
