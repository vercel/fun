require 'json'

def handler(event:, context:):
    return {
		statusCode: 200,
        body: JSON.generate('Hello from ruby')
    }
