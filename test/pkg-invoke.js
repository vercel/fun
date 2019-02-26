const { join } = require('path');
const { readFileSync } = require('fs');
const { createFunction } = require('../');

async function main() {
	const fn = await createFunction({
		Code: {
			// `ZipFile` works, or an already unzipped directory may be specified
			//ZipFile: process.env.HOME + '/lambda.zip'
			Directory: join(process.cwd(), '/functions/go-echo')
		},
		Handler: 'handler',
		Runtime: 'go1.x'
	});

	const res = await fn({ hello: 'world' });

	console.log(res);
	// Prints: { hello: 'world' }

	await fn.destroy();
}

main().catch(err => {
	console.error(err);
	process.exit(1);
});
