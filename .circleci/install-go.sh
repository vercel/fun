#!/bin/bash
set -euo pipefail
if [ "$(uname)" = "Darwin" ]; then
	platform=darwin
else
	platform=linux
fi
curl -sfLS "https://dl.google.com/go/go1.12.$platform-amd64.tar.gz" | tar zxv --strip-components=1 -C /usr/local
