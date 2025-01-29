import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { getOutputFile } from './filename';

const out = getOutputFile();
const bootstrap = join(__dirname, out);
spawn(bootstrap, [], { stdio: 'inherit' });
