#!/bin/bash

echo "==== STARTING ==== $0"

trap failure ERR

function failure {
    echo "=================="
    echo "====  ERROR   ==== $0"
    echo "=================="
}

set -e

# Check whether jq is installed (should be)
if ! which jq > /dev/null; then
    echo "ERROR: This script requires 'jq' to be installed."
    exit 1
fi

currentDir="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
pushd ${currentDir} > /dev/null

sdkVersion=$(cat package.json | jq '.version' | tr -d '"')
if [[ -z "${sdkVersion}" ]]; then
    echo "ERROR: Could not retrieve wicked SDK version from package.json"
    exit 1
fi
echo "INFO: wicked-sdk v${sdkVersion}"

rm -f install-local-sdk.log

npm install > /dev/null
packageFile=$(npm pack)
echo "INFO: Package file: ${packageFile}"

pushd .. > /dev/null

# Leaving out: wicked.portal-kong-oauth2 - that repository
# will be rationalized away, it's getting too complicated
for dir in wicked.portal \
    wicked.portal-mailer \
    wicked.portal-chatbot \
    wicked.portal-auth \
    wicked.portal-kong-adapter; do

    echo "INFO: Installing node-sdk into $dir"

    pushd $dir > /dev/null
    npm install ../wicked.node-sdk/${packageFile} >> ../wicked.node-sdk/install-local-sdk.log 2>&1
    popd > /dev/null
done

popd > /dev/null # ..
popd > /dev/null # currentDir

echo "==== SUCCESS ==== $0"
