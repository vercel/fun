import * as uuid from 'uuid/v4';
import { parse } from 'url';
import { Server } from 'http';
import createDebug from 'debug';
import { run, json, text } from 'micro';
import * as createPathMatch from 'path-match';
import { Lambda, InvokeParams, InvokeResult } from './types';

const pathMatch = createPathMatch();
const match = pathMatch('/:version/runtime/:subject/:target/:action?');
const debug = createDebug('@zeit/lambda-dev:runtime-server');

function send404(res) {
	res.statusCode = 404;
	res.end();
}

interface DeferredPromise<T> extends Promise<T> {
	resolve: (value?: T | PromiseLike<T>) => void;
	reject: (reason?: any) => void;
}

function createDeferred<T>(): DeferredPromise<T> {
	let r;
	let j;
	const p = new Promise(
		(
			resolve: (value?: T | PromiseLike<T>) => void,
			reject: (reason?: any) => void
		): void => {
			r = resolve;
			j = reject;
		}
	) as DeferredPromise<T>;
	p.resolve = r;
	p.reject = j;
	return p;
}

export class RuntimeServer extends Server {
	public version: string;
	public initPromise: DeferredPromise<void>;
	private nextPromise: DeferredPromise<void>;
	private invokePromise: DeferredPromise<InvokeParams>;
	private resultPromise: DeferredPromise<InvokeResult>;
	private lambda: Lambda;

	constructor(fn: Lambda) {
		super();
		this.version = '2018-06-01';

		const serve = this.serve.bind(this);
		this.on('request', (req, res) => run(req, res, serve));

		this.lambda = fn;
		this.initPromise = createDeferred<void>();
		this.resetInvocationState();
	}

	resetInvocationState() {
		this.nextPromise = createDeferred<void>();
		this.invokePromise = null;
		this.resultPromise = null;
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
		if (this.initPromise) {
			debug('Runtime successfully initialized');
			this.initPromise.resolve();
			this.initPromise = null;
		}

		this.invokePromise = createDeferred<InvokeParams>();
		this.resultPromise = createDeferred<InvokeResult>();
		this.nextPromise.resolve();
		this.nextPromise = null;

		debug('Waiting for the `invoke()` function to be called');
		req.setTimeout(0); // disable default 2 minute socket timeout
		const params = await this.invokePromise;
		//console.error({ params });
		const requestId = uuid();

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
		this.resultPromise.resolve({
			StatusCode: statusCode,
			ExecutedVersion: '$LATEST',
			Payload: await text(req)
		});
		this.resetInvocationState();
		res.statusCode = 202;
		res.end();
	}

	async handleInvocationError(req, res, requestId: string): Promise<void> {
		const body = await json(req);
		console.error('invoke error', { err: body });
		const err = new Error('failed');
		this.resultPromise.reject(err);
		this.resetInvocationState();
		res.statusCode = 202;
		res.end();
	}

	async handleInitializationError(req, res): Promise<void> {
		const body = await json(req);
		console.error('init error', { body });
		const err = new Error('init failed');
		this.initPromise.reject(err);

		res.statusCode = 202;
		res.end();
	}

	async invoke(params: InvokeParams = {}): Promise<InvokeResult> {
		if (this.nextPromise) {
			debug('Waiting for `next` invocation request from runtime');
			await this.nextPromise;
		}
		if (!params.Payload) {
			params.Payload = '{}';
		}
		this.invokePromise.resolve(params);
		const result = await this.resultPromise;
		return result;
	}
}
