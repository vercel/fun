#!/bin/bash
set -euo pipefail

cd /binaries
tarball="python-${PYTHON_VERSION}-linux-x64.tar"
tar cvf "$tarball" "python-${PYTHON_VERSION}"

echo Gzipping "$tarball"
gzip -9 "$tarball"

mv -v "$tarball.gz" /python-binaries
