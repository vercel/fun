import { join } from 'path';
import createDebug from 'debug';
import * as cachedir from 'cachedir';
import { stat, mkdirp, remove, rename } from 'fs-extra';

import { Runtime } from './types';
import * as go1x from './runtimes/go1.x';
import * as node6 from './runtimes/nodejs6.10';
import * as node8 from './runtimes/nodejs8.10';

const debug = createDebug('@zeit/fun:runtimes');
const runtimesDir = join(__dirname, 'runtimes');

interface Runtimes {
	[name: string]: Runtime;
}

interface RuntimeImpl {
	init?(runtime: Runtime): Promise<void>;
}

export const runtimes: Runtimes = {};

function createRuntime(
	runtimes: Runtimes,
	name: string,
	mod?: RuntimeImpl
): void {
	const runtime: Runtime = {
		name,
		runtimeDir: join(runtimesDir, name),
		...mod
	};
	runtimes[name] = runtime;
}

createRuntime(runtimes, 'nodejs');
createRuntime(runtimes, 'provided');
createRuntime(runtimes, 'go1.x', go1x);
createRuntime(runtimes, 'nodejs6.10', node6);
createRuntime(runtimes, 'nodejs8.10', node8);

async function isDirectory(f: string): Promise<boolean> {
	try {
		const s = await stat(f);
		return s.isDirectory();
	} catch (err) {
		if (err.code === 'ENOENT') {
			return false;
		}
		throw err;
	}
}

// The Promises map is to ensure that a runtime is only initialized once
const initPromises: Map<Runtime, Promise<void>> = new Map();

async function _initializeRuntime(runtime: Runtime): Promise<void> {
	const cacheDir = join(cachedir('fun'), runtime.name);
	if (await isDirectory(cacheDir)) {
		debug('Runtime %o is already initialized', runtime.name);
		runtime.cacheDir = cacheDir;
	} else {
		debug(
			'Initializing %o runtime with cache dir %o',
			runtime.name,
			cacheDir
		);
		const cacheDirTemp = `${cacheDir}.temp${Math.random()
			.toString(16)
			.substring(2)}`;
		runtime.cacheDir = cacheDirTemp;
		try {
			// During initialization, the cache dir is a temporary name.
			await mkdirp(cacheDirTemp);
			await runtime.init.call(runtime, runtime);

			// After `init()` is successful, the cache dir is atomically renamed
			// to the final name, after which `init()` will not be invoked in the
			// future.
			await rename(cacheDirTemp, cacheDir);
			runtime.cacheDir = cacheDir;
		} catch (err) {
			debug(
				'Runtime %o `init()` failed %o. Cleaning up temp cache dir %o',
				runtime.name,
				err,
				cacheDirTemp
			);
			await remove(cacheDirTemp);
			throw err;
		}
	}
}

export function initializeRuntime(runtime: Runtime): Promise<void> {
	let p = initPromises.get(runtime);
	if (!p) {
		p = _initializeRuntime(runtime);
		initPromises.set(runtime, p);
	}
	return p;
}
