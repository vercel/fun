#!/bin/bash
set -euo pipefail

for version in 2.7.12 3.6.8 3.7.2; do
	echo "Building Python $version"

	# Build for Linux x64
	docker build \
		--tag python-linux-${version} \
		--build-arg PYTHON_VERSION=${version} \
		.

	docker run \
		--rm \
		--volume "$PWD/python-binaries:/python-binaries" \
		"python-linux-${version}"
done
