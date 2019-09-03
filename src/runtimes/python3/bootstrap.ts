import { join } from 'path';
import { spawn } from 'child_process';

// `PYTHONPATH` is *not* a restricted env var, so only set the
// default one if the user did not provide one of their own
if (!process.env.PYTHONPATH) {
	process.env.PYTHONPATH = process.env.LAMBDA_RUNTIME_DIR;
}

let pythonBin = 'python3';
function fallback() {
	pythonBin = 'python';
}
function handler(data?: string) {
	const isPython3 =
		data && data.toString() && data.toString().startsWith('Python 3');

	if (!isPython3) {
		fallback();
	}

	const bootstrap = join(__dirname, '..', 'python', 'bootstrap.py');
	spawn(pythonBin, [bootstrap], { stdio: 'inherit' });
}
const child = spawn(pythonBin, ['--version']);
child.on('error', fallback);
child.stderr.on('data', handler);
child.stdout.on('data', handler);
