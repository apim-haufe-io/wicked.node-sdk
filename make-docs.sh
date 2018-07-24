#!/bin/bash

set -e

if ! npm list --depth 1 --global typedoc > /dev/null 2>&1; then
    echo "INFO: typedoc is not installed, installing globally."
    npm install -g typedoc
else
    echo "INFO: typedoc is already installed. Excellent."
fi

rm -rf docs/*
typedoc --mode modules --out ./docs ./src
