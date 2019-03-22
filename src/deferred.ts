export interface Deferred<T> {
	promise: Promise<T>;
	resolve: (value?: T | PromiseLike<T>) => void;
	reject: (reason?: any) => void;
}

export function createDeferred<T>(): Deferred<T> {
	let r;
	let j;
	const promise = new Promise<T>(
		(
			resolve: (value?: T | PromiseLike<T>) => void,
			reject: (reason?: any) => void
		): void => {
			r = resolve;
			j = reject;
		}
	);
	return { promise, resolve: r, reject: j };
}
