#!/bin/bash
set -euo pipefail
mkdir -p "$2/$(dirname "$1")"
cp -a "$1" "$2/$1"
