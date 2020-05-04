import createDebug from 'debug';
import execa from 'execa';

const debug = createDebug('@zeit/fun:install-ruby');

export async function installRVM(version: string): Promise<any> {
	try {
		await execa('rvm');
		debug('RVM present');
	} catch (error) {
		debug(error);
		debug('Installing RVM');
		execa.command('curl -sSL https://get.rvm.io | bash -s stable');
	}

	const versionsString = (await execa.command('rvm list strings')).stdout;
	if (!versionsString.includes(version)) {
		debug(`Installing ruby version ${version}`);
		await execa.command(`rvm install ${version}`);
	}

	return;
}

export async function copyInstalledRuby(
	version: string,
	dest: string
): Promise<any> {
	debug('Copying ruby version to cachedir');
	await execa.command(
		`cp -r ${process.env['HOME']}/.rvm/rubies/ruby-${version}/bin ${dest}`
	);
	return;
}

export async function installRuby(
	dest: string,
	version: string
): Promise<void> {
	return new Promise(async (resolve, reject) => {
		debug('Checking for RVM');
		try {
			await installRVM(version);
			await copyInstalledRuby(version, dest);
			resolve();
		} catch (error) {
			debug(error);
			reject();
		}
	});
}
