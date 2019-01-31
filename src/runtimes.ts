import { join } from 'path';
import createDebug from 'debug';
import { Runtime } from './types';
import * as cachedir from 'cachedir';
import { readdirSync, statSync, stat, mkdirp, remove, rename } from 'fs-extra';

const debug = createDebug('@zeit/lambda-dev:runtimes');

const runtimesDir = join(__dirname, 'runtimes');
export const runtimes = readdirSync(runtimesDir)
	.filter(p => {
		return statSync(join(runtimesDir, p)).isDirectory();
	})
	.reduce((o, v) => {
		const dir = join(runtimesDir, v);
		let runtime = {};
		try {
			runtime = require(dir);
		} catch (err) {
			if (err.code !== 'MODULE_NOT_FOUND') {
				throw err;
			}
		}

		const r: Runtime = {
			...runtime,
			name: v,
			runtimeDir: join(runtimesDir, v)
		};

		o[v] = r;
		return o;
	}, {});

async function isDirectory(f) {
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
	const cacheDir = join(cachedir('lambda-dev'), runtime.name);
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
