import { createFunction, ValidationError } from "../src";

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