import { join } from 'path';
import { spawn } from 'child_process';
import { getOutputFile } from './filename';

const out = getOutputFile();
const bootstrap = join(__dirname, out);
spawn(bootstrap, [], { stdio: 'inherit' });
