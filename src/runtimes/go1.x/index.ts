import { join } from 'path';
import execa from 'execa';
import createDebug from 'debug';
import { Runtime } from '../../types';
import { readFile, writeFile, mkdirp, remove } from 'fs-extra';
import { getOutputFile } from './filename';

const debug = createDebug('@zeit/fun:runtimes/go1.x');

function _go(opts) {
	return function go(...args) {
		debug('Exec %o', `go ${args.join(' ')}`);
		return execa('go', args, { stdio: 'inherit', ...opts });
	};
}

export async function init({ cacheDir }: Runtime): Promise<void> {
	const source = join(cacheDir, 'bootstrap.go');
	const out = getOutputFile();
	let data = await readFile(source, 'utf8');

	// Fix windows
	if (process.platform === 'win32') {
		debug('detected windows, so stripping Setpgid');
		data = data
			.split('\n')
			.filter(line => !line.includes('Setpgid'))
			.join('\n');
	}

	// Prepare a temporary `$GOPATH`
	const GOPATH = join(cacheDir, 'go');

	// The source code must reside in `$GOPATH/src` for `go get` to work
	const bootstrapDir = join(GOPATH, 'src', out);
	await mkdirp(bootstrapDir);
	await writeFile(join(bootstrapDir, 'bootstrap.go'), data);

	const go = _go({ cwd: bootstrapDir, env: { ...process.env, GOPATH } });
	const bootstrap = join(cacheDir, out);
	debug('Compiling Go runtime binary %o -> %o', source, bootstrap);
	await go('get');
	await go('build', '-o', bootstrap, 'bootstrap.go');

	// Clean up `$GOPATH` from the cacheDir
	await remove(GOPATH);
}
