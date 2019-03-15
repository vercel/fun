import { extract } from 'tar';
import fetch from 'node-fetch';
import createDebug from 'debug';
import { createGunzip } from 'zlib';

const debug = createDebug('@zeit/fun:install-node');

export function generateTarballUrl(
	version: string,
	platform: string = process.platform,
	arch: string = process.arch
): string {
	if (!version.startsWith('v')) {
		version = `v${version}`;
	}
	return `https://nodejs.org/dist/${version}/node-${version}-${platform}-${arch}.tar.gz`;
}

export async function installNode(
	dest: string,
	version: string,
	platform: string = process.platform,
	arch: string = process.arch
): Promise<void> {
	const tarballUrl = generateTarballUrl(version, platform, arch);
	debug('Downloading Node.js %s tarball %o', version, tarballUrl);
	const res = await fetch(tarballUrl);
	if (!res.ok) {
		throw new Error(`HTTP request failed: ${res.status}`);
	}
	return new Promise((resolve, reject) => {
		debug('Extracting Node.js %s tarball to %o', version, dest);
		res.body
			.pipe(createGunzip())
			.pipe(extract({ strip: 1, C: dest }))
			.on('error', reject)
			.on('end', resolve);
	});
}
