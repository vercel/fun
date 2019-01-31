package main

import (
	"github.com/aws/aws-lambda-go/lambda"
)

func HandleEvent(v interface{}) (interface{}, error) {
	return v, nil
}

func main() {
	lambda.Start(HandleEvent)
}
