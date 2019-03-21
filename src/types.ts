import { ChildProcess } from 'child_process';

export type InvokePayload = Buffer | Blob | string;

export interface LambdaParams {
	FunctionName?: string;
	Code: { ZipFile?: Buffer | string; Directory?: string };
	Handler: string;
	Runtime: string; // nodejs | nodejs4.3 | nodejs6.10 | nodejs8.10 | java8 | python2.7 | python3.6 | python3.7 | dotnetcore1.0 | dotnetcore2.0 | dotnetcore2.1 | nodejs4.3-edge | go1.x | ruby2.5 | provided
	Provider?: string; // native | docker
	Environment?: { Variables: object };
	MemorySize?: number; // The amount of memory that your function has access to. Increasing the function's memory also increases it's CPU allocation. The default value is 128 MB. The value must be a multiple of 64 MB.
	Region?: string; // AWS Region name (used for generating the fake ARN, etc.)
	Timeout?: number; // The amount of time that Lambda allows a function to run before terminating it. The default is 3 seconds. The maximum allowed value is 900 seconds.
}

export interface InvokeParams {
	InvocationType?: string;
	Payload?: InvokePayload;
}

export interface InvokeResult {
	StatusCode: number;
	FunctionError?: string;
	LogResult?: string;
	Payload: InvokePayload;
	ExecutedVersion?: string;
}

export interface Provider {
	invoke(params: InvokeParams): Promise<InvokeResult>;
	destroy(): Promise<void>;
}

export interface Runtime {
	name: string;
	runtimeDir: string;
	cacheDir?: string;
	init?(runtime: Runtime): Promise<void>;
}

export interface Lambda {
	<T>(payload?: string | object): Promise<T>;
	invoke(params: InvokeParams): Promise<InvokeResult>;
	destroy(): Promise<void>;
	params: LambdaParams;
	runtime: Runtime;
	provider: Provider;
	functionName: string;
	memorySize: number;
	version: string;
	region: string;
	arn: string;
	timeout: number;
	extractedDir?: string;
}
