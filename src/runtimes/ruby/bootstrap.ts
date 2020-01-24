import { join } from 'path';
import { spawn } from 'child_process';

if (!process.env.NOWRUBYPATH) {
	process.env.NOWRUBYPATH = process.env.LAMBDA_RUNTIME_DIR;
}

const bootstrap = join(__dirname, '..', 'ruby', 'bootstrap.rb');
spawn('ruby', [bootstrap], { stdio: 'inherit' });
