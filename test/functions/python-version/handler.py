import sys
import platform

def handler(event, context):
    return {
        'sys.version': sys.version,
        'platform.python_version': platform.python_version()
    }
