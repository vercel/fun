import { extract } from 'tar';
import pipe from 'promisepipe';
import fetch from 'node-fetch';
import createDebug from 'debug';
import { createGunzip } from 'zlib';
import { basename, join } from 'path';
import { createWriteStream, mkdirp } from 'fs-extra';
import { unzip, zipFromFile } from './unzip';

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

	let mirror = process.env.ZEIT_FUN_MIRRORS_NODE;

	if (!mirror) {
		mirror = 'https://nodejs.org/dist';
	}

	return `${mirror}/${version}/node-${version}-${plat}-${arch}.${ext}`;
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
	if (platform === 'win32') {
		// Put it in the `bin` dir for consistency with the tarballs
		const finalDest = join(dest, 'bin');
		const zipName = basename(tarballUrl);
		const zipPath = join(dest, zipName);

		debug('Saving Node.js %s zip file to %o', version, zipPath);
		await pipe(
			res.body,
			createWriteStream(zipPath)
		);

		debug('Extracting Node.js %s zip file to %o', version, finalDest);
		const zipFile = await zipFromFile(zipPath);
		await unzip(zipFile, finalDest, { strip: 1 });
	} else {
		debug('Extracting Node.js %s tarball to %o', version, dest);
		await pipe(
			res.body,
			createGunzip(),
			extract({ strip: 1, C: dest })
		);
	}
}
