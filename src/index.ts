import {
	Lambda,
	LambdaParams,
	InvokeParams,
	InvokeResult,
	Runtime
} from './types';
import createDebug from 'debug';
import { remove } from 'fs-extra';
import { basename } from 'path';
import * as listen from 'async-listen';
import { unzipToTemp } from './unzip';
import { LambdaError } from './errors';
import * as providers from './providers';
import { RuntimeServer } from './runtime-server';
import { funCacheDir, runtimes, initializeRuntime } from './runtimes';

const debug = createDebug('@zeit/fun:index');

export {
	Lambda,
	LambdaParams,
	InvokeParams,
	InvokeResult,
	runtimes,
	providers,
	funCacheDir,
	initializeRuntime
};

// Environment variable names that AWS Lambda does not allow to be overridden.
// https://docs.aws.amazon.com/lambda/latest/dg/current-supported-versions.html#lambda-environment-variables
const reservedEnvVars = new Set([
	'_HANDLER',
	'LAMBDA_TASK_ROOT',
	'LAMBDA_RUNTIME_DIR',
	'AWS_EXECUTION_ENV',
	'AWS_DEFAULT_REGION',
	'AWS_REGION',
	'AWS_LAMBDA_LOG_GROUP_NAME',
	'AWS_LAMBDA_LOG_STREAM_NAME',
	'AWS_LAMBDA_FUNCTION_NAME',
	'AWS_LAMBDA_FUNCTION_MEMORY_SIZE',
	'AWS_LAMBDA_FUNCTION_VERSION',
	'AWS_ACCESS_KEY',
	'AWS_ACCESS_KEY_ID',
	'AWS_SECRET_KEY',
	'AWS_SECRET_ACCESS_KEY',
	'AWS_SESSION_TOKEN',
	'TZ'
]);

export class ValidationError extends Error {
	reserved?: string[];

	constructor(message?: string) {
		super(message);

		// Restore prototype chain (see https://stackoverflow.com/a/41102306/376773)
		this.name = new.target.name;
		const actualProto = new.target.prototype;
		Object.setPrototypeOf(this, actualProto);
	}
}

export async function createFunction(params: LambdaParams): Promise<Lambda> {
	const Provider = providers[params.Provider || 'native'];
	if (!Provider) {
		throw new TypeError(`Provider "${params.Provider}" is not implemented`);
	}

	const runtime: Runtime = runtimes[params.Runtime];
	if (!runtime) {
		throw new TypeError(`Runtime "${params.Runtime}" is not implemented`);
	}
	await initializeRuntime(runtime);

	const envVars = (params.Environment && params.Environment.Variables) || {};
	const reserved = Object.keys(envVars).filter(name => {
		return reservedEnvVars.has(name.toUpperCase());
	});
	if (reserved.length > 0) {
		const err = new ValidationError(
			`The following environment variables can not be configured: ${reserved.join(
				', '
			)}`
		);
		err.reserved = reserved;
		throw err;
	}

	const fn: Lambda = async function<T>(
		payload?: string | object
	): Promise<T> {
		const result = await fn.invoke({
			InvocationType: 'RequestResponse',
			Payload: JSON.stringify(payload)
		});
		let resultPayload = result.Payload;
		if (typeof resultPayload !== 'string') {
			// For Buffer / Blob
			resultPayload = String(resultPayload);
		}
		const parsedPayload = JSON.parse(resultPayload);
		if (result.FunctionError) {
			throw new LambdaError(parsedPayload);
		} else {
			return parsedPayload;
		}
	};

	fn.params = params;
	fn.runtime = runtime;
	fn.destroy = destroy.bind(null, fn);
	fn.invoke = invoke.bind(null, fn);

	fn.functionName = params.FunctionName;
	fn.region = params.Region || 'us-west-1';
	fn.version = '$LATEST';
	fn.arn = '';
	fn.timeout = typeof params.Timeout === 'number' ? params.Timeout : 3;
	fn.memorySize =
		typeof params.MemorySize === 'number' ? params.MemorySize : 128;

	debug('Creating provider %o', Provider.name);
	fn.provider = new Provider(fn);

	if (params.Code.ZipFile) {
		fn.extractedDir = await unzipToTemp(params.Code.ZipFile);
	}

	return fn;
}

export async function invoke(
	fn: Lambda,
	params: InvokeParams
): Promise<InvokeResult> {
	debug('Invoking function %o', fn.functionName);
	const result = await fn.provider.invoke(params);
	return result;
}

export async function destroy(fn: Lambda): Promise<void> {
	const ops = [fn.provider.destroy()];
	if (fn.extractedDir) {
		debug(
			'Deleting directory %o for function %o',
			fn.extractedDir,
			fn.functionName
		);
		ops.push(remove(fn.extractedDir));
	}
	await Promise.all(ops);
}

export async function cleanCacheDir(): Promise<void> {
	debug('Deleting fun cache directory %o', funCacheDir);
	await remove(funCacheDir);
}
