#!/bin/bash

set -e

if [ -z "$1" ]; then
    echo "Usage: $0 <version>"
    exit 1
fi

npm install
npm pack

pushd ..

for dir in wicked.portal \
    wicked.portal-mailer \
    wicked.portal-chatbot \
    wicked.portal-kong-adapter; do

    echo "INFO: Installing node-sdk into $dir"

    pushd $dir
    npm install ../wicked.node-sdk/wicked-sdk-$1.tgz
    popd
done

popd
