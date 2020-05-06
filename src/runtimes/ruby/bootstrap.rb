#!/usr/bin/env ruby

require 'net/http'
require 'json'

class LambdaLogger
	class << self
	  def log_error(exception:, message: nil)
		STDERR.puts message if message
		STDERR.puts JSON.pretty_unparse(exception.to_lambda_response)
	  end
	end
  end

class LambdaHandler
	attr_reader :handler_file_name, :handler_method_name

	def initialize(env_handler:)
	  handler_split = env_handler.split('.')
	  if handler_split.size == 2
		@handler_file_name, @handler_method_name = handler_split
	  elsif handler_split.size == 3
		@handler_file_name, @handler_class, @handler_method_name = handler_split
	  else
		raise ArgumentError.new("Invalid handler #{handler_split}, must be of form FILENAME.METHOD or FILENAME.CLASS.METHOD where FILENAME corresponds with an existing Ruby source file FILENAME.rb, CLASS is an optional module/class namespace and METHOD is a callable method. If using CLASS, METHOD must be a class-level method.")
	  end
	end

	def call_handler(request:, context:)
	  begin
		opts = {
		  event: request,
		  context: context
		}
		if @handler_class
		  response = Kernel.const_get(@handler_class).send(@handler_method_name, opts)
		else
		  response = __send__(@handler_method_name, opts)
		end
		# serialization can be a part of user code
		AwsLambda::Marshaller.marshall_response(response)
	  rescue NoMethodError => e
		# This is a special case of standard error that we want to hard-fail for
		raise LambdaErrors::LambdaHandlerCriticalException.new(e)
	  rescue NameError => e
		# This is a special case error that we want to wrap
		raise LambdaErrors::LambdaHandlerCriticalException.new(e)
	  rescue StandardError => e
		raise LambdaErrors::LambdaHandlerError.new(e)
	  rescue Exception => e
		raise LambdaErrors::LambdaHandlerCriticalException.new(e)
	  end
	end
  end

class LambdaServer
  LONG_TIMEOUT = 1_000_000

  def initialize
    @server_address = ENV['AWS_LAMBDA_RUNTIME_API']
  end

  def next_invocation
    next_invocation_uri = URI("http://#{@server_address}/2018-06-01/runtime/invocation/next")
    begin
      http = Net::HTTP.new(next_invocation_uri.host, next_invocation_uri.port)
      http.read_timeout = LONG_TIMEOUT
      resp = http.start do |http|
        http.get(next_invocation_uri.path)
      end
      if resp.is_a?(Net::HTTPSuccess)
        request_id = resp["Lambda-Runtime-Aws-Request-Id"]
        [request_id, resp]
      else
        raise LambdaErrors::InvocationError.new(
          "Received #{resp.code} when waiting for next invocation."
        )
      end
    rescue LambdaErrors::InvocationError => e
      raise e
    rescue StandardError => e
      raise LambdaErrors::InvocationError.new(e)
    end
  end

  def send_response(request_id:, response_object:, content_type: 'application/json')
    response_uri = URI("http://#{@server_address}/2018-06-01/runtime/invocation/#{request_id}/response")
    begin
      # unpack IO at this point
      if content_type == 'application/unknown'
        response_object = response_object.read
      end
      Net::HTTP.post(
        response_uri,
        response_object,
        {'Content-Type' => content_type}
      )
    rescue StandardError => e
      raise LambdaErrors::LambdaRuntimeError.new(e)
    end
  end

  def send_error_response(request_id:, error_object:, error:)
    response_uri = URI(
      @server_address + "/runtime/invocation/#{request_id}/error"
    )
    begin
      Net::HTTP.post(
        response_uri,
        error_object.to_json,
        { 'Lambda-Runtime-Function-Error-Type' => error.runtime_error_type }
      )
    rescue StandardError => e
      raise LambdaErrors::LambdaRuntimeError.new(e)
    end
  end

  def send_init_error(error_object:, error:)
    uri = URI(
      @server_address + "/runtime/init/error"
    )
    begin
      Net::HTTP.post(
        uri,
        error_object.to_json,
        {'Lambda-Runtime-Function-Error-Type' => error.runtime_error_type}
      )
    rescue StandardError
      raise LambdaErrors::LambdaRuntimeInitError.new(e)
    end
  end
end

module LambdaErrors

	class LambdaErrors::InvocationError < StandardError; end

	class LambdaError < StandardError
	  def initialize(original_error, classification = "Function")
		@error_class = original_error.class.to_s
		@error_type = "#{classification}<#{original_error.class}>"
		@error_message = original_error.message
		@stack_trace = _sanitize_stacktrace(original_error.backtrace)
		super(original_error)
	  end

	  def runtime_error_type
		if _allowed_error?
		  @error_type
		else
		  "Function<UserException>"
		end
	  end

	  def to_lambda_response
		{
		  "errorMessage" => @error_message,
		  "errorType" => @error_type,
		  "stackTrace" => @stack_trace
		}
	  end

	  private
	  def _sanitize_stacktrace(stacktrace)
		ret = []
		safe_trace = true
		stacktrace.first(100).each do |line|
		  if safe_trace
			if line.match(/^\/var\/runtime\/lib/)
			  safe_trace = false
			else
			  ret << line
			end
		  end # else skip
		end
		ret
	  end

	  def _allowed_error?
		#_aws_sdk_pattern? || _standard_error?
		_standard_error?
	  end

	  # Currently unused, may be activated later.
	  def _aws_sdk_pattern?
		@error_class.match(/Aws(::\w+)*::Errors/)
	  end

	  def _standard_error?
		[
		  "ArgumentError", "NoMethodError", "Exception", "StandardError",
		  "NameError", "LoadError", "SystemExit", "SystemStackError"
		].include?(@error_class)
	  end
	end

	class LambdaHandlerError < LambdaError; end

	class LambdaHandlerCriticalException < LambdaError; end

	class LambdaRuntimeError < LambdaError
	  def initialize(original_error)
		super(original_error, "Runtime")
	  end
	end

	class LambdaRuntimeInitError < LambdaError
	  def initialize(original_error)
		super(original_error, "Init")
	  end
	end

  end

class LambdaContext
	attr_reader :aws_request_id, :invoked_function_arn, :log_group_name,
	  :log_stream_name, :function_name, :memory_limit_in_mb, :function_version,
	  :identity, :client_context, :deadline_ms

	def initialize(request)
	  @clock_diff = Process.clock_gettime(Process::CLOCK_REALTIME, :millisecond) - Process.clock_gettime(Process::CLOCK_MONOTONIC, :millisecond)
	  @deadline_ms = request['Lambda-Runtime-Deadline-Ms'].to_i
	  @aws_request_id = request['Lambda-Runtime-Aws-Request-Id']
	  @invoked_function_arn = request['Lambda-Runtime-Invoked-Function-Arn']
	  @log_group_name = ENV['AWS_LAMBDA_LOG_GROUP_NAME']
	  @log_stream_name = ENV['AWS_LAMBDA_LOG_STREAM_NAME']
	  @function_name = ENV["AWS_LAMBDA_FUNCTION_NAME"]
	  @memory_limit_in_mb = ENV['AWS_LAMBDA_FUNCTION_MEMORY_SIZE']
	  @function_version = ENV['AWS_LAMBDA_FUNCTION_VERSION']
	  if request['Lambda-Runtime-Cognito-Identity']
		@identity = JSON.parse(request['Lambda-Runtime-Cognito-Identity'])
	  end
	  if request['Lambda-Runtime-Client-Context']
		@client_context = JSON.parse(request['Lambda-Runtime-Client-Context'])
	  end
	end

	def get_remaining_time_in_millis
	  now = Process.clock_gettime(Process::CLOCK_MONOTONIC, :millisecond) + @clock_diff
	  remaining = @deadline_ms - now
	  remaining > 0 ? remaining : 0
	end
  end

module AwsLambda
	class Marshaller
	  class << self

		# By default, JSON-parses the raw request body. This can be overwritten
		# by users who know what they are doing.
		def marshall_request(raw_request)
		  content_type = raw_request['Content-Type']
		  if content_type == 'application/json'
			JSON.parse(raw_request.body)
		  else
			raw_request.body # return it unaltered
		  end
		end

		# By default, just runs #to_json on the method's response value.
		# This can be overwritten by users who know what they are doing.
		# The response is an array of response, content-type.
		# If returned without a content-type, it is assumed to be application/json
		# Finally, StringIO/IO is used to signal a response that shouldn't be
		# formatted as JSON, and should get a different content-type header.
		def marshall_response(method_response)
		  case method_response
		  when StringIO, IO
			[method_response, 'application/unknown']
		  else
			method_response.to_json # application/json is assumed
		  end
		end

	  end
	end
  end

@env_handler = ENV["_HANDLER"]
@lambda_server = LambdaServer.new
STDOUT.sync = true # Ensures that logs are flushed promptly.
runtime_loop_active = true # if false, we will exit the program
exit_code = 0

begin
  @lambda_handler = LambdaHandler.new(env_handler: @env_handler)
  require "#{ENV["LAMBDA_TASK_ROOT"]}/#{@lambda_handler.handler_file_name}"
rescue Exception => e # which includes LoadError or any exception within static user code
  runtime_loop_active = false
  exit_code = -4
  ex = LambdaErrors::LambdaRuntimeInitError.new(e)
  LambdaLogger.log_error(exception: ex, message: "Init error when loading handler #{@env_handler}")
  @lambda_server.send_init_error(error_object: ex.to_lambda_response, error: ex)
end

while runtime_loop_active
  begin
    request_id, raw_request = @lambda_server.next_invocation
    if trace_id = raw_request['Lambda-Runtime-Trace-Id']
      ENV["_X_AMZN_TRACE_ID"] = trace_id
    end
    request = AwsLambda::Marshaller.marshall_request(raw_request)
  rescue LambdaErrors::InvocationError => e
    runtime_loop_active = false # ends the loop
    raise e # ends the process
  end

  begin
    context = LambdaContext.new(raw_request) # pass in opts
    # start of user code
    handler_response, content_type = @lambda_handler.call_handler(
      request: request,
      context: context
    )
    # end of user code
    @lambda_server.send_response(
      request_id: request_id,
      response_object: handler_response,
      content_type: content_type
    )
  rescue LambdaErrors::LambdaHandlerError => e
    LambdaLogger.log_error(exception: e, message: "Error raised from handler method")
    @lambda_server.send_error_response(
      request_id: request_id,
      error_object: e.to_lambda_response,
      error: e
    )
  rescue LambdaErrors::LambdaHandlerCriticalException => e
    LambdaLogger.log_error(exception: e, message: "Critical exception from handler")
    @lambda_server.send_error_response(
      request_id: request_id,
      error_object: e.to_lambda_response,
      error: e
    )
    runtime_loop_active = false
    exit_code = -1
  rescue LambdaErrors::LambdaRuntimeError => e
    @lambda_server.send_error_response(
      request_id: request_id,
      error_object: e.to_lambda_response,
      error: e
    )
    runtime_loop_active = false
    exit_code = -2
  end
end
exit(exit_code)
