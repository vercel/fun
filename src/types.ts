export interface LambdaParams {
	FunctionName?: string;
	Code: { ZipFile?: Buffer | string; Directory?: string };
	Handler: string;
	Runtime: string; // nodejs | nodejs4.3 | nodejs6.10 | nodejs8.10 | nodejs10.x | nodejs12.x | java8 | python2.7 | python3.6 | python3.7 | dotnetcore1.0 | dotnetcore2.0 | dotnetcore2.1 | nodejs4.3-edge | go1.x | ruby2.5 | provided
	Provider?: string; // native | docker
	Environment?: { Variables: object };
	MemorySize?: number; // The amount of memory that your function has access to. Increasing the function's memory also increases it's CPU allocation. The default value is 128 MB. The value must be a multiple of 64 MB.
	Region?: string; // AWS Region name (used for generating the fake ARN, etc.)
	AccessKeyId?: string; // AWS_ACCESS_KEY_ID environment variable (used by AWS SDK for authentication)
	SecretAccessKey?: string; // AWS_SECRET_ACCESS_KEY environment variable (used by AWS SDK for authentication)
	Timeout?: number; // The amount of time that Lambda allows a function to run before terminating it. The default is 3 seconds. The maximum allowed value is 900 seconds.
}

export type InvokePayload = Buffer | Blob | string;

// https://docs.aws.amazon.com/lambda/latest/dg/API_Invoke.html#API_Invoke_RequestSyntax
export interface InvokeParams {
	InvocationType: 'RequestResponse' | 'Event' | 'DryRun';
	Payload?: InvokePayload;
}

// https://docs.aws.amazon.com/lambda/latest/dg/API_Invoke.html#API_Invoke_ResponseSyntax
export interface InvokeResult {
	StatusCode: number;
	FunctionError?: 'Handled' | 'Unhandled';
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
