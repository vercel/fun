import http, { Server } from 'node:http';
import { parse } from 'node:url';
import createDebug from 'debug';
import { run, text } from 'micro';
import { randomUUID as uuid } from 'node:crypto';
import { match } from 'path-to-regexp';
import once from '@tootallnate/once';

import { createDeferred, Deferred } from './deferred';
import { Lambda, InvokeParams, InvokeResult } from './types';

const matchFn = match('/:version/runtime/:subject/:target{/:action}');
const debug = createDebug('@vercel/fun:runtime-server');

function send404(res: http.ServerResponse) {
	res.statusCode = 404;
	res.end();
}

export class RuntimeServer extends Server {
	public version: string;
	public initDeferred: Deferred<InvokeResult | void>;
	public resultDeferred: Deferred<InvokeResult>;
	private nextDeferred: Deferred<void>;
	private invokeDeferred: Deferred<InvokeParams>;
	private lambda: Lambda;
	private currentRequestId: string;

	constructor(fn: Lambda) {
		super();
		this.version = '2018-06-01';

		const serve = this.serve.bind(this);
		this.on('request', (req, res) => run(req, res, serve));

		this.lambda = fn;
		this.initDeferred = createDeferred<void>();
		this.resetInvocationState();
	}

	resetInvocationState() {
		this.nextDeferred = createDeferred<void>();
		this.invokeDeferred = null;
		this.resultDeferred = null;
		this.currentRequestId = uuid();
	}

	async serve(
		req: http.IncomingMessage,
		res: http.ServerResponse
	): Promise<any> {
		debug('%s %s', req.method, req.url);

		const result = matchFn(parse(req.url).pathname);
		if (!result) {
			return send404(res);
		}

		const { version, subject, target, action } = result.params as {
			version: string;
			subject: string;
			target: string;
			action?: string;
		};
		if (this.version !== version) {
			debug(
				'Invalid API version, expected %o but got %o',
				this.version,
				version
			);
			return send404(res);
		}

		// Routing logic
		if (subject === 'invocation') {
			if (target === 'next') {
				return this.handleNextInvocation(req, res);
			} else {
				// Assume it's an "AwsRequestId"
				if (action === 'response') {
					return this.handleInvocationResponse(req, res, target);
				} else if (action === 'error') {
					return this.handleInvocationError(req, res, target);
				} else {
					return send404(res);
				}
			}
		} else if (subject === 'init') {
			if (target === 'error') {
				return this.handleInitializationError(req, res);
			} else {
				return send404(res);
			}
		} else {
			return send404(res);
		}
	}

	async handleNextInvocation(
		req: http.IncomingMessage,
		res: http.ServerResponse
	): Promise<void> {
		const { initDeferred } = this;
		if (initDeferred) {
			debug('Runtime successfully initialized');
			this.initDeferred = null;
			initDeferred.resolve();
		}

		this.invokeDeferred = createDeferred<InvokeParams>();
		this.resultDeferred = createDeferred<InvokeResult>();
		this.nextDeferred.resolve();
		this.nextDeferred = null;

		debug('Waiting for the `invoke()` function to be called');
		// @ts-ignore
		req.setTimeout(0); // disable default 2 minute socket timeout
		const params = await this.invokeDeferred.promise;

		// TODO: use dynamic values from lambda params
		const deadline = 5000;
		const functionArn =
			'arn:aws:lambda:us-west-1:977805900156:function:nate-dump';
		res.setHeader('Lambda-Runtime-Aws-Request-Id', this.currentRequestId);
		res.setHeader('Lambda-Runtime-Invoked-Function-Arn', functionArn);
		res.setHeader('Lambda-Runtime-Deadline-Ms', String(deadline));
		const finish = once(res, 'finish');
		res.end(params.Payload);
		await finish;
	}

	async handleInvocationResponse(req, res, requestId: string): Promise<void> {
		// `RequestResponse` = 200
		// `Event` = 202
		// `DryRun` = 204
		const statusCode = 200;
		const payload: InvokeResult = {
			StatusCode: statusCode,
			ExecutedVersion: '$LATEST',
			Payload: await text(req, { limit: '6mb' })
		};

		res.statusCode = 202;
		const finish = once(res, 'finish');
		res.end();
		await finish;

		this.resultDeferred.resolve(payload);
		this.resetInvocationState();
	}

	async handleInvocationError(req, res, requestId: string): Promise<void> {
		const statusCode = 200;
		const payload: InvokeResult = {
			StatusCode: statusCode,
			FunctionError: 'Handled',
			ExecutedVersion: '$LATEST',
			Payload: await text(req, { limit: '6mb' })
		};

		res.statusCode = 202;
		const finish = once(res, 'finish');
		res.end();
		await finish;

		this.resultDeferred.resolve(payload);
		this.resetInvocationState();
	}

	async handleInitializationError(req, res): Promise<void> {
		const statusCode = 200;
		const payload: InvokeResult = {
			StatusCode: statusCode,
			FunctionError: 'Unhandled',
			ExecutedVersion: '$LATEST',
			Payload: await text(req, { limit: '6mb' })
		};

		res.statusCode = 202;
		const finish = once(res, 'finish');
		res.end();
		await finish;

		this.initDeferred.resolve(payload);
	}

	async invoke(
		params: InvokeParams = { InvocationType: 'RequestResponse' }
	): Promise<InvokeResult> {
		if (this.nextDeferred) {
			debug('Waiting for `next` invocation request from runtime');
			await this.nextDeferred.promise;
		}
		if (!params.Payload) {
			params.Payload = '{}';
		}
		this.invokeDeferred.resolve(params);
		const result = await this.resultDeferred.promise;
		return result;
	}

	close(callback?: (err?: Error) => void): this {
		const deferred = this.initDeferred || this.resultDeferred;
		if (deferred) {
			const statusCode = 200;
			deferred.resolve({
				StatusCode: statusCode,
				FunctionError: 'Unhandled',
				ExecutedVersion: '$LATEST',
				Payload: JSON.stringify({
					errorMessage: `RequestId: ${
						this.currentRequestId
					} Process exited before completing request`
				})
			});
		}
		super.close(callback);
		return this;
	}
}
