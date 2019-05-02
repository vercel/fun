import { join } from 'path';
import { spawn } from 'child_process';

const bootstrap = join(__dirname, 'bootstrap');
spawn(bootstrap, [], { stdio: 'inherit' });
