import { Runtime } from '../../types';
import { installNode } from '../../install-node';
import { runtimes, initializeRuntime } from '../../runtimes';

export async function init({ cacheDir }: Runtime): Promise<void> {
	await Promise.all([
		initializeRuntime(runtimes.nodejs),
		installNode(cacheDir, '12.14.1')
	]);
}
