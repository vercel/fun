#!/bin/bash
set -euo pipefail
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
DIST=dist

# Clean up previous build
rm -rf "$DIST"

echo '* Compiling TypeScript files to `.js`' >&2
tsc

echo '* Copying non-TypeScript files into the `dist` dir' >&2
find src test -type f ! -iname '*.ts' -exec "$DIR/cp.sh" {} dist \;
