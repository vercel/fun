import { join } from 'node:path';
import { spawn } from 'node:child_process';

const nodeBin = join(__dirname, 'bin', 'node');
const bootstrap = join(__dirname, '..', 'nodejs', 'bootstrap.js');
spawn(nodeBin, [bootstrap], { stdio: 'inherit' });
