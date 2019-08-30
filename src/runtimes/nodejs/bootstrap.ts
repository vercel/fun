/**
 * Credit: https://github.com/lambci/node-custom-lambda/blob/master/v10.x/bootstrap.js
 */
import http from 'http';

interface LambdaEvent {}

interface LambdaContext {
	callbackWaitsForEmptyEventLoop: boolean;
	logGroupName: string;
	logStreamName: string;
	functionName: string;
	memoryLimitInMB: string;
	functionVersion: string;
	invokeid: string;
	awsRequestId: string;
	invokedFunctionArn?: string;
	getRemainingTimeInMillis(): number;
	clientContext?: object;
	identity?: string | object;
}

interface HttpResult {
	statusCode: number;
	headers: object;
	body: string;
}

type HandlerFunction = (
	event: LambdaEvent,
	context?: LambdaContext
) => Promise<object | void>;

const RUNTIME_PATH = '/2018-06-01/runtime';

const {
	AWS_LAMBDA_FUNCTION_NAME,
	AWS_LAMBDA_FUNCTION_VERSION,
	AWS_LAMBDA_FUNCTION_MEMORY_SIZE,
	AWS_LAMBDA_LOG_GROUP_NAME,
	AWS_LAMBDA_LOG_STREAM_NAME,
	LAMBDA_TASK_ROOT,
	_HANDLER,
	AWS_LAMBDA_RUNTIME_API
} = process.env;

delete process.env.SHLVL;

const [HOST, PORT] = AWS_LAMBDA_RUNTIME_API.split(':');

start();

// Simple `util.promisify()` polyfill for Node 6.x
function promisify(fn) {
	return function(...args) {
		return new Promise((resolve, reject) => {
			args.push((err, result) => {
				if (err) return reject(err);
				resolve(result);
			});
			fn.apply(this, args);
		});
	};
}

async function start(): Promise<void> {
	let handler;
	try {
		handler = getHandler();
	} catch (e) {
		await initError(e);
		return process.exit(1);
	}
	try {
		await processEvents(handler);
	} catch (e) {
		console.error(e);
		return process.exit(1);
	}
}

async function processEvents(handler): Promise<void> {
	while (true) {
		const { event, context } = await nextInvocation();
		let result;
		try {
			result = await handler(event, context);
		} catch (e) {
			await invokeError(e, context);
			continue;
		}
		await invokeResponse(result, context);
	}
}

async function initError(err) {
	return postError(`${RUNTIME_PATH}/init/error`, err);
}

async function nextInvocation() {
	const res = await request({ path: `${RUNTIME_PATH}/invocation/next` });

	if (res.statusCode !== 200) {
		throw new Error(
			`Unexpected /invocation/next response: ${JSON.stringify(res)}`
		);
	}

	if (res.headers['lambda-runtime-trace-id']) {
		process.env._X_AMZN_TRACE_ID = res.headers['lambda-runtime-trace-id'];
	} else {
		delete process.env._X_AMZN_TRACE_ID;
	}

	const deadlineMs = Number(res.headers['lambda-runtime-deadline-ms']);
	const awsRequestId = res.headers['lambda-runtime-aws-request-id'];

	const context: LambdaContext = {
		callbackWaitsForEmptyEventLoop: false,
		logGroupName: AWS_LAMBDA_LOG_GROUP_NAME,
		logStreamName: AWS_LAMBDA_LOG_STREAM_NAME,
		functionName: AWS_LAMBDA_FUNCTION_NAME,
		memoryLimitInMB: AWS_LAMBDA_FUNCTION_MEMORY_SIZE,
		functionVersion: AWS_LAMBDA_FUNCTION_VERSION,
		invokeid: awsRequestId,
		awsRequestId,
		invokedFunctionArn: res.headers['lambda-runtime-invoked-function-arn'],
		getRemainingTimeInMillis: () => deadlineMs - Date.now()
	};

	if (res.headers['lambda-runtime-client-context']) {
		context.clientContext = JSON.parse(
			res.headers['lambda-runtime-client-context']
		);
	}

	if (res.headers['lambda-runtime-cognito-identity']) {
		context.identity = JSON.parse(
			res.headers['lambda-runtime-cognito-identity']
		);
	}

	const event = JSON.parse(res.body);

	return { event, context };
}

async function invokeResponse(result, context) {
	const res = await request({
		method: 'POST',
		path: `${RUNTIME_PATH}/invocation/${context.awsRequestId}/response`,
		body: JSON.stringify(result)
	});
	if (res.statusCode !== 202) {
		throw new Error(
			`Unexpected /invocation/response response: ${JSON.stringify(res)}`
		);
	}
}

async function invokeError(err, context) {
	return postError(
		`${RUNTIME_PATH}/invocation/${context.awsRequestId}/error`,
		err
	);
}

async function postError(path, err) {
	const lambdaErr = toLambdaErr(err);
	const res = await request({
		method: 'POST',
		path,
		headers: {
			'Content-Type': 'application/json',
			'Lambda-Runtime-Function-Error-Type': lambdaErr.errorType
		},
		body: JSON.stringify(lambdaErr)
	});
	if (res.statusCode !== 202) {
		throw new Error(`Unexpected ${path} response: ${JSON.stringify(res)}`);
	}
}

function getHandler(): HandlerFunction {
	const appParts = _HANDLER.split('.');

	if (appParts.length !== 2) {
		throw new Error(`Bad handler ${_HANDLER}`);
	}

	const [modulePath, handlerName] = appParts;

	let app;
	try {
		app = require(`${LAMBDA_TASK_ROOT}/${modulePath}`);
	} catch (e) {
		if (e.code === 'MODULE_NOT_FOUND') {
			throw new Error(`Unable to import module '${modulePath}'`);
		}
		throw e;
	}

	const userHandler = app[handlerName];

	if (userHandler == null) {
		throw new Error(
			`Handler '${handlerName}' missing on module '${modulePath}'`
		);
	} else if (typeof userHandler !== 'function') {
		throw new Error(
			`Handler '${handlerName}' from '${modulePath}' is not a function`
		);
	}

	return userHandler.length >= 3 ? promisify(userHandler) : userHandler;
}

async function request(options): Promise<HttpResult> {
	options.host = HOST;
	options.port = PORT;

	return new Promise((resolve, reject) => {
		const req = http.request(options, res => {
			const bufs = [];
			res.on('data', data => bufs.push(data));
			res.on('end', () =>
				resolve({
					statusCode: res.statusCode,
					headers: res.headers,
					body: Buffer.concat(bufs).toString('utf8')
				})
			);
			res.on('error', reject);
		});
		req.on('error', reject);
		req.end(options.body);
	});
}

function toLambdaErr({ name, message, stack }) {
	return {
		errorType: name,
		errorMessage: message,
		stackTrace: (stack || '').split('\n').slice(1)
	};
}
