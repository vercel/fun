require 'json'

def handler(event:, context:)
  return {
    statusCode: 200,
    body: JSON.generate({hello_text: "Hello from ruby"})
  }
end