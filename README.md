# wicked.haufe.io SDK

This node.js module is the SDK for building plugins and additions to the wicked.haufe.io API Management system.

You can find more information on wicked.haufe.io here:

* [Official Website wicked.haufe.io](http://wicked.haufe.io)
* [wicked.haufe.io Github repository](https://github.com/Haufe-Lexware/wicked.haufe.io)

This package is the base for the following wicked modules:

* Kong Adapter
* Mailer
* Chatbot

It may be used for e.g. implementing Authorization Servers in node.js (upcoming: Stub implementation of a Google/Github Authorization Server).

# Usage

To install the SDK into your node.js application, run

```bash
$ npm install wicked-sdk --save --save-exact
```

The SDK will be kept downwards-compatible for as long as possible; it will be tried hard to make earlier versions of the SDK compatible with a later release of wicked.haufe.io, so using the `--save-exact` is a safe bet.

```javascript
var wicked = require('wicked-sdk');

wicked.initialize(function (err) {
    if (err)
        throw err;
    // We're done, the wicked API is reachable.

    const apiUrl = wicked.getApiUrl();
    // ...
});
```

## Interface description

### `wicked.initialize([awaitOptions], callback)`

Waits for the wicked API to be available and returns a `null` error if successful, otherwise an error message. If you want to change the way the SDK waits for the Portal API, you may supply `awaitOptions` (see definition of `awaitUrl` below for a full description).

The `initialize()` call will look for the Portal API URL in the following way:

* If the environment variable `PORTAL_API_URL` is set, this will be used
* Otherwise, if the environment is Linux (where it assumes it runs in `docker`), it will default to `http://portal-api:3001`
* Otherwise, if the environment is Windows or Mac, it will assume a local development environment, and use `http://localhost:3001` 

After initialization, you have the following functions you may call:

### `wicked.awaitUrl(url, [options,] callback)`

Tries to reach the URL in `url` for a certain amount of times. If successful, it will return without an error, otherwise the callback will contain an error.

Options (optional):

```javascript
const awaitOptions = {
    statusCode: 200,
    maxTries: 100,
    retryDelay: 1000
}
```

* `statusCode`: The status code to wait for, defaults to `200` (OK)
* `maxTries`: The maximum number of tries to call the URL, defaults to `100`
* `retryDelay`: The delay between unsuccesful retries, in milliseconds. Defaults to `1000` (1 second)

**Example**:

```javascript
wicked.awaitUrl(wicked.getInternalKongAdapterUrl() + '/ping', null, function (err) {
    if (err) {
        // Do some error handling
    }
    // Now we can speak to the Kong Adapter
});
```

### `wicked.getGlobals()`

Returns the content of the `globals.json` you deployed with your Portal API instance (in your configuration).

**Note**: Will throw an exception if `initialize()` has not yet successfully finished.

### `wicked.getExternalPortalUrl()`

Returns the URL of the portal, the way it is reachable from the outside, e.g. usually from the public internet. This is a convenience method which uses information from the `globals.json` configuration to assemble the URL.

**Note**: Will throw an exception if `initialize()` has not yet successfully finished.

### `wicked.getExternalGatewayUrl()`

Returns the URL of the API Gateway, the way it is reachable from the outside, e.g. usually from the public internet. This is a convenience method which uses information from the `globals.json` configuration to assemble the URL.  

**Note**: Will throw an exception if `initialize()` has not yet successfully finished.

### `wicked.getInternalApiUrl()`

Returns a fully qualified URL to the portal API, as seen from inside the docker environment, usually this will be `http://portal:3001`. This is **not** an URL you can use from the outside, it's only intended for use within the same docker network as the Portal API.

**Note**: Will throw an exception if `initialize()` has not yet successfully finished.

### `wicked.getInternalKongAdminUrl()`

Returns a fully qualified URL to the Kong Adapter API; same restrictions as above apply. Usually this is `http://portal-kong-adapter:3002`.

**Note**: Will throw an exception if `initialize()` has not yet successfully finished.

### `wicked.getInternalKongAdapterUrl()`

Returns a fully qualified URL to the Kong Admin API, reachable **only** from within the docker network. Usually this is `http://kong:8001`.

**Note**: Will throw an exception if `initialize()` has not yet successfully finished.
