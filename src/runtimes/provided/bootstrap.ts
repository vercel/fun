import { join } from 'path';
import { spawn } from 'child_process';

// Delegate out to the provided `bootstrap` file within the lambda
const bootstrap = join(process.env.LAMBDA_TASK_ROOT, 'bootstrap');
spawn(bootstrap, [], { stdio: 'inherit' });
