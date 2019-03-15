const { join } = require('path');
const { readFileSync } = require('fs');
const { createFunction } = require('../');

async function main() {
	let fn;
	try {
		fn = await createFunction({
			Code: {
				Directory: join(process.cwd(), '/functions/go-echo')
			},
			Handler: 'handler',
			Runtime: 'go1.x'
		});
		const res = await fn({ hello: 'world' });
		console.log(JSON.stringify(res));
	} finally {
		if (fn) {
			await fn.destroy();
		}
	}
}

main().catch(err => {
	console.error(err);
	process.exit(1);
});
