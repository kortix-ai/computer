#!/usr/bin/env python3
import os
import sys
import json

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Key argument required"}))
        sys.exit(1)
    
    key = sys.argv[1]
    value = os.environ.get(key)
    found = key in os.environ
    
    result = {
        "language": "python",
        "key": key,
        "value": value,
        "found": found
    }
    
    print(json.dumps(result))

if __name__ == "__main__":
    main()