import { Runtime } from '../../types';
import { installNode } from '../../install-node';

export async function init({ cacheDir }: Runtime): Promise<void> {
	await installNode(cacheDir, '6.10.0');
}
