import sys
import traceback

try:
    someFunction()
except:
    ex = sys.exc_info()[1]
    print(ex.__class__.__name__)
    #print '\n'.join(traceback.format_exc().split('\n')[:-2])
    #print traceback.format_stack()[0]
    #template = "An exception of type {0} occurred. Arguments:\n{1!r}"
    #message = template.format(type(ex).__name__, ex.args)
    #print message
