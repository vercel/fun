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
	const isPython3 = data && data.startsWith('Python 3');

	if (!isPython3) {
		fallback();
	}

	const bootstrap = join(__dirname, '..', 'python', 'bootstrap.py');
	spawn(pythonBin, [bootstrap], { stdio: 'inherit' });
}
const child = spawn(pythonBin, ['--version']);
child.on('error', fallback);

Promise.all([child.stdout, child.stderr].map(stream2Promise)).then(
	([stdout, stderr]) => {
		// if there are stderr messages, then we know the python version is not 3
		if (stderr.length) {
			handler();
		} else {
			handler(stdout.toString());
		}
	}
);

function stream2Promise(stream: NodeJS.ReadableStream): Promise<Buffer> {
	const buffers = [];
	return new Promise(resolve => {
		stream.on('data', data => buffers.push(data));
		stream.on('end', () => resolve(Buffer.concat(buffers)));
	});
}
