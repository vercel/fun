import { tmpdir } from 'node:os';
import createDebug from 'debug';
import { dirname, join } from 'node:path';
import { constants, createWriteStream } from 'node:fs';
import { mkdir, symlink, unlink } from 'node:fs/promises';
import { text } from 'node:stream/consumers';
import { pipeline } from 'node:stream/promises';
import {
	Entry,
	ZipFile,
	open as zipFromFile,
	fromBuffer as zipFromBuffer,
} from 'yauzl-promise';

export { zipFromFile, zipFromBuffer, ZipFile };

const debug = createDebug('@vercel/fun:unzip');

export async function unzipToTemp(
	data: Buffer | string,
	tmpDir: string = tmpdir(),
): Promise<string> {
	const dir = join(
		tmpDir,
		`zeit-fun-${Math.random().toString(16).substring(2)}`,
	);
	let zip: ZipFile;
	if (Buffer.isBuffer(data)) {
		debug('Unzipping buffer (length=%o) to temp dir %o', data.length, dir);
		zip = await zipFromBuffer(data);
	} else {
		debug('Unzipping %o to temp dir %o', data, dir);
		zip = await zipFromFile(data);
	}
	await unzip(zip, dir);
	await zip.close();
	debug('Finished unzipping to %o', dir);
	return dir;
}

interface UnzipOptions {
	strip?: number;
}

export async function unzip(
	zipFile: ZipFile,
	dir: string,
	opts: UnzipOptions = {},
): Promise<void> {
	let entry: Entry;
	const strip = opts.strip || 0;
	while ((entry = await zipFile.readEntry()) !== null) {
		const fileName =
			strip === 0
				? entry.fileName
				: entry.fileName.split('/').slice(strip).join('/');
		const destPath = join(dir, fileName);
		if (/\/$/.test(entry.fileName)) {
			debug('Creating directory %o', destPath);
			await mkdir(destPath, { recursive: true });
		} else {
			const [entryStream] = await Promise.all([
				entry.openReadStream(),
				// ensure parent directory exists
				mkdir(dirname(destPath), { recursive: true }),
			]);
			const mode = entry.externalFileAttributes >>> 16;
			if ((mode & constants.S_IFMT) === constants.S_IFLNK) {
				const linkDest = await text(entryStream);
				debug('Creating symboling link %o to %o', destPath, linkDest);
				await symlink(linkDest, destPath);
			} else {
				const modeVal = mode & 0o7777;
				if (modeVal === 0) {
					debug('Unzipping file to %o', destPath);
				} else {
					debug(
						'Unzipping file to %o with mode %s',
						destPath,
						modeVal.toString(8).padStart(4, '0'),
					);
				}
				try {
					await unlink(destPath);
				} catch (err) {
					if (err.code !== 'ENOENT') {
						throw err;
					}
				}
				const destStream = createWriteStream(destPath, {
					mode: modeVal,
				});
				await pipeline(entryStream, destStream);
			}
		}
	}
}
