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
