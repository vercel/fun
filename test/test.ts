import { basename } from 'node:path';
import { readFile } from 'node:fs/promises';
import {
	funCacheDir,
	cleanCacheDir,
	createFunction
} from '../src';
import { LambdaError } from '../src/errors';

function assertProcessExitedError(err: Error): void {
	assert(err instanceof LambdaError);
	assert.equal(err.name, 'LambdaError');
	assert(
		/RequestId: [a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12} Process exited before completing request/.test(
			err.message
		)
	);
}

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
