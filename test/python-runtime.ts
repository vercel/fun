import { createFunction } from "../src";


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
			assert.equal(payload['platform.python_version'][0], '3');
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