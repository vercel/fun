import { join } from 'path';
import * as node from '../nodejs';
import { Runtime } from '../../types';
import { installNode } from '../../install-node';

export async function init(runtime: Runtime): Promise<void> {
	await node.init({
		...runtime,
		runtimeDir: join(runtime.runtimeDir, '../nodejs')
	});
	await installNode(runtime.cacheDir, '8.10.0');
}
