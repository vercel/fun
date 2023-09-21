import { Runtime } from '../../types';
import { installPython } from '../../install-python';
import { runtimes, initializeRuntime } from '../../runtimes';

export async function init({ cacheDir }: Runtime): Promise<void> {
	await Promise.all([
		initializeRuntime(runtimes.python),
		installPython(cacheDir, '3.6.8')
	]);
}
