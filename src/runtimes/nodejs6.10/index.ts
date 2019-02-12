import * as node from '../nodejs';
import { Runtime } from '../../types';
import { installNode } from '../../install-node';

export async function init(runtime: Runtime): Promise<void> {
	await node.init(runtime);
	await installNode(runtime.cacheDir, '6.10.0');
}
