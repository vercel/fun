import { join } from 'path';
import createDebug from 'debug';
import { createHash, Hash } from 'crypto';
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
import * as python27 from './runtimes/python2.7';
import * as python36 from './runtimes/python3.6';
import * as python37 from './runtimes/python3.7';

const debug = createDebug('@zeit/fun:runtimes');
const runtimesDir = join(__dirname, 'runtimes');

interface Runtimes {
	[name: string]: Runtime;
}

interface RuntimeImpl {
	init?(runtime: Runtime): Promise<void>;
}

export const runtimes: Runtimes = {};

export const funCacheDir = cachedir('co.zeit.fun');

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

createRuntime(runtimes, 'provided');
createRuntime(runtimes, 'go1.x', go1x);
createRuntime(runtimes, 'nodejs');
createRuntime(runtimes, 'nodejs6.10', nodejs6);
createRuntime(runtimes, 'nodejs8.10', nodejs8);
createRuntime(runtimes, 'python');
createRuntime(runtimes, 'python2.7', python27);
createRuntime(runtimes, 'python3.6', python36);
createRuntime(runtimes, 'python3.7', python37);

/**
 * Reads the file path `f` as an ascii string.
 * Returns `null` if the file does not exist.
 */
async function getCachedRuntimeSha(f: string): Promise<string> {
	try {
		return await readFile(f, 'ascii');
	} catch (err) {
		if (err.code === 'ENOENT') {
			return null;
		}
		throw err;
	}
}

const runtimeShaPromises: Map<string, Promise<string>> = new Map();

/**
 * Calculates a sha256 of the files provided for a runtime. If any of the
 * `bootstrap` or other dependent files change then the shasum will be
 * different and the user's existing runtime cache will be invalidated.
 */
async function _calculateRuntimeSha(src: string): Promise<string> {
	debug('calculateRuntimeSha(%o)', src);
	const hash = createHash('sha256');
	await calculateRuntimeShaDir(src, hash);
	const sha = hash.digest('hex');
	debug('Calculated runtime sha for %o: %o', src, sha);
	return sha;
}
async function calculateRuntimeShaDir(src: string, hash: Hash): Promise<void> {
	const entries = await readdir(src);
	for (const entry of entries) {
		const srcPath = join(src, entry);
		const s = await lstat(srcPath);
		if (s.isDirectory()) {
			await calculateRuntimeShaDir(srcPath, hash);
		} else {
			const contents = await readFile(srcPath);
			hash.update(contents);
		}
	}
}
function calculateRuntimeSha(src: string): Promise<string> {
	// The sha calculation promise gets memoized because the runtime code
	// won't be changing (it's within a published npm module, after all)
	let p = runtimeShaPromises.get(src);
	if (!p) {
		p = _calculateRuntimeSha(src);
		runtimeShaPromises.set(src, p);
	}
	return p;
}

/**
 * Until https://github.com/zeit/pkg/issues/639 is resolved, we have to
 * implement the `copy()` operation without relying on `fs.copyFile()`.
 */
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
	const cacheDir = join(funCacheDir, 'runtimes', runtime.name);
	const cacheShaFile = join(cacheDir, '.cache-sha');
	const [cachedRuntimeSha, runtimeSha] = await Promise.all([
		getCachedRuntimeSha(cacheShaFile),
		calculateRuntimeSha(runtime.runtimeDir)
	]);
	if (cachedRuntimeSha === runtimeSha) {
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
				join(cacheDirTemp, '.cache-sha'),
				String(runtimeSha)
			);

			// After `init()` is successful, the cache dir is atomically renamed
			// to the final name, after which `init()` will not be invoked in the
			// future.
			try {
				await rename(cacheDirTemp, cacheDir);
			} catch (err) {
				if (err.code === 'ENOTEMPTY') {
					// An older version is already installed, remove it first
					// and then try again
					debug(
						'Removing old cache dir %o with sha %o',
						cacheDir,
						cachedRuntimeSha
					);
					await remove(cacheDir);
					await rename(cacheDirTemp, cacheDir);
				} else {
					throw err;
				}
			}
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

export async function initializeRuntime(
	target: string | Runtime
): Promise<Runtime> {
	let runtime: Runtime;
	if (typeof target === 'string') {
		runtime = runtimes[target];
		if (!runtime) {
			throw new Error(`Could not find runtime with name "${target}"`);
		}
	} else {
		runtime = target;
	}

	let p = initPromises.get(runtime);
	if (p) {
		await p;
	} else {
		p = _initializeRuntime(runtime);
		initPromises.set(runtime, p);

		try {
			await p;
		} finally {
			// Once the initialization is complete, remove the Promise. This is so that
			// in case the cache is deleted during runtime, and then another Lambda
			// function is created, the in-memory cache doesn't think the runtime is
			// already initialized and will check the filesystem cache again.
			initPromises.delete(runtime);
		}
	}

	return runtime;
}
