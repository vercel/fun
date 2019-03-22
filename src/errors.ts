/**
 * Subclassing `Error` in TypeScript:
 * https://stackoverflow.com/a/41102306/376773
 */

interface LambdaErrorPayload {
	errorMessage?: string;
	errorType?: string;
	stackTrace?: string | string[];
}

export class LambdaError extends Error {
	constructor(data: LambdaErrorPayload = {}) {
		super(data.errorMessage || 'Unspecified runtime initialization error');
		Object.setPrototypeOf(this, new.target.prototype);

		Object.defineProperty(this, 'name', {
			value: data.errorType || this.constructor.name
		});

		if (Array.isArray(data.stackTrace)) {
			this.stack = [
				`${this.name}: ${this.message}`,
				...data.stackTrace
			].join('\n');
		} else if (typeof data.stackTrace === 'string') {
			this.stack = data.stackTrace;
		}
	}
}
