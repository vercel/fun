import { unpackTar } from 'modern-tar/fs';
import fetch from 'node-fetch';
import createDebug from 'debug';
import { createGunzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';

const debug = createDebug('@vercel/fun:install-python');

export function generatePythonTarballUrl(
	version: string,
	platform: NodeJS.Platform = process.platform,
	arch: string = process.arch
): string {
	return `https://python-binaries.zeit.sh/python-${version}-${platform}-${arch}.tar.gz`;
}

export async function installPython(
	dest: string,
	version: string,
	platform: NodeJS.Platform = process.platform,
	arch: string = process.arch
): Promise<void> {
	// For Apple M1 use the x64 binaries
	if (platform === 'darwin' && arch === 'arm64') {
		arch = 'x64';
	}

	const tarballUrl = generatePythonTarballUrl(version, platform, arch);
	debug('Downloading Python %s tarball %o', version, tarballUrl);
	const res = await fetch(tarballUrl);
	if (!res.ok) {
		throw new Error(`HTTP request ${tarballUrl} failed: ${res.status}`);
	}
	debug('Extracting Python %s tarball to %o', version, dest);
	await pipeline(res.body, createGunzip(), unpackTar(dest, { strip: 1 }));
}
