import { createWriteStream } from 'fs';
import { join } from 'path';
import { extract } from 'tar';
import fetch from 'node-fetch';
import createDebug from 'debug';
import { createGunzip } from 'zlib';
import { unzipToTemp } from './unzip';
import cpy from 'cpy';

const debug = createDebug('@zeit/fun:install-node');

export function generateNodeTarballUrl(
	version: string,
	platform: string = process.platform,
	arch: string = process.arch
): string {
	if (!version.startsWith('v')) {
		version = `v${version}`;
	}
	const win = platform === 'win32' || platform === 'win64';
	const _platform = win ? 'win' : platform;
	const ext = win ? 'zip' : 'tar.gz';
	return `https://nodejs.org/dist/${version}/node-${version}-${_platform}-${arch}.${ext}`;
}

export async function installNode(
	dest: string,
	version: string,
	platform: string = process.platform,
	arch: string = process.arch
): Promise<void> {
	const url = generateNodeTarballUrl(version, platform, arch);
	debug('Downloading Node.js %s %o', version, url);

	if (platform === 'win32' || platform === 'win64') {
		return winExtractRemoteZip(url, dest, version);
	}

	return extractRemoteTarball(url, dest, version);
}

async function extractRemoteTarball(
	url: string,
	dest: string,
	version: string
): Promise<void> {
	const res = await fetch(url);
	if (!res.ok) {
		throw new Error(`HTTP request failed: ${res.status}`);
	}
	return new Promise((resolve, reject) => {
		debug('Extracting Node.js %s binary to %o', version, dest);
		res.body
			.pipe(createGunzip())
			.pipe(extract({ strip: 1, C: dest }))
			.on('error', reject)
			.on('end', resolve);
	});
}

async function winExtractRemoteZip(
	url: string,
	dest: string,
	version: string
): Promise<void> {
	const zipFilePath = join(dest, 'node-bin.zip');

	debug('Extracting Nodejs %s binary to %o', version, dest);
	await fetch(url).then(res => {
		const writer = res.body.pipe(createWriteStream(zipFilePath));
		return new Promise((resolve, reject) => {
			writer.on('finish', resolve);
			writer.on('error', reject);
		});
	});

	const tempDir = await unzipToTemp(zipFilePath);
	const subDir = url.match(/([^/]+)\.zip$/)[1];
	return cpy([join(tempDir, subDir, '*.*')], dest);
}
