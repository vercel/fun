import { Runtime } from '../../types';
import { installNode } from '../../install-node';
import { runtimes, initializeRuntime } from '../../runtimes';

export const version = 1;

export async function init({ cacheDir }: Runtime): Promise<void> {
	await Promise.all([
		initializeRuntime(runtimes.nodejs),
		installNode(cacheDir, '6.10.0')
	]);
}
