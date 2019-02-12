import { join } from 'path';
import { stat } from 'fs-extra';
import createDebug from 'debug';
import { Runtime } from '../../types';

const debug = createDebug('@zeit/fun:runtimes/nodejs');

export async function init({ cacheDir, runtimeDir }: Runtime): Promise<void> {
	const bootstrapPath = join(runtimeDir, 'bootstrap.js');
	const bootstrapJs = await stat(bootstrapPath);
	debug('Stat of %o: %o', bootstrapPath, bootstrapJs);
	if (!bootstrapJs || !bootstrapJs.isFile()) {
		throw new Error(`${bootstrapPath} does not exist!`);
	}
}
