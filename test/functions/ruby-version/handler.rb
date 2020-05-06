def handler(event:, context:)
  return {
    statusCode: 200,
    body: RUBY_VERSION
  }
end