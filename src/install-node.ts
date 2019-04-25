import { extract } from 'tar';
import fetch from 'node-fetch';
import createDebug from 'debug';
import { createGunzip } from 'zlib';
import { unzip, zipFromBuffer } from './unzip';

const debug = createDebug('@zeit/fun:install-node');

export function generateNodeTarballUrl(
	version: string,
	platform: string = process.platform,
	arch: string = process.arch
): string {
	if (!version.startsWith('v')) {
		version = `v${version}`;
	}
	let ext: string;
	let plat: string = platform;
	if (platform === 'win32') {
		ext = 'zip';
		plat = 'win';
	} else {
		ext = 'tar.gz';
	}
	return `https://nodejs.org/dist/${version}/node-${version}-${plat}-${arch}.${ext}`;
}

export async function installNode(
	dest: string,
	version: string,
	platform: string = process.platform,
	arch: string = process.arch
): Promise<void> {
	const tarballUrl = generateNodeTarballUrl(version, platform, arch);
	debug('Downloading Node.js %s tarball %o', version, tarballUrl);
	const res = await fetch(tarballUrl);
	if (!res.ok) {
		throw new Error(`HTTP request failed: ${res.status}`);
	}
	console.log({ status: res.status });
	if (platform === 'win32') {
		debug('Extracting Node.js %s zip file to %o', version, dest);
		//await unzip(zipFile, dest);
	} else {
		return new Promise((resolve, reject) => {
			debug('Extracting Node.js %s tarball to %o', version, dest);
			res.body
				.pipe(createGunzip())
				.pipe(extract({ strip: 1, C: dest }))
				.on('error', reject)
				.on('end', resolve);
		});
	}
}
