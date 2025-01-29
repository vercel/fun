import { join } from 'node:path';
import { spawn } from 'node:child_process';

const pythonBin = join(__dirname, 'bin', 'python');
const bootstrap = join(__dirname, '..', 'python', 'bootstrap.py');
spawn(pythonBin, [bootstrap], { stdio: 'inherit' });
