import * as uuid from 'uuid/v4';
import { parse } from 'url';
import { Server } from 'http';
import createDebug from 'debug';
import { run, text } from 'micro';
import * as createPathMatch from 'path-match';

import { createDeferred, Deferred } from './deferred';
import { Lambda, InvokeParams, InvokeResult } from './types';

const pathMatch = createPathMatch();
const match = pathMatch('/:version/runtime/:subject/:target/:action?');
const debug = createDebug('@zeit/fun:runtime-server');

function send404(res) {
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
		this.currentRequestId = null;
	}

	async serve(req, res): Promise<any> {
		debug('%s %s', req.method, req.url);

		let err;
		const params = match(parse(req.url).pathname);
		if (!params) {
			return send404(res);
		}

		const { version, subject, target, action } = params;
		if (this.version !== version) {
			debug(
				'Invalid API version, expected %o but got %o',
				this.version,
				version
			);
			return send404(res);
		}
		//console.error({ url: req.url, headers: req.headers, params });

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

	async handleNextInvocation(req, res): Promise<void> {
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
		req.setTimeout(0); // disable default 2 minute socket timeout
		const params = await this.invokeDeferred.promise;
		const requestId = uuid();
		this.currentRequestId = requestId;

		// TODO: use dynamic values from lambda params
		const deadline = 5000;
		const functionArn =
			'arn:aws:lambda:us-west-1:977805900156:function:nate-dump';
		res.setHeader('Lambda-Runtime-Aws-Request-Id', requestId);
		res.setHeader('Lambda-Runtime-Invoked-Function-Arn', functionArn);
		res.setHeader('Lambda-Runtime-Deadline-Ms', String(deadline));
		res.end(params.Payload);
	}

	async handleInvocationResponse(req, res, requestId: string): Promise<void> {
		// `RequestResponse` = 200
		// `Event` = 202
		// `DryRun` = 204
		const statusCode = 200;
		this.resultDeferred.resolve({
			StatusCode: statusCode,
			ExecutedVersion: '$LATEST',
			Payload: await text(req)
		});
		this.resetInvocationState();
		res.statusCode = 202;
		res.end();
	}

	async handleInvocationError(req, res, requestId: string): Promise<void> {
		const statusCode = 200;
		this.resultDeferred.resolve({
			StatusCode: statusCode,
			FunctionError: 'Handled',
			ExecutedVersion: '$LATEST',
			Payload: await text(req)
		});
		this.resetInvocationState();
		res.statusCode = 202;
		res.end();
	}

	async handleInitializationError(req, res): Promise<void> {
		const statusCode = 200;
		this.initDeferred.resolve({
			StatusCode: statusCode,
			FunctionError: 'Unhandled',
			ExecutedVersion: '$LATEST',
			Payload: await text(req)
		});
		res.statusCode = 202;
		res.end();
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

	close(callback?: Function): this {
		if (this.resultDeferred) {
			const statusCode = 200;
			this.resultDeferred.resolve({
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
