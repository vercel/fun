import createDebug from 'debug';
import execa from 'execa';
const debug = createDebug('@zeit/fun:install-ruby');

export async function installRVM(version: string, dest: string): Promise<void> {
	try {
		debug('Checking for RVM');
		await execa(`${dest}/bin/rvm`);
		debug('RVM present');

		const versionsString = (await execa.command(
			`${dest}/bin/rvm list strings`
		)).stdout;

		if (!versionsString.includes(version)) {
			debug(`Installing ruby version ${version}`);
			await execa.command(`${dest}/bin/rvm install ${version}`);
		}
	} catch (error) {
		debug(error);

		debug(`Installing RVM with ruby version ${version}`);
		await execa.command(
			`curl -sSL https://get.rvm.io | bash -s -- --path ${dest}/rvm_cache --ruby=${version}`,
			{ shell: true, stdio: 'inherit' }
		);
	}

	return;
}

export async function copyInstalledRuby(
	version: string,
	dest: string
): Promise<void> {
	debug('Copying ruby version to cachedir/ruby_bin');
	await execa.command(
		`cp -r ${dest}/rvm_cache/rubies/ruby-${version} ${dest}/ruby-${version}`
	);
	return;
}

export async function installRuby(
	dest: string,
	version: string
): Promise<void> {
	return new Promise(async (resolve, reject) => {
		try {
			await installRVM(version, dest);
			await copyInstalledRuby(version, dest);
			resolve();
		} catch (error) {
			debug(error);
			reject();
		}
	});
}
