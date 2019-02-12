#!/bin/bash
set -euo pipefail
export GOPATH="$HOME/go"
go get github.com/aws/aws-lambda-go/lambda
go build -o test/functions/go-echo/handler test/functions/go-echo/handler.go
