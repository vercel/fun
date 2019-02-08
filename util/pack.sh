#!/bin/bash
set -euo pipefail

# This is only for now-cli `now dev` progress while the `@zeit/fun`
# package remains private for now.

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR/.."
mv README.md .readme.tmp
npm pack
mv .readme.tmp README.md
