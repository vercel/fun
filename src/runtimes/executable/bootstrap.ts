import { join } from 'node:path';
import { spawn } from 'node:child_process';

// Delegate out to the provided `executable` file within the lambda
const executable = join(process.env.LAMBDA_TASK_ROOT, 'executable');
spawn(executable, [], { stdio: 'inherit' });
