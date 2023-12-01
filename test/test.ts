import execa from 'execa';
import { tmpdir } from 'os';
import assert from 'assert';
import { basename, join } from 'path';
import { mkdirp, remove, readFile, stat } from 'fs-extra';
import {
	funCacheDir,
	initializeRuntime,
	cleanCacheDir,
	createFunction,
	ValidationError
} from '../src';
import { generateNodeTarballUrl, installNode } from '../src/install-node';
import { generatePythonTarballUrl, installPython } from '../src/install-python';
import { LambdaError } from '../src/errors';

const isWin = process.platform === 'win32';

function assertProcessExitedError(err: Error): void {
	assert(err instanceof LambdaError);
	assert.equal(err.name, 'LambdaError');
	assert(
		/RequestId: [a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12} Process exited before completing request/.test(
			err.message
		)
	);
}

jest.setTimeout(20_000);

function testInvoke(
	fnPromise: () => Promise<any>,
	test: (...args: any[]) => Promise<unknown>
) {
	return async function() {
		const fn = await fnPromise();
		try {
			await test(fn);
		} finally {
			await fn.destroy();
		}
	};
}

it('funCacheDir', () => {
	expect(typeof funCacheDir).toBe('string');
});

it('LambdaError', () => {
	const err = new LambdaError({
		errorType: 'InitError',
		errorMessage: 'I crashed!',
		stackTrace: [
			'    at Object.<anonymous> (/Code/zeit/fun/test/functions/nodejs-init-error/handler.js:2:7)',
			'    at Module._compile (module.js:652:30)',
			'    at Object.Module._extensions..js (module.js:663:10)',
			'    at Module.load (module.js:565:32)',
			'    at tryModuleLoad (module.js:505:12)',
			'    at Function.Module._load (module.js:497:3)',
			'    at Module.require (module.js:596:17)',
			'    at require (internal/module.js:11:18)',
			'    at getHandler (/Library/Caches/co.zeit.fun/runtimes/nodejs/bootstrap.js:151:15)',
			'    at /Library/Caches/co.zeit.fun/runtimes/nodejs/bootstrap.js:37:23'
		]
	});
	expect(err.name).toBe('InitError');
	expect(err.message).toBe('I crashed!');
	expect(err.stack).toContain('nodejs-init-error/handler.js');
});

// `install-node.ts` tests
it('install_node_tarball_url_darwin', () => {
	expect(generateNodeTarballUrl('8.10.0', 'darwin', 'x64')).toBe(
		'https://nodejs.org/dist/v8.10.0/node-v8.10.0-darwin-x64.tar.gz'
	);
});

it('install_node_tarball_url_windows', () => {
	expect(generateNodeTarballUrl('8.10.0', 'win32', 'x64')).toBe(
		'https://nodejs.org/dist/v8.10.0/node-v8.10.0-win-x64.zip'
	);
});

it('install_node', async () => {
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
		expect(res.stdout.trim()).toBe(version);
	} finally {
		// Clean up
		try {
			await remove(dest);
		} catch (err) {
			// On Windows EPERM can happen due to anti-virus software like Windows Defender.
			// There's nothing that we can do about it so don't fail the test case when it happens.
			if (err.code !== 'EPERM') {
				throw err;
			}
		}
	}
});

// `install-python.ts` tests
it('install_python_tarball_url', () => {
	expect(generatePythonTarballUrl('2.7.12', 'darwin', 'x64')).toBe(
		'https://python-binaries.zeit.sh/python-2.7.12-darwin-x64.tar.gz'
	);
});

it('install_python', async () => {
	const version = '3.6.8';
	const dest = join(
		tmpdir(),
		`install-python-${Math.random()
			.toString(16)
			.substring(2)}`
	);
	await mkdirp(dest);
	try {
		await installPython(dest, version);
		const res = await execa(join(dest, 'bin/python'), [
			'-c',
			'import platform; print(platform.python_version())'
		]);
		expect(res.stdout.trim()).toBe(version);
	} finally {
		// Clean up
		//await remove(dest);
	}
});

// Validation
it('lambda_properties', async () => {
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
	expect(fn.version).toBe('$LATEST');
	//assert.equal(fn.functionName, 'nodejs-echo');
});

it('reserved_env', async () => {
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

// Initialization
it('initialize_runtime_with_string', async () => {
	const runtime = await initializeRuntime('nodejs8.10');
	assert.equal(typeof runtime.cacheDir, 'string');
	const nodeName = isWin ? 'node.exe' : 'node';
	const nodeStat = await stat(join(runtime.cacheDir, 'bin', nodeName));
	assert(nodeStat.isFile());
});

it('initialize_runtime_with_invalid_name', async () => {
	let err: Error;
	try {
		await initializeRuntime('node8.10');
	} catch (_err) {
		err = _err;
	}
	assert(err);
	assert.equal('Could not find runtime with name "node8.10"', err.message);
});

// Invocation
it(
	'nodejs_event',
	testInvoke(
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
	)
);

it(
	'nodejs_no_payload',
	testInvoke(
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
	)
);

it(
	'nodejs_context',
	testInvoke(
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
	)
);

it(
	'env_vars',
	testInvoke(
		() =>
			createFunction({
				Code: {
					Directory: __dirname + '/functions/nodejs-env'
				},
				Handler: 'index.env',
				Runtime: 'nodejs',
				AccessKeyId: 'TestAccessKeyId',
				SecretAccessKey: 'TestSecretAccessKey'
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
			assert.equal(env.AWS_ACCESS_KEY_ID, 'TestAccessKeyId');
			assert.equal(env.AWS_SECRET_ACCESS_KEY, 'TestSecretAccessKey');
		}
	)
);

it(
	'double_invoke_serial',
	testInvoke(
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
	)
);

it(
	'double_invoke_parallel',
	testInvoke(
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
	)
);

test(
	'lambda_invoke',
	testInvoke(
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
	)
);

it(
	'lambda_callback_with_return',
	testInvoke(
		() =>
			createFunction({
				Code: {
					Directory:
						__dirname + '/functions/nodejs-callback-with-return'
				},
				Handler: 'handler.handler',
				Runtime: 'nodejs'
			}),
		async fn => {
			const payload = await fn();
			assert.deepEqual(payload, { foo: 'bar' });
		}
	)
);

it(
	'nodejs_exit_before_init',
	testInvoke(
		() =>
			createFunction({
				Code: {
					Directory: __dirname + '/functions/nodejs-exit'
				},
				Handler: 'handler.handler',
				Runtime: 'nodejs'
			}),
		async fn => {
			let err;
			try {
				await fn();
			} catch (_err) {
				err = _err;
			}
			assert(err);
			assertProcessExitedError(err);
		}
	)
);

// `fun` should be resilient to its runtime cache being wiped away during
// runtime. At least, in between function creations. Consider a user running
// `now dev cache clean` while a `now dev` server is running, and then the
// user does a hard refresh to re-create the Lambda functions.
interface Hello {
	event: {
		hello: string;
	};
}
it('clean_cache_dir_recovery', async () => {
	await cleanCacheDir();
	const fn = await createFunction({
		Code: {
			Directory: __dirname + '/functions/nodejs-echo'
		},
		Handler: 'handler.handler',
		Runtime: 'nodejs'
	});
	try {
		const payload = await fn<Hello>({ hello: 'world' });
		assert.deepEqual(payload.event, { hello: 'world' });
	} finally {
		await fn.destroy();
	}
});

// `provided` runtime
it(
	'provided_bash_echo',
	testInvoke(
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
	)
);

// `nodejs6.10` runtime
it(
	'nodejs610_version',
	testInvoke(
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
	)
);

// `nodejs8.10` runtime
it(
	'nodejs810_version',
	testInvoke(
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
	)
);

it(
	'nodejs810_handled_error',
	testInvoke(
		() =>
			createFunction({
				Code: {
					Directory: __dirname + '/functions/nodejs-eval'
				},
				Handler: 'handler.handler',
				Runtime: 'nodejs8.10'
			}),
		async fn => {
			let err;
			const error = 'this is a handled error';
			try {
				await fn({ error });
			} catch (_err) {
				err = _err;
			}
			assert(err);
			expect(err.message).toBe(error);

			const { result } = await fn({ code: '1 + 1' });
			expect(result).toBe(2);
		}
	)
);

it(
	'nodejs_reference_error',
	testInvoke(
		() =>
			createFunction({
				Code: {
					Directory: __dirname + '/functions/nodejs-reference-error'
				},
				Handler: 'handler.handler',
				Runtime: 'nodejs'
			}),
		async fn => {
			let err;
			try {
				await fn();
			} catch (_err) {
				err = _err;
			}
			assert(err);
			assert.equal(err.name, 'ReferenceError');
			assert.equal(err.message, 'x is not defined');
		}
	)
);

it(
	'nodejs810_exit_in_handler',
	testInvoke(
		() =>
			createFunction({
				Code: {
					Directory: __dirname + '/functions/nodejs-eval'
				},
				Handler: 'handler.handler',
				Runtime: 'nodejs8.10'
			}),
		async fn => {
			let err;
			try {
				await fn({ code: 'process.exit(5)' });
			} catch (_err) {
				err = _err;
			}
			assert(err);
			assertProcessExitedError(err);
		}
	)
);

// `nodejs10.x` runtime
it(
	'nodejs10_version',
	testInvoke(
		() =>
			createFunction({
				Code: {
					Directory: __dirname + '/functions/nodejs-version'
				},
				Handler: 'handler.handler',
				Runtime: 'nodejs10.x'
			}),
		async fn => {
			const versions = await fn({ hello: 'world' });
			assert.equal(versions.node, '10.15.3');
		}
	)
);

// `nodejs12.x` runtime
it(
	'nodejs12_version',
	testInvoke(
		() =>
			createFunction({
				Code: {
					Directory: __dirname + '/functions/nodejs-version'
				},
				Handler: 'handler.handler',
				Runtime: 'nodejs12.x'
			}),
		async fn => {
			const versions = await fn({ hello: 'world' });
			assert.equal(versions.node, '12.22.7');
		}
	)
);

// `nodejs14.x` runtime
it(
	'nodejs14_version',
	testInvoke(
		() =>
			createFunction({
				Code: {
					Directory: __dirname + '/functions/nodejs-version'
				},
				Handler: 'handler.handler',
				Runtime: 'nodejs14.x'
			}),
		async fn => {
			const versions = await fn({ hello: 'world' });
			assert.equal(versions.node, '14.18.1');
		}
	)
);

// Support for paths as Handler
it(
	'lambda_nested_handler',
	testInvoke(
		() =>
			createFunction({
				Code: {
					Directory: __dirname + '/functions/nodejs-nested-handler'
				},
				Handler: 'hid.den/launcher.handler',
				Runtime: 'nodejs',
				Environment: {
					Variables: {
						HELLO: 'world'
					}
				}
			}),
		async fn => {
			const env = await fn();
			expect(env.HELLO).toBe('world');
		}
	)
);

// `python` runtime
it(
	'python_hello',
	testInvoke(
		() =>
			createFunction({
				Code: {
					Directory: __dirname + '/functions/python-hello'
				},
				Handler: 'hello.hello_handler',
				Runtime: 'python'
			}),
		async fn => {
			const payload = await fn({
				first_name: 'John',
				last_name: 'Smith'
			});
			assert.deepEqual(payload, { message: 'Hello John Smith!' });
		}
	)
);

// `python2.7` runtime
it(
	'python27_version',
	testInvoke(
		() =>
			createFunction({
				Code: {
					Directory: __dirname + '/functions/python-version'
				},
				Handler: 'handler.handler',
				Runtime: 'python2.7'
			}),
		async fn => {
			const payload = await fn();
			assert.equal(payload['platform.python_version'], '2.7.12');
		}
	)
);

// `python3` runtime
it(
	'python3_version',
	testInvoke(
		() =>
			createFunction({
				Code: {
					Directory: __dirname + '/functions/python-version'
				},
				Handler: 'handler.handler',
				Runtime: 'python3'
			}),
		async fn => {
			const payload = await fn();
			assert.equal(payload['platform.python_version'], '3.6.8');
		}
	)
);

// `python3.6` runtime
it(
	'python36_version',
	testInvoke(
		() =>
			createFunction({
				Code: {
					Directory: __dirname + '/functions/python-version'
				},
				Handler: 'handler.handler',
				Runtime: 'python3.6'
			}),
		async fn => {
			const payload = await fn();
			assert.equal(payload['platform.python_version'], '3.6.8');
		}
	)
);

// `python3.7` runtime
it(
	'python37_version',
	testInvoke(
		() =>
			createFunction({
				Code: {
					Directory: __dirname + '/functions/python-version'
				},
				Handler: 'handler.handler',
				Runtime: 'python3.7'
			}),
		async fn => {
			const payload = await fn();
			assert.equal(payload['platform.python_version'], '3.7.2');
		}
	)
);

// `ZipFile` Buffer support
it(
	'lambda_zip_file_buffer',
	testInvoke(
		async () => {
			return await createFunction({
				Code: {
					ZipFile: await readFile(
						__dirname + '/functions/nodejs-env.zip'
					)
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
	)
);

// `ZipFile` string support
it(
	'lambda_zip_file_string',
	testInvoke(
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
	)
);

// `pkg` compilation support, requires go@1.15 (must not be a higher version)
// and only supports up to Node.js 10 and requires Python 2.6 or 2.7, so
// we are skipping this until `pkg` becomes more modernized
it.skip('pkg_support', async () => {
	const root = require.resolve('pkg').replace(/\/node_modules(.*)$/, '');
	const pkg = join(root, 'node_modules/.bin/pkg');
	await execa(pkg, ['-t', 'node8', 'test/pkg-invoke.js'], {
		cwd: root
	});
	const { stdout } = await execa(join(root, 'pkg-invoke'), {
		cwd: __dirname,
		stdio: ['ignore', 'pipe', 'inherit']
	});
	expect(JSON.parse(stdout).hello).toBe('world');
});

// `go1.x` runtime, requires go@1.15, must not be a higher version
it.skip(
	'go1x_echo',
	testInvoke(
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
			expect(payload).toEqual({ hello: 'world' });
		}
	)
);
