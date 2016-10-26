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

### Initialization Functionality

#### `wicked.initialize([awaitOptions,] callback)`

Waits for the wicked API to be available and returns a `null` error if successful, otherwise an error message. If you want to change the way the SDK waits for the Portal API, you may supply `awaitOptions` (see definition of `awaitUrl` below for a full description).

The `initialize()` call will look for the Portal API URL in the following way:

* If the environment variable `PORTAL_API_URL` is set, this will be used
* Otherwise, if the environment is Linux (where it assumes it runs in `docker`), it will default to `http://portal-api:3001`
* Otherwise, if the environment is Windows or Mac, it will assume a local development environment, and use `http://localhost:3001` 

After initialization, you have the following functions you may call:

#### `wicked.awaitUrl(url, [options,] callback)`

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
wicked.awaitUrl(wicked.getInternalKongAdapterUrl() + 'ping', null, function (err) {
    if (err) {
        // Do some error handling
    }
    // Now we can speak to the Kong Adapter
});
```

#### `wicked.awaitKongAdapter([awaitOptions,] callback)`

Makes sure the Kong Adapter is up and running. In case you are implementing an Authorization Server, you will need the Kong Adapter to authorize users with Kong, so at startup you should make sure it is up and running.

**Example**:

```javascript
var async = require('async');
var wicked = required('wicked-sdk');

async.series({
    initWicked: callback => wicked.initialize(callback),
    waitForAdapter: callback => wicked.awaitKongAdapter(callback)
}, function (err, results) {
    if (err)
        throw err; // Something went wrong
    
    // We're all set, the portal API and the Kong Adapter both are alive.
});
```

#### `wicked.initMachineUser(serviceId, callback)`

Creates a new machine user for a service, or retrieves its ID if already present in wicked's user database. Use this functionality to create a machine user for your service implementation; this user will belong to the `admin` group and has full rights in the Portal API.

The `serviceId` must only contain lowercase and uppercase charactera (case-sensitive), numbers, dashes and underscores (`^[a-zA-Z\-_0-9]+$`).

Will return an `application/json` response containing (at least) the following information:

```json
{
    "id": "ac283232789cdbcd2390f029",
    "customId": "internal:(your service id)",
    "firstName": "Machine-User",
    "lastName": "(your service id)",
    "validated": true
}
```

The `id` which is returned here has to be used in subsequent calls to the portal API to authorize the service to the portal API (in the `X-UserId` header).

### API Interaction

#### `wicked.apiGet(urlPath, [userId,] callback)`

Issues a `GET` to the Portal API end point specified in `urlPath`, using the user ID passed in as `userId`. If `userId` is left out, the call is done without authentication. Check the API Swagger definition for details. The result of the API call is returned as the second parameter of the `callback` (node standard).

The function will callback with an error if a hard error occurred, or the status code is not OK (larger than `299`). Details on the failure, in case it was an unexpected status code, can be found in `err.res` and `err.statusCode`, so that you may react e.g. to a `404`, which may be expected in certain cases. 

Use `initMachineUser` to initialize a suitable user ID to use with your service. If you have called `initMachineUser`, `apiGet` will automatically pick up the machine user ID. If you specify a different `userId`, that will be used.

**Example**:

```javascript
// It is assumed wicked.initialize() was successfully called
wicked.apiGet('plans', function (err, results) {
    if (err)
        return next(err); // or whatever suits your error handling
    console.log(results); // writes the plans.json
});
```

#### `wicked.apiPost(urlPath, postBody, [userId,] callback)`

Issues a `GET` to the Portal API end point specified in `urlPath`, using the user ID passed in as `userId`. If `userId` is left out, the call is done without authentication. Check the API Swagger definition for details. The result of the API call is returned as the second parameter of the `callback` (node standard).

The function will callback with an error if a hard error occurred, or if the status code is larger than `299`. If the function fails due to an unexpected status code, details can be found in `err.statusCode` and `err.res`.

Use `initMachineUser` to initialize a suitable user ID to use with your service. If you have called `initMachineUser`, `apiPost` will automatically pick up the machine user ID. If you specify a different `userId`, that will be used.

#### `wicked.apiPut(urlPath, putBody, [userId,] callback)`

Issues a `PUT` to the Portal API end point specified in `urlPath`, using the user ID passed in as `userId`. If `userId` is left out, the call is done without authentication. Check the API Swagger definition for details. The result of the API call is returned as the second parameter of the `callback` (node standard).

The function will callback with an error if a hard error occurred, or if the status code is larger than `299`. If the function fails due to an unexpected status code, details can be found in `err.statusCode` and `err.res`.

Use `initMachineUser` to initialize a suitable user ID to use with your service. If you have called `initMachineUser`, `apiPost` will automatically pick up the machine user ID. If you specify a different `userId`, that will be used.

#### `wicked.apiPatch(urlPath, patchBody, [userId,] callback)`

Issues a `PATCH` to the Portal API end point specified in `urlPath`, using the user ID passed in as `userId`. If `userId` is left out, the call is done without authentication. Check the API Swagger definition for details. The result of the API call is returned as the second parameter of the `callback` (node standard).

The function will callback with an error if a hard error occurred, or if the status code is larger than `299`. If the function fails due to an unexpected status code, details can be found in `err.statusCode` and `err.res`.

Use `initMachineUser` to initialize a suitable user ID to use with your service. If you have called `initMachineUser`, `apiPost` will automatically pick up the machine user ID. If you specify a different `userId`, that will be used.

#### `wicked.apiDelete(urlPath, [userId,] callback)`

Issues a `DELETE` to the Portal API end point specified in `urlPath`, using the user ID passed in as `userId`. If `userId` is left out, the call is done without authentication. Check the API Swagger definition for details. The result of the API call is returned as the second parameter of the `callback` (node standard).

The function will callback with an error if a hard error occurred, or if the status code is larger than `299`. If the function fails due to an unexpected status code, details can be found in `err.statusCode` and `err.res`.

Use `initMachineUser` to initialize a suitable user ID to use with your service. If you have called `initMachineUser`, `apiPost` will automatically pick up the machine user ID. If you specify a different `userId`, that will be used.

### OAuth2 Functionality

#### `wicked.getRedirectUriWithAccessToken(userInfo, callback)`

This is a convenience function which calls the `/oauth2/register` end point of the Kong Adapter, which registers an end user for use with an API which is configured to be accessed using the OAuth2 Implicit Grant Flow (authorization type `oauth2-implicit`).

If it succeeds, it will return an `application/json` type response containing a redirect URI for the registered application, giving the access token in the fragment of the redirect URI.

Main use case for this function is implementing Authorization Servers for use with wicked. The information you need to insert here must be retrieved from your own identity provider. The decision on whether you will allow user access to the API is also up to you (you are implementing the Authorization Server). After a positive decision, you use the function to register the user with the API Gateway.

**Example** (using `express`):

```javascript
app.get('/authorize', function (req, res, next) {
    // You would get this information from your own IdP
    const userInfo = {
        authenticated_userid: 'end-user-id',
        api_id: 'some-api',
        client_id: 'client-id-for-app-from-portal',
        scope: ['scope1', 'scope2']
    };
    wicked.getRedirectUriWithAccessToken(userInfo, function (err, result) {
        if (err) {
            // Handle the error in a suitable way, at least
            return next(err);
        }

        // result looks like this:
        // { redirect_uri: 'https://your.app.com#access_token=87289df7987890129080&expires_in=1800&token_type=bearer' }

        res.redirect(result.redirect_uri);
    });
});
```

For more and more detailed information, also regarding the meaning of the different properties of the `userInfo` object, see the wicked.haufe.io documentation, the section on Authorization Servers and the Kong Adapter. See also the [SAML SDK for wicked](https://www.npmjs.com/package/wicked-saml).

#### `wicked.getSubscriptionByClientId(clientId, apiId, callback)`

Convenience method which does the following:

* Lookup subscription information based on the `clientId` (which is attached to a subscription in the Portal)
* If found, check that the subscription is matching the API given in the `apiId`

If successful, it will return the following information in the second parameter of the `callback` function (`function (err, results)`):

* In `results.application`, you will find the information on the registered application
* In `results.subscription`, the data on the subscription (including API and Plan) will be returned

See the Swagger definition of the Portal API for more information. This method maps directly to `/subscriptions/:clientId`.

### Settings Retrieval

#### `wicked.getGlobals()`

Returns the content of the `globals.json` you deployed with your Portal API instance (in your configuration).

**Note**: Will throw an exception if `initialize()` has not yet successfully finished.

#### `wicked.getExternalPortalUrl()`

Returns the URL of the portal, the way it is reachable from the outside, e.g. usually from the public internet. This is a convenience method which uses information from the `globals.json` configuration to assemble the URL.

**Note**: Will throw an exception if `initialize()` has not yet successfully finished.

#### `wicked.getExternalGatewayUrl()`

Returns the URL of the API Gateway, the way it is reachable from the outside, e.g. usually from the public internet. This is a convenience method which uses information from the `globals.json` configuration to assemble the URL.

**Note**: Will throw an exception if `initialize()` has not yet successfully finished.

#### `wicked.getInternalApiUrl()`

Returns a fully qualified URL to the portal API, as seen from inside the docker environment, usually this will be `http://portal:3001`. This is **not** an URL you can use from the outside, it's only intended for use within the same docker network as the Portal API. This is the same URL which was used to successfully connect to the API in the `initialization()` call.

**Note**: Will throw an exception if `initialize()` has not yet successfully finished.

#### `wicked.getInternalKongAdapterUrl()`

Returns a fully qualified URL to the Kong Adapter API; same restrictions as above apply. Usually this is `http://portal-kong-adapter:3002`, but if you have overridden the setting in your environment, the content of the `globals.network.kongAdapterUrl` setting is returned (possibly depending on your running environment).

**Note**: Will throw an exception if `initialize()` has not yet successfully finished.

#### `wicked.getInternalKongAdminUrl()`

Returns a fully qualified URL to the Kong Admin API, reachable **only** from within the docker network. Usually this is `http://kong:8001`, but if you have overridden the setting in your environment, the content of the `globals.network.kongAdminUrl` setting is returned (possibly depending on your running environment).

**Note**: Will throw an exception if `initialize()` has not yet successfully finished.

#### `wicked.getInternalChatbotUrl()`

Returns a fully qualified URL to the Portal Chatbot, reachable **only** from within the docker network. Usually this is `http://portal-chatbot:3004`, but if you have overridden the setting in your environment, the content of the `globals.network.chatbotUrl` setting is returned (possibly depending on your running environment).

**Note**: Will throw an exception if `initialize()` has not yet successfully finished.

#### `wicked.getInternalMailerUrl()`

Returns a fully qualified URL to the Portal Chatbot, reachable **only** from within the docker network. Usually this is `http://portal-mailer:3003`, but if you have overridden the setting in your environment, the content of the `globals.network.mailerUrl` setting is returned (possibly depending on your running environment).

**Note**: Will throw an exception if `initialize()` has not yet successfully finished.

#### `wicked.getInternalUrl(globalSettingsProperty)`

Returns an arbitrary URL defined in the `globals.network` JSON configuration. You may use this to add other network settings to the `globals.json` and retrieve it using this mechanism. Please note that this function will throw an `Error` in case the property `globalSettingsProperty` cannot be found in the `networks` section of `globals.json`, whereas the other ones default to the docker container URLs as in the default configuration (e.g. `http://portal-chatbot:3004` etc. pp.).

**Note**: Will throw an exception if `initialize()` has not yet successfully finished.

### Convenience Functionality

#### `wicked.correlationIdHandler()`

The wicked SDK comes with a correlation ID handler you can use as an express middleware. It will do the following thing:

* For incoming requests, check whether there is a header `correlation-id`, and if so, store that internally in the SDK, and in the `req.correlationId` property
* If there is no such header, create a new GUID and store it as `req.correlationId` and internally in the SDK
* For outgoing API calls (using any of the `api*()` functions), the correlation ID will be passed on as a `Correlation-Id` header

Upstream wicked functionality will pick up this header and display it in logs.

**Usage**:

```javascript
var wicked = require('wicked-sdk');
var app = require('express')();

app.use(wicked.correlationIdHandler());
// ...
```