import { join } from 'path';
import * as execa from 'execa';
import createDebug from 'debug';
import { Runtime } from '../../types';
import { copyFile, mkdirp, remove } from 'fs-extra';

const debug = createDebug('@zeit/lambda-dev:runtimes/go1.x');

function _go(opts) {
	return function go(...args) {
		debug('Exec %o', `go ${args.join(' ')}`);
		return execa('go', args, { stdio: 'inherit', ...opts });
	};
}

export async function init({ runtimeDir, cacheDir }: Runtime): Promise<void> {
	const source = join(runtimeDir, 'bootstrap.go');

	// Prepare a temporary `$GOPATH`
	const GOPATH = join(cacheDir, 'go');

	// The source code must reside in `$GOPATH/src` for `go get` to work
	const bootstrapDir = join(GOPATH, 'src', 'bootstrap');
	await mkdirp(bootstrapDir);
	await copyFile(source, join(bootstrapDir, 'bootstrap.go'));

	const go = _go({ cwd: bootstrapDir, env: { ...process.env, GOPATH } });
	const bootstrap = join(cacheDir, 'bootstrap');
	debug('Compiling Go runtime binary %o -> %o', source, bootstrap);
	await go('get');
	await go('build', '-o', bootstrap, 'bootstrap.go');

	// Clean up `$GOPATH` from the cacheDir
	await remove(GOPATH);
}
