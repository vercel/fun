import { basename, join } from 'path';
import { tmpdir } from 'os';
import * as execa from 'execa';
import * as assert from 'assert';
import { mkdirp, remove, readdir, readFile } from 'fs-extra';
import { createFunction, ValidationError } from '../src';
import { generateTarballUrl, installNode } from '../src/install-node';

// `install-node.ts` tests
export function test_install_node_tarball_url() {
	assert.equal(
		'https://nodejs.org/dist/v8.10.0/node-v8.10.0-darwin-x64.tar.gz',
		generateTarballUrl('8.10.0', 'darwin', 'x64')
	);
}

export async function test_install_node() {
	const version = 'v10.0.0';
	const dest = join(
		tmpdir(),
		`install-node-${Math.random()
			.toString(16)
			.substring(2)}`
	);
	await mkdirp(dest);
	try {
		await installNode(dest, version);
		const res = await execa(join(dest, 'bin/node'), [
			'-p',
			'process.version'
		]);
		assert.equal(res.stdout.trim(), version);
	} finally {
		// Clean up
		await remove(dest);
	}
}

// Validation
export const test_lambda_properties = async () => {
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
	assert.equal(fn.version, '$LATEST');
	//assert.equal(fn.functionName, 'nodejs-echo');
};

export const test_reserved_env = async () => {
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
};

// Invocation
function testInvoke(fnPromise, test) {
	return async function() {
		const fn = await fnPromise();
		try {
			await test(fn);
		} finally {
			await fn.destroy();
		}
	};
}

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

// `go1.x` runtime
export const test_go1x_echo = testInvoke(
	() =>
		createFunction({
			Code: {
				Directory: __dirname + '/functions/go-echo'
			},
			Handler: 'handler',
			Runtime: 'go1.x'
		}),
	async fn => {
		const payload = await fn({ hello: 'world' });
		assert.deepEqual(payload, { hello: 'world' });
	}
);

// `python` runtime
export const test_python_hello = testInvoke(
	() =>
		createFunction({
			Code: {
				Directory: __dirname + '/functions/python-hello'
			},
			Handler: 'handler.handler',
			Runtime: 'python'
		}),
	async fn => {
		const payload = await fn({ first_name: 'John', last_name: 'Smith' });
		assert.deepEqual(payload, { message: 'Hello John Smith!' });
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
		// Assert that the `TASK_ROOT` dir includes the "zeit-fun-" prefix
		assert(/^zeit-fun-/.test(basename(env.LAMBDA_TASK_ROOT)));
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
		// Assert that the `TASK_ROOT` dir includes the "zeit-fun-" prefix
		assert(/^zeit-fun-/.test(basename(env.LAMBDA_TASK_ROOT)));
	}
);

// `pkg` compilation support
export const test_pkg_support = async () => {
	const root = require.resolve('pkg').replace(/\/node_modules(.*)$/, '');
	const pkg = join(root, 'node_modules/.bin/pkg');
	await execa(pkg, ['-t', 'node8', 'test/pkg-invoke.js'], {
		cwd: root
	});
	const output = await execa.stdout(join(root, 'pkg-invoke'), {
		cwd: __dirname,
		stdio: ['ignore', 'pipe', 'inherit']
	});
	assert.equal(JSON.parse(output).hello, 'world');
};
