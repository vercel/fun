# ƒun

Local Lambda development environment.


## Example

Given a Lambda function like this one:

```js
// index.js
exports.handler = function(event, context, callback) {
  callback(null, { hello: 'world' });
};
```

You can invoke this function locally using the code below:

```js
const { createFunction } = require('@zeit/fun');

async function main() {
  // Starts up the necessary server to be able to invoke the function
  const fn = await createFunction({
    Code: {
      // `ZipFile` works, or an already unzipped directory may be specified
      Directory: __dirname + '/example'
    },
    Handler: 'index.handler',
    Runtime: 'nodejs',
    Environment: {
      Variables: {
        "HELLO": "world"
      }
    },
    MemorySize: 512
  });

  // Invoke the function with a custom payload. A new instance of the function
  // will be initialized if there is not an available one ready to process.
  const res = await fn({ hello: 'world' });

  console.log(res);
  // Prints: { hello: 'world' }

  // Once we are done with the function, destroy it so that the processes are
  // cleaned up, and the API server is shut down (useful for hot-reloading).
  await fn.destroy();
}

main().catch(console.error);
```


## Providers

`lambda-dev` has a concept of pluggable "providers", which are responsible for
creating, freezing, unfreezing and shutting down the processes that execute the
Lambda function.

### `native`

The `native` provider executes Lambda functions directly on the machine executing
`lambda-dev`. This provides an execution environment that closely resembles the
real Lambda environment, with some key differences that are documented here:

 * Processes are *not* sandboxed nor chrooted, so do not rely on hard-coded
   locations like `/var/task`, `/var/runtime`, `/opt`, etc. Instead, your
   function code should use the environment variables that represent these
   locations (namely `LAMBDA_TASK_ROOT` and `LAMBDA_RUNTIME_DIR`).
 * Processes are frozen by sending the `SIGSTOP` signal to the lambda process,
   and unfrozen by sending the `SIGCONT` signal.
 * Lambdas that compile to native executables (i.e. Go) will need to be compiled
   for your operating system. So if you are on MacOS, then the binary needs to be
   executable on MacOS.

### `docker`

A `docker` provider is planned, but not yet implemented. This will allow for an
execution environment that more closely matches the AWS Lambda environment,
including the ability to execute Linux x64 binaries / shared libraries.


## Runtimes

`lambda-dev` aims to support all runtimes that AWS Lambda provides. Currently
implemented are:

 * `nodejs` for Node.js Lambda functions using the system `node` binary
 * `nodejs6.10` for Node.js Lambda functions using a downloaded Node v6.10.0 binary
 * `nodejs8.10` for Node.js Lambda functions using a downloaded Node v8.10.0 binary
 * `go1.x` for Lambda functions written in Go - binary must be compiled for your platform
 * `provided` for [custom runtimes](https://docs.aws.amazon.com/lambda/latest/dg/runtimes-custom.html)
