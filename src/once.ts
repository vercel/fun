import { EventEmitter } from 'events';

export function once<T>(emitter: EventEmitter, name: string): Promise<T> {
	return new Promise((resolve, reject) => {
		function cleanup() {}
		function onEvent(arg: T) {
			cleanup();
			resolve(arg);
		}
		function onError(err: Error) {
			cleanup();
			reject(err);
		}
		emitter.on(name, onEvent);
		emitter.on('error', onError);
	});
}
