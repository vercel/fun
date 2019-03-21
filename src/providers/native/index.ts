import * as uuid from 'uuid/v4';
import createDebug from 'debug';
import { AddressInfo } from 'net';
import { basename, join, resolve } from 'path';
import * as listen from 'async-listen';
import { Pool, createPool } from 'generic-pool';
import { ChildProcess, spawn } from 'child_process';
import { RuntimeServer } from '../../runtime-server';
import {
	LambdaParams,
	InvokeParams,
	InvokeResult,
	Lambda,
	Provider
} from '../../types';

const debug = createDebug('@zeit/fun:providers/native');

export default class NativeProvider implements Provider {
	pool: Pool;
	lambda: Lambda;
	params: LambdaParams;
	runtimeApis: WeakMap<ChildProcess, RuntimeServer>;

	constructor(fn: Lambda, params: LambdaParams) {
		const factory = {
			create: this.createProcess.bind(this),
			destroy: this.destroyProcess.bind(this)
		};
		const opts = {
			min: 0,
			max: 10
		};
		this.lambda = fn;
		this.params = params;
		this.pool = createPool(factory, opts);
		this.pool.on('factoryCreateError', function(err) {
			console.error('factoryCreateError', { err });
		});
		this.pool.on('factoryDestroyError', function(err) {
			console.error('factoryDestroyError', { err });
		});
		this.runtimeApis = new WeakMap();
	}

	async createProcess(): Promise<ChildProcess> {
		const { runtime, params, region, version, extractedDir } = this.lambda;
		const bootstrap = join(runtime.cacheDir, 'bootstrap');

		const server = new RuntimeServer(this.lambda);
		await listen(server, 0, '127.0.0.1');
		const { port } = server.address() as AddressInfo;

		debug('Creating process %o', bootstrap);
		const taskDir = resolve(extractedDir || params.Code.Directory);
		const functionName = params.FunctionName || basename(taskDir);
		const memorySize =
			typeof params.MemorySize === 'number' ? params.MemorySize : 128;
		const logGroupName = `aws/lambda/${functionName}`;
		const logStreamName = `2019/01/12/[${version}]${uuid().replace(
			/\-/g,
			''
		)}`;

		// https://docs.aws.amazon.com/lambda/latest/dg/current-supported-versions.html
		const env = {
			// Non-reserved env vars (can overwrite with params)
			PATH: '/var/lang/bin:/usr/local/bin:/usr/bin/:/bin:/opt/bin',
			LANG: 'en_US.UTF-8',

			// User env vars
			...(params.Environment && params.Environment.Variables),

			// Restricted env vars
			_HANDLER: params.Handler,
			AWS_REGION: region,
			AWS_DEFAULT_REGION: region,
			AWS_EXECUTION_ENV: `AWS_Lambda_${params.Runtime}`,
			AWS_LAMBDA_FUNCTION_NAME: functionName,
			AWS_LAMBDA_FUNCTION_VERSION: version,
			AWS_LAMBDA_FUNCTION_MEMORY_SIZE: String(params.MemorySize || 128),
			AWS_LAMBDA_RUNTIME_API: `127.0.0.1:${port}`,
			AWS_LAMBDA_LOG_GROUP_NAME: logGroupName,
			AWS_LAMBDA_LOG_STREAM_NAME: logStreamName,
			LAMBDA_RUNTIME_DIR: runtime.cacheDir,
			LAMBDA_TASK_ROOT: taskDir,
			TZ: ':UTC'
		};

		const proc = spawn(bootstrap, [], {
			env,
			cwd: taskDir,
			stdio: ['ignore', 'inherit', 'inherit']
		});

		proc.on('exit', async (code, signal) => {
			debug(
				'Process (pid=%o) exited with code %o, signal %o',
				proc.pid,
				code,
				signal
			);
			await this.shutdownRuntimeApiServer(proc);
		});

		debug('Waiting for init on process %o', proc.pid);
		await server.initPromise;
		debug('Lambda is initialized for process %o', proc.pid);

		this.runtimeApis.set(proc, server);
		await this.freezeProcess(proc);

		return proc;
	}

	async shutdownRuntimeApiServer(proc: ChildProcess): Promise<void> {
		debug('Shutting down Runtime API for %o', proc.pid);
		const server = this.runtimeApis.get(proc);
		server.close();
		this.runtimeApis.delete(proc);
	}

	async destroyProcess(proc: ChildProcess): Promise<void> {
		// Unfreeze the process first so it is able to process the `SIGTERM`
		// signal and exit cleanly (clean up child processes, etc.)
		this.unfreezeProcess(proc);

		debug('Stopping process %o', proc.pid);
		process.kill(proc.pid, 'SIGTERM');
	}

	freezeProcess(proc: ChildProcess) {
		debug('Freezing process %o', proc.pid);
		process.kill(proc.pid, 'SIGSTOP');
	}

	unfreezeProcess(proc: ChildProcess) {
		debug('Unfreezing process %o', proc.pid);
		process.kill(proc.pid, 'SIGCONT');
	}

	async invoke(params: InvokeParams): Promise<InvokeResult> {
		let errorOccurred = false;
		const proc = await this.pool.acquire();
		const server = this.runtimeApis.get(proc);
		this.unfreezeProcess(proc);
		try {
			return await server.invoke(params);
		} catch (err) {
			errorOccurred = true;
			await this.pool.destroy(proc);
			throw err;
		} finally {
			if (!errorOccurred) {
				this.freezeProcess(proc);
				await this.pool.release(proc);
			}
		}
	}

	async destroy(): Promise<void> {
		debug('Draining pool');
		await this.pool.drain();
		this.pool.clear();
	}
}
