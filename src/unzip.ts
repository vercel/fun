import { tmpdir } from 'os';
import * as Mode from 'stat-mode';
import pipe from 'promisepipe';
import createDebug from 'debug';
import { dirname, basename, join } from 'path';
import { createWriteStream, mkdirp, symlink, unlink } from 'fs-extra';
import * as streamToPromise from 'stream-to-promise';
import {
	Entry,
	ZipFile,
	open as zipFromFile,
	fromBuffer as zipFromBuffer
} from 'yauzl-promise';

export { zipFromFile, zipFromBuffer, ZipFile };

const debug = createDebug('@zeit/fun:unzip');

export async function unzipToTemp(
	data: Buffer | string,
	tmpDir: string = tmpdir()
): Promise<string> {
	const dir = join(
		tmpDir,
		`zeit-fun-${Math.random()
			.toString(16)
			.substring(2)}`
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

const getMode = (entry: Entry) =>
	new Mode({ mode: entry.externalFileAttributes >>> 16 });

interface UnzipOptions {
	strip?: number;
};

export async function unzip(zipFile: ZipFile, dir: string, opts: UnzipOptions = {}): Promise<void> {
	let entry: Entry;
	const strip = opts.strip || 0;
	while ((entry = await zipFile.readEntry()) !== null) {
		const fileName = strip === 0 ? entry.fileName : entry.fileName.split('/').slice(strip).join('/');
		const destPath = join(dir, fileName);
		if (/\/$/.test(entry.fileName)) {
			debug('Creating directory %o', destPath);
			await mkdirp(destPath);
		} else {
			const [entryStream] = await Promise.all([
				entry.openReadStream(),
				// ensure parent directory exists
				mkdirp(dirname(destPath))
			]);
			const mode = getMode(entry);
			if (mode.isSymbolicLink()) {
				const linkDest = String(await streamToPromise(entryStream));
				debug('Creating symboling link %o to %o', destPath, linkDest);
				await symlink(linkDest, destPath);
			} else {
				const modeOctal = mode.toOctal();
				const modeVal = parseInt(modeOctal, 8);
				if (modeVal === 0) {
					debug('Unzipping file to %o', destPath);
				} else {
					debug(
						'Unzipping file to %o with mode %s (%s)',
						destPath,
						modeOctal,
						String(mode)
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
					mode: modeVal
				});
				await pipe(
					entryStream,
					destStream
				);
			}
		}
	}
}
