import { exec } from "tinyexec";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generatePythonTarballUrl, installPython } from "../src/install-python";

it('install_python_tarball_url', () => {
    expect(generatePythonTarballUrl('2.7.12', 'darwin', 'x64')).toBe(
        'https://python-binaries.zeit.sh/python-2.7.12-darwin-x64.tar.gz'
    );
});

it('install_python', async () => {
    const version = '3.6.8';
    const dest = join(
        tmpdir(),
        `install-python-${Math.random()
            .toString(16)
            .substring(2)}`
    );
    await mkdir(dest, { recursive: true });
    try {
        await installPython(dest, version);
        const res = await exec(join(dest, 'bin/python'), [
            '-c',
            'import platform; print(platform.python_version())'
        ]);
        expect(res.stdout.trim()).toBe(version);
    } finally {
        // Clean up
        // await remove(dest);
    }
});