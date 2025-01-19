import { join } from 'node:path';
import { spawn } from 'node:child_process';

// `PYTHONPATH` is *not* a restricted env var, so only set the
// default one if the user did not provide one of their own
if (!process.env.PYTHONPATH) {
	process.env.PYTHONPATH = process.env.LAMBDA_RUNTIME_DIR;
}

const bootstrap = join(__dirname, 'bootstrap.py');
spawn('python', [bootstrap], { stdio: 'inherit' });
