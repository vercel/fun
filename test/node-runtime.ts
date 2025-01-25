import { createFunction } from "../src";
import { LambdaError } from "../src/errors";

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

function assertProcessExitedError(err: Error): void {
    assert(err instanceof LambdaError);
    assert.equal(err.name, 'LambdaError');
    assert(
        /RequestId: [a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12} Process exited before completing request/.test(
            err.message
        )
    );
}

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