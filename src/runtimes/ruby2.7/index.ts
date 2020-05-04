import { Runtime } from '../../types';
import { installRuby } from '../../install-ruby';
import { runtimes, initializeRuntime } from '../../runtimes';

export async function init({ cacheDir }: Runtime): Promise<void> {
	await Promise.all([
		initializeRuntime(runtimes.ruby),
		installRuby(cacheDir, '2.7.0')
	]);
}
