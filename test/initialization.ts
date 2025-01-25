import { stat } from "node:fs/promises";
import { join } from "node:path";
import { initializeRuntime } from "../src";

const isWin = process.platform === 'win32';

it('initialize_runtime_with_string', async () => {
    const runtime = await initializeRuntime('nodejs8.10');
    assert.equal(typeof runtime.cacheDir, 'string');
    const nodeName = isWin ? 'node.exe' : 'node';
    const nodeStat = await stat(join(runtime.cacheDir, 'bin', nodeName));
    assert(nodeStat.isFile());
});

it('initialize_runtime_with_invalid_name', async () => {
    let err: Error;
    try {
        await initializeRuntime('node8.10');
    } catch (_err) {
        err = _err;
    }
    assert(err);
    assert.equal('Could not find runtime with name "node8.10"', err.message);
});