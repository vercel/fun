import { join } from 'path';
import { spawn } from 'child_process';

if (!process.env.RUBYPATH) {
	process.env.RUBYPATH = process.env.LAMBDA_RUNTIME_DIR;
}
if (!process.env.RUBYLIB) {
	process.env.RUBYLIB = process.env.LAMBDA_RUNTIME_DIR;
}

const bootstrap = join(__dirname, '..', 'ruby', 'bootstrap.rb');
spawn('ruby', [bootstrap], { stdio: 'inherit' });
