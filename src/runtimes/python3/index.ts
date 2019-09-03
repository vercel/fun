import { Runtime } from '../../types';
import { runtimes, initializeRuntime } from '../../runtimes';

export async function init(_runtime: Runtime): Promise<void> {
	await Promise.all([initializeRuntime(runtimes.python)]);
}
