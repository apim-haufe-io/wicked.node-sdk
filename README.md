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

The SDK will be kept downwards-compatible for as long as possible; it will be tried hard to make earlier versions of the SDK compatible with a later release of wicked.haufe.io, so using the `--save-exact` is a safe bet if you don't need newer features. **Note**: If you are using wicked >= 0.12.0, you will need to install this SDK in a version >= 0.12.0 as well. Everything else should behave as before though.

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

#### `wicked.initialize([options,] callback)`

Waits for the wicked API to be available and returns a `null` error if successful, otherwise an error message. If you want to change the way the SDK waits for the Portal API, you may supply `options` (see definition of `awaitUrl` below for a description of the await options).

**New as of version 0.11.0**:

The following options are supported in addition to the `awaitOptions` below:

* `userAgentName`: The name of your component, e.g. `company.auth-server``
* `userAgentVersion`: The version of your component, e.g. `1.2.3`
* `doNotPollConfigHash`: Boolean value, set to `true` in order not to automatically shut down the component after a configuration hash has changed. This means you will have to reconfigure your component yourself; otherwise a restart would automatically do this (this is the default behavior which all wicked base components use).

In case you use a `userAgentName` which starts with `wicked`, the version of your component **must** be the exact same version as the Portal API's version, otherwise any call to the wicked API will be rejected with a `428` status code (precondition failed/version mismatch).

The `initialize()` call will look for the Portal API URL in the following way:

* If the environment variable `PORTAL_API_URL` is set, this will be used
* Otherwise, if the environment is Linux (where it assumes it runs in `docker`), it will default to `http://portal-api:3001`
* Otherwise, if the environment is Windows or Mac, it will assume a local development environment, and use `http://localhost:3001` 

**In case you need to work with a wicked installation prior to 0.11.0, please use the node SDK 0.10.13; a version 0.11.0 node SDK will not be compatible with a 0.10.x installation of wicked.!**

After initialization, you have the following functions you may call:

#### `wicked.isDevelopmentMode()`

Returns `true` if the wicked instance is running in development mode. This is assumed to be the case if and only if the specified `network.schema` in `globals.json` is **not** set to `https`.

You may use this to enable certain behaviour in case your module is running on your local machine.

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

The `id` which is returned here has to be used in subsequent calls to the portal API to authorize the service to the portal API (in the `X-UserId` header for wicked <= 0.11.x, in 'X-Authenticated-UserId` for wicked >= 0.12.x).

### API Interaction

**IMPORTANT**: As of version 0.11.0 of the wicked SDK, the SDK will continuously poll the `/confighash` end point of the portal API to detect configuration changes. Changes are detected by comparing the `confighash` retrieved at initialization (the SDK does this as a default) with the current value returned by `/confighash`. In case the values do not match, the SDK will **forcefully exit the entire node process in order to make the component restart and retrieve a new configuration**.

In case you do not want this behavior, but rather would want to control yourself when to restart or reconfigure your component, specify `doNotPollConfigHash: true` in the initialization options (see above).

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

Issues a `POST` to the Portal API end point specified in `urlPath`, using the user ID passed in as `userId`. If `userId` is left out, the call is done without authentication. Check the API Swagger definition for details. The result of the API call is returned as the second parameter of the `callback` (node standard).

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

#### `wicked.oauth2AuthorizeImplicit(userInfo, callback)`

Alias: `getRedirectUriWithAccessToken`.

This is a convenience function which calls the `/oauth2/register` end point of the Kong Adapter, which registers an end user for use with an API which is configured to be accessed using the OAuth2 Implicit Grant Flow (authorization type `oauth2` with "Implicit Grant" ticked). This is implemented in the Kong Adapter, and does the following checks before issuing an access token:

* Does the given client (with the given `client_id`) have an active subscription to the given `api_id`?
* Are the API and Application configured correctly (for use with the implicit grant)?
* Make Kong create an access token/redirect URI

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
        auth_server: 'your-auth-server-id',
        scope: ['scope1', 'scope2']
    };
    wicked.oauth2AuthorizeImplicit(userInfo, function (err, result) {
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

The content of the `userInfo` structure:

* `authenticated_userid`: This is one part of the payload of the token; in this property, pass in the user identity of the end user in **your** system (or the authenticating system). The backend API will receive this string (can contain mostly anything) as an `X-Authenticated-Userid` header when using the token to go through the API Gateway
* `api_id`: The API for which an access token shall be created; this is used to verify that there actually is a subscription for the `client_id` to the `api_id`, and to retrieve some settings on the API (such as the request path). The `api_id` can either be hard coded or also passed in to your implementation, depending on your use case
* `client_id`: This is the client ID of the calling application; this has to be passed in to your authorization server implementation from the outside
* `auth_server`: Semi-optional -- use this to verify that the API for which the token is to be created actually is configured for use with an authorization server (the Kong Adapter will do this for you).  **IMPORTANT**: If you do not specify this, any authorization server may be used with any API, as long as it's configured for the implicit grant.
* `scope`: For which scope shall the access token be created; this is the main task of an Authorization Server: Which scopes (e.g. rights) does the authenticated end user have in your API; if you use scopes, these also have to be configured in your `apis.json` configuration.

#### `wicked.oauth2GetAuthorizationCode(userInfo, callback)`

**Version:** Works as of wicked 0.10.1.

Works exactly like `wicked.oauth2AuthorizeImplicit()`, but you will not get back an access token directly, but rather an Authorization Code, which the client needs to use together with its `client_id` and `client_secret` with the API's `/oauth2/token` endpoint to actually retrieve an access token and refresh token.

This is the implementation which is suitable for use with the OAuth2 Authoriazation Code Grant.

#### `wicked.oauth2GetAccessTokenPasswordGrant(userInfo, callback)`

For use in Authorization Server applications which want to create access tokens for use with the OAuth2 Resource Owner Password Grant. The actual implementation of the Username/Password check has to be done within your implementation of an Authorization Server. After you have done that, you can use this convenience end point to create an access token and a refresh token for use with your API.

It takes a payload in `userInfo` like this (exactly as for the implicit grant above):

```json
{
    "client_id": "client-id-for-app-from-portal",
    "api_id": "some-api",
    "authenticated_userid": "end-user-id",
    "auth_server": "auth-server-id",
    "scope": ["scope1", "scope2"]
}
```

This call goes to the Kong Adapter (which has to run in the same network as your implementation) and does the following things:

* Does the given client (with the given `client_id`) have an active subscription to the given `api_id`?
* Are the API and Application configured correctly (for use with the password grant)?
* Make Kong create an access/refresh token

The same as for the implicit grant applies: If you do not specify an `auth_server`, the Kong Adapter will **not** check whether the API is actually configured to use a specific authorization server, and will allow token creation using **any authorization server**.

#### `wicked.oauth2RefreshAccessToken(tokenInfo, callback)`

For access/refresh tokens created e.g. with the above `oauth2GetAccessTokenPasswordGrant` function, you may use this convenience function to refresh an access token using the `refresh_token` grant. This will only work for APIs configured to be secured with OAuth 2.0, using either the Authorization Code Grant, or the Resource Owner Password Grant.

Currently, the SDK only explicitly supports the Resource Owner Password Grant (may change in the future).

Payload for `tokenInfo`:

```json
{
    "client_id": "client-id-for-app-from-portal",
    "refresh_token": "the-refresh-token-you-received",
    "auth_server": "auth-server-id",
}
```

The Kong Adapter will perform the following actions:

* Does the `client_id` still have a valid subscription to the API?
* Is the API configured to grant refresh token requests?
* Ask Kong to refresh the access token and issue a new access/refresh token pair.

The previous refresh token will then be invalid, and the new refresh token needs to be used.

The same as for the implicit grant applies: If you do not specify an `auth_server`, the Kong Adapter will **not** check whether the API is actually configured to use a specific authorization server, and will allow token creation using **any authorization server**.

If you have a trusted application, use the APIs `/oauth2/token` end point directly, and additionally pass in the `client_secret` into the request body.

#### `wicked.getAccessTokenInfo(accessToken, callback)`

Retrieve information on an access token. Use this to get the information on the authenticated user back based on an access token. A typical use case for this is to find out whether a user is still entitled to use a specific API (authorization).

Returns (a superset of):

```json
{
    "authenticated_userid": "237982738273",
    "authenticated_scope": ["scope1", "scope2"],
    "access_token": "euro4598475983475984798584",
    "refresh_token": "3048983094830958098r090tre098t0947touoi5454"
}
```

#### `wicked.getRefreshTokenInfo(refreshToken, callback)`

Retrieve information on an access token. Use this to get the information on the authenticated user back based on an access token. A typical use case for this is to find out whether a user is still entitled to use a specific API (authorization), e.g. before you issue a new pair of access/refresh tokens.

The decision whether an end user (as opposed to the client) is allowed to continue using an API is entirely up to you, as the implementor of an Authorization Server; this has nothing to do with OAuth2 in general, but needs to be implemented depending on your use case.

Returns (a superset of):

```json
{
    "authenticated_userid": "237982738273",
    "authenticated_scope": ["scope1", "scope2"],
    "access_token": "euro4598475983475984798584",
    "refresh_token": "3048983094830958098r090tre098t0947touoi5454"
}
```

#### `wicked.revokeAccessToken(accessToken, callback)`

**Version:** Works as of wicked 0.11.6.

Revokes an access token by access token string.

After calling this (allow up to a second for the action to take effect), the access token will no longer be valid for calling an API via the API Gateway.

This is useful for implementing a logout functionality.

#### `wicked.revokeAccessTokenByUserId(authenticatedUserID, callback)`

**Version:** Works as of wicked 0.11.6.

Revokes all access tokens which were issued to `authenticatedUserId`.

After calling this (allow up to a second for the action to take effect), the access tokens which were issued to the user with the `authenticatedUserId` will no longer be valid for calling an API via the API Gateway. By first retrieving all access tokens for the given user, all access tokens are sequentially deleted from the access token store. This can take a little while (allow 100ms per token).

This is useful for implementing a logout functionality.

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

#### `wicked.getConfigHash()`

**Version requirement**: wicked SDK 0.11.1, wicked installation 0.11.0

Returns the config hash which was retrieved at initialization. You may use this functionality to retrieve the config hash manually, in case you do not wish to use the SDK API functions but still want to make sure you are working against the correct configuration version (by passing a `X-Config-Hash` header manually).

**Note**: Will throw an exception if `initialize()` has not yet successfully finished.

#### `wicked.getExternalPortalUrl()`

Returns the URL of the portal, the way it is reachable from the outside, e.g. usually from the public internet. This is a convenience method which uses information from the `globals.json` configuration to assemble the URL.

**Note**: Will throw an exception if `initialize()` has not yet successfully finished.

#### `wicked.getExternalApiUrl()`

Returns the URL of the API Gateway, the way it is reachable from the outside, e.g. usually from the public internet. This is a convenience method which uses information from the `globals.json` configuration to assemble the URL.

**Note**: Will throw an exception if `initialize()` has not yet successfully finished.

#### `wicked.getInternalApiUrl()`

Returns a fully qualified URL to the portal API, as seen from inside the docker environment, usually this will be `http://portal-api:3001`. This is **not** an URL you can use from the outside, it's only intended for use within the same docker network as the Portal API. This is the same URL which was used to successfully connect to the API in the `initialization()` call.

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