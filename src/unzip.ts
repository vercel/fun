import { join } from 'path';
import { tmpdir } from 'os';
import createDebug from 'debug';
import { promisify } from 'util';
import * as AdmZip from 'adm-zip';

const debug = createDebug('@zeit/fun:index');

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
	debug('Unzipping %o to temp dir %o', data, dir);
	const zip = new AdmZip(data);
	await promisify(zip.extractAllToAsync)(dir, false);
	debug('Done unzipping');
	return dir;
}
