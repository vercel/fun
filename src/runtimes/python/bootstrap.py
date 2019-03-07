# Parts of this runtime based off of:
# https://gist.github.com/avoidik/78ddc7854c7b88607f7cf56db3e591e5

import os
import sys
import importlib

def lambda_runtime_main():
    sys.path.insert(0, os.environ['LAMBDA_TASK_ROOT'])
    handler = importlib.import_module('handler')
    fn = getattr(handler, 'handler')
    print(fn(None, None))

if __name__ == '__main__':
  lambda_runtime_main()
