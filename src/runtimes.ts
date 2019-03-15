import { join } from 'path';
import createDebug from 'debug';
import * as cachedir from 'cache-or-tmp-directory';
import {
	lstat,
	mkdirp,
	readdir,
	remove,
	rename,
	readFile,
	writeFile
} from 'fs-extra';

import { Runtime } from './types';
import * as go1x from './runtimes/go1.x';
import * as nodejs6 from './runtimes/nodejs6.10';
import * as nodejs8 from './runtimes/nodejs8.10';

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
		version: 0,
		runtimeDir: join(runtimesDir, name),
		...mod
	};
	runtimes[name] = runtime;
}

createRuntime(runtimes, 'provided');
createRuntime(runtimes, 'go1.x', go1x);
createRuntime(runtimes, 'nodejs');
createRuntime(runtimes, 'python');
createRuntime(runtimes, 'nodejs6.10', nodejs6);
createRuntime(runtimes, 'nodejs8.10', nodejs8);

async function getRuntimeVersion(f: string): Promise<number> {
	try {
		const contents = await readFile(f, 'ascii');
		return parseInt(contents, 10);
	} catch (err) {
		if (err.code === 'ENOENT') {
			return null;
		}
		throw err;
	}
}

// Until https://github.com/zeit/pkg/issues/639 is resolved, we have to
// implement the `copy()` operation without relying on `fs.copyFile()`.
async function copy(src: string, dest: string): Promise<void> {
	debug('copy(%o, %o)', src, dest);
	const [entries] = await Promise.all([readdir(src), mkdirp(dest)]);
	debug('Entries: %o', entries);

	for (const entry of entries) {
		const srcPath = join(src, entry);
		const destPath = join(dest, entry);
		const s = await lstat(srcPath);
		if (s.isDirectory()) {
			await copy(srcPath, destPath);
		} else {
			const contents = await readFile(srcPath);
			await writeFile(destPath, contents, { mode: s.mode });
		}
	}
}

// The Promises map is to ensure that a runtime is only initialized once
const initPromises: Map<Runtime, Promise<void>> = new Map();

async function _initializeRuntime(runtime: Runtime): Promise<void> {
	const cacheDir = join(cachedir('co.zeit.fun'), 'runtimes', runtime.name);
	const versionFile = join(cacheDir, '.version');
	const installedVersion = await getRuntimeVersion(versionFile);
	if (installedVersion === runtime.version) {
		debug(
			'Runtime %o is already initialized at %o',
			runtime.name,
			cacheDir
		);
		runtime.cacheDir = cacheDir;
	} else {
		debug('Initializing %o runtime at %o', runtime.name, cacheDir);
		const cacheDirTemp = `${cacheDir}.temp${Math.random()
			.toString(16)
			.substring(2)}`;
		try {
			// During initialization, the cache dir is a temporary name.
			runtime.cacheDir = cacheDirTemp;
			await mkdirp(cacheDirTemp);

			// The runtime directory is copied from the module dir to the cache
			// dir. This is so that when compiled through `pkg`, then the
			// bootstrap files exist on a real file system so that `execve()`
			// works as expected.
			await copy(runtime.runtimeDir, cacheDirTemp);

			// Perform any runtime-specific initialization logic
			if (typeof runtime.init === 'function') {
				await runtime.init(runtime);
			}

			await writeFile(
				join(cacheDirTemp, '.version'),
				String(runtime.version)
			);

			if (installedVersion !== null) {
				// An older version is already installed, remove it first
				// otherwise the `rename()` operation will fail with EEXISTS
				debug(
					'Removing old cache dir %o with version %o',
					cacheDir,
					installedVersion
				);
				await remove(cacheDir);
			}

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
