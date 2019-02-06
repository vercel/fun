process.env.TESTING = '1';

import * as assert from 'assert';
import { basename } from 'path';
import { readdir, readFile } from 'fs-extra';
import { Lambda } from '../src/types';
import { createFunction, ValidationError } from '../src';

describe('createFunction() validation', () => {
	it('should return a function with the expected properties', async function () {
		const fn = await createFunction({
			Code: {
				Directory: __dirname + '/functions/nodejs-echo'
			},
			Handler: 'handler.handler',
			Runtime: 'nodejs',
			Environment: {
				Variables: {
					HELLO: 'world'
				}
			}
		});
		assert.equal(typeof fn, 'function');
		assert.equal(fn.version, '$LATEST');
		//assert.equal(fn.functionName, 'nodejs-echo');
	});

	it('should throw an error when given reserved environment variables', async function () {
		let err;
		try {
			await createFunction({
				Code: {
					Directory: __dirname + '/functions/nodejs-echo'
				},
				Handler: 'handler.handler',
				Runtime: 'nodejs',
				Environment: {
					Variables: {
						AWS_REGION: 'foo',
						TZ: 'US/Pacific'
					}
				}
			});
		} catch (_err) {
			err = _err;
		}
		assert(err);
		assert(err instanceof ValidationError);
		assert.equal(err.name, 'ValidationError');
		assert.deepEqual(err.reserved, ['AWS_REGION', 'TZ']);
		assert.equal(
			err.toString(),
			'ValidationError: The following environment variables can not be configured: AWS_REGION, TZ'
		);
	});
});

describe('createFunction() invocation', function () {
	let fn: Lambda = null;

	afterEach(async function () {
		if (fn) {
			await fn.destroy();
			fn = null;
		}
	});

	this.slow(500);
	this.timeout(5 * 1000);

	// `nodejs` runtime
	it('should invoke `nodejs-echo` function', async function () {
		fn = await createFunction({
			Code: {
				Directory: __dirname + '/functions/nodejs-echo'
			},
			Handler: 'handler.handler',
			Runtime: 'nodejs'
		});

		const res = await fn.invoke({
			Payload: JSON.stringify({ hello: 'world' })
		});
		assert.equal(res.StatusCode, 200);
		assert.equal(res.ExecutedVersion, '$LATEST');
		assert.equal(typeof res.Payload, 'string');
		const payload = JSON.parse(String(res.Payload));
		assert.deepEqual(payload.event, { hello: 'world' });
	});

	// `go1.x` runtime
	it('should invoke `go-echo` function', async function () {
		fn = await createFunction({
			Code: {
				Directory: __dirname + '/functions/go-echo'
			},
			Handler: 'handler',
			Runtime: 'go1.x'
		});
		const payload = await fn({ hello: 'world' });
		assert.deepEqual(payload, { hello: 'world' });
	});
});

/*
export const test_nodejs_event = testInvoke(
	() =>
		createFunction({
			Code: {
				Directory: __dirname + '/functions/nodejs-echo'
			},
			Handler: 'handler.handler',
			Runtime: 'nodejs'
		}),
	async fn => {
		const res = await fn.invoke({
			Payload: JSON.stringify({ hello: 'world' })
		});
		assert.equal(res.StatusCode, 200);
		assert.equal(res.ExecutedVersion, '$LATEST');
		assert.equal(typeof res.Payload, 'string');
		const payload = JSON.parse(String(res.Payload));
		assert.deepEqual(payload.event, { hello: 'world' });
	}
);

export const test_nodejs_no_payload = testInvoke(
	() =>
		createFunction({
			Code: {
				Directory: __dirname + '/functions/nodejs-echo'
			},
			Handler: 'handler.handler',
			Runtime: 'nodejs'
		}),
	async fn => {
		const res = await fn.invoke();
		assert.equal(typeof res.Payload, 'string');
		const payload = JSON.parse(String(res.Payload));
		assert.deepEqual(payload.event, {});
	}
);

export const test_nodejs_context = testInvoke(
	() =>
		createFunction({
			Code: {
				Directory: __dirname + '/functions/nodejs-echo'
			},
			Handler: 'handler.handler',
			Runtime: 'nodejs'
		}),
	async fn => {
		const res = await fn.invoke();
		const { context } = JSON.parse(String(res.Payload));
		assert.equal(context.logGroupName, 'aws/lambda/nodejs-echo');
		assert.equal(context.functionName, 'nodejs-echo');
		assert.equal(context.memoryLimitInMB, '128');
		assert.equal(context.functionVersion, '$LATEST');
	}
);

export const test_env_vars = testInvoke(
	() =>
		createFunction({
			Code: {
				Directory: __dirname + '/functions/nodejs-env'
			},
			Handler: 'index.env',
			Runtime: 'nodejs'
		}),
	async fn => {
		const res = await fn.invoke();
		assert.equal(typeof res.Payload, 'string');
		const env = JSON.parse(String(res.Payload));
		assert(env.LAMBDA_TASK_ROOT.length > 0);
		assert(env.LAMBDA_RUNTIME_DIR.length > 0);
		assert.equal(env.TZ, ':UTC');
		assert.equal(env.LANG, 'en_US.UTF-8');
		assert.equal(env._HANDLER, 'index.env');
		assert.equal(env.AWS_LAMBDA_FUNCTION_VERSION, '$LATEST');
		assert.equal(env.AWS_EXECUTION_ENV, 'AWS_Lambda_nodejs');
		assert.equal(env.AWS_LAMBDA_FUNCTION_NAME, 'nodejs-env');
		assert.equal(env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE, '128');
	}
);

export const test_double_invoke_serial = testInvoke(
	() =>
		createFunction({
			Code: {
				Directory: __dirname + '/functions/nodejs-pid'
			},
			Handler: 'index.pid',
			Runtime: 'nodejs'
		}),
	async fn => {
		let res;

		// Invoke once, will fire up a new lambda process
		res = await fn.invoke();
		assert.equal(typeof res.Payload, 'string');
		const pid = JSON.parse(String(res.Payload));
		assert.equal(typeof pid, 'number');
		assert.notEqual(pid, process.pid);

		// Invoke a second time, the same lambda process will be used
		res = await fn.invoke();
		assert.equal(typeof res.Payload, 'string');
		const pid2 = JSON.parse(String(res.Payload));
		assert.equal(pid, pid2);
	}
);

export const test_double_invoke_parallel = testInvoke(
	() =>
		createFunction({
			Code: {
				Directory: __dirname + '/functions/nodejs-pid'
			},
			Handler: 'index.pid',
			Runtime: 'nodejs'
		}),
	async fn => {
		const [res1, res2] = await Promise.all([fn.invoke(), fn.invoke()]);
		const pid1 = JSON.parse(String(res1.Payload));
		const pid2 = JSON.parse(String(res2.Payload));
		assert.notEqual(pid1, process.pid);
		assert.notEqual(pid2, process.pid);

		// This assert always passed on my MacBook 12", but is flaky on
		// CircleCI's containers due to the second worker process not yet
		// being in an initialized state.
		// assert.notEqual(pid1, pid2);
	}
);

export const test_lambda_invoke = testInvoke(
	() =>
		createFunction({
			Code: {
				Directory: __dirname + '/functions/nodejs-echo'
			},
			Handler: 'handler.handler',
			Runtime: 'nodejs'
		}),
	async fn => {
		const payload = await fn({ hello: 'world' });
		assert.deepEqual(payload.event, { hello: 'world' });
	}
);

// `provided` runtime
export const test_provided_bash_echo = testInvoke(
	() =>
		createFunction({
			Code: {
				Directory: __dirname + '/functions/provided-bash-echo'
			},
			Handler: 'handler.handler',
			Runtime: 'provided'
		}),
	async fn => {
		const payload = await fn({ hello: 'world' });
		assert.deepEqual(payload, { hello: 'world' });
	}
);

// `nodejs6.10` runtime
export const test_nodejs610_version = testInvoke(
	() =>
		createFunction({
			Code: {
				Directory: __dirname + '/functions/nodejs-version'
			},
			Handler: 'handler.handler',
			Runtime: 'nodejs6.10'
		}),
	async fn => {
		const versions = await fn({ hello: 'world' });
		assert.equal(versions.node, '6.10.0');
	}
);

// `nodejs8.10` runtime
export const test_nodejs810_version = testInvoke(
	() =>
		createFunction({
			Code: {
				Directory: __dirname + '/functions/nodejs-version'
			},
			Handler: 'handler.handler',
			Runtime: 'nodejs8.10'
		}),
	async fn => {
		const versions = await fn({ hello: 'world' });
		assert.equal(versions.node, '8.10.0');
	}
);

// `ZipFile` Buffer support
export const test_lambda_zip_file_buffer = testInvoke(
	async () => {
		return await createFunction({
			Code: {
				ZipFile: await readFile(__dirname + '/functions/nodejs-env.zip')
			},
			Handler: 'index.env',
			Runtime: 'nodejs',
			Environment: {
				Variables: {
					HELLO: 'world'
				}
			}
		});
	},
	async fn => {
		const env = await fn();
		assert.equal(env.HELLO, 'world');
		// Assert that the `TASK_ROOT` dir includes the "lambda-dev-" prefix
		assert(/^lambda-dev-/.test(basename(env.LAMBDA_TASK_ROOT)));
	}
);

// `ZipFile` string support
export const test_lambda_zip_file_string = testInvoke(
	() =>
		createFunction({
			Code: {
				ZipFile: __dirname + '/functions/nodejs-env.zip'
			},
			Handler: 'index.env',
			Runtime: 'nodejs',
			Environment: {
				Variables: {
					HELLO: 'world'
				}
			}
		}),
	async fn => {
		const env = await fn();
		assert.equal(env.HELLO, 'world');
		// Assert that the `TASK_ROOT` dir includes the "lambda-dev-" prefix
		assert(/^lambda-dev-/.test(basename(env.LAMBDA_TASK_ROOT)));
	}
);
*/
