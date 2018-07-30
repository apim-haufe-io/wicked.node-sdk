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
tsc
packageFile=$(npm pack)
echo "INFO: Package file: ${packageFile}"

pushd .. > /dev/null

baseDir=$(pwd)

# Leaving out: wicked.portal-kong-oauth2 - that repository
# will be rationalized away, it's getting too complicated
for dir in wicked.portal \
    wicked.portal-mailer \
    wicked.portal-chatbot \
    wicked.portal-auth \
    wicked.portal-kong-adapter \
    wicked.portal-test/portal-auth; do

    echo "INFO: Installing node-sdk into $dir"

    pushd $dir > /dev/null
    cp -f ${baseDir}/wicked.node-sdk/${packageFile} ./wicked-sdk.tgz
    if [ "$1" = "--copy" ]; then
        echo "INFO: Just copying node-sdk, npm install has to be run later."
    else
        npm install wicked-sdk.tgz >> ${baseDir}/wicked.node-sdk/install-local-sdk.log 2>&1
    fi
    popd > /dev/null
done
# Make sure the package is in the portal-env directory as well, as it's
# needed when building the docker image.
echo "INFO: Copying ${packageFile} to wicked.portal-env"
cp -f ./wicked.node-sdk/${packageFile} ./wicked.portal-env/wicked-sdk.tgz

popd > /dev/null # ..
popd > /dev/null # currentDir

echo "==== SUCCESS ==== $0"
