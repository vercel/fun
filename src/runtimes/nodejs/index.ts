import { join } from 'path';
import { stat } from 'fs-extra';
import { Runtime } from '../../types';

export async function init({ cacheDir }: Runtime): Promise<void> {
	const bootstrapPath = join(__dirname, 'bootstrap.js');
	const bootstrapJs = await stat(bootstrapPath);
	if (!bootstrapJs || !bootstrapJs.isFile()) {
		throw new Error(`${bootstrapPath} does not exist!`);
	}
}
