import { exec } from "tinyexec";
import { mkdir, rm as remove } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateNodeTarballUrl, installNode } from "../src/install-node";

it('install_node_tarball_url_darwin', () => {
	expect(generateNodeTarballUrl('8.10.0', 'darwin', 'x64')).toBe(
		'https://nodejs.org/dist/v8.10.0/node-v8.10.0-darwin-x64.tar.gz'
	);
});

it('install_node_tarball_url_windows', () => {
	expect(generateNodeTarballUrl('8.10.0', 'win32', 'x64')).toBe(
		'https://nodejs.org/dist/v8.10.0/node-v8.10.0-win-x64.zip'
	);
});

it('install_node', async () => {
	const version = 'v10.0.0';
	const dest = join(
		tmpdir(),
		`install-node-${Math.random()
			.toString(16)
			.substring(2)}`
	);
	await mkdir(dest, { recursive: true });
	try {
		await installNode(dest, version);
		const res = await exec(join(dest, 'bin/node'), [
			'-p',
			'process.version'
		]);
		expect(res.stdout.trim()).toBe(version);
	} finally {
		// Clean up
		try {
			await remove(dest, { recursive: true });
		} catch (err) {
			// On Windows EPERM can happen due to anti-virus software like Windows Defender.
			// There's nothing that we can do about it so don't fail the test case when it happens.
			if (err.code !== 'EPERM') {
				throw err;
			}
		}
	}
});