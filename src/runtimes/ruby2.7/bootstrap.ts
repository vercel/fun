import { join } from 'path';
import { spawn } from 'child_process';

const rubyBin = join(__dirname, 'bin', 'ruby');

const bootstrap = join(__dirname, '..', 'ruby', 'bootstrap.rb');
spawn(rubyBin, [bootstrap], { stdio: 'inherit' });
