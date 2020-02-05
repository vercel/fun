export function getOutputFile() {
	const ext = process.platform === 'win32' ? '.exe' : '';
	return `bootstrap${ext}`;
}
