'use strict';

const os = require('os');
const debug = require('debug')('wicked-sdk');
const request = require('request');
const qs = require('querystring');
const uuid = require('node-uuid');

const WICKED_TIMEOUT = 2000; // request timeout for wicked API operations
const KONG_TIMEOUT   = 5000; // request timeout for kong admin API operations
const TRYGET_TIMEOUT = 2000; // request timeout for single calls in awaitUrl

// ====== VARIABLES ======

// Use this for local caching of things. Usually just the globals.
// The apiUrl will - after initialization - contain the URL which
// was used to access the portal API with.
const wickedStorage = {
    initialized: false,
    kongAdapterInitialized: false,
    machineUserId: null,
    apiUrl: null,
    globals: null,
    correlationId: null,
    configHash: null,
    userAgent: null,
    pendingExit: false,
    apiReachable: false
};

// ======= SDK INTERFACE =======

// ======= INITIALIZATION =======

exports.initialize = function (options, callback) {
    initialize(options, callback);
};

exports.isDevelopmentMode = function () {
    return isDevelopmentMode();
};

exports.initMachineUser = function (serviceId, callback) {
    initMachineUser(serviceId, callback);
};

exports.awaitUrl = function (url, options, callback) {
    awaitUrl(url, options, callback);
};

exports.awaitKongAdapter = function (awaitOptions, callback) {
    awaitKongAdapter(awaitOptions, callback);
};

// ======= INFORMATION RETRIEVAL =======

exports.getGlobals = function () {
    return getGlobals();
};

exports.getConfigHash = function () {
    return getConfigHash();
};

exports.getExternalPortalUrl = function () {
    return getExternalPortalUrl();
};

exports.getExternalApiUrl = function () {
    return getExternalGatewayUrl();
};

exports.getInternalApiUrl = function () {
    return getInternalApiUrl();
};

exports.getInternalKongAdminUrl = function () {
    return getInternalKongAdminUrl();
};

exports.getInternalKongAdapterUrl = function () {
    return getInternalKongAdapterUrl();
};

exports.getInternalChatbotUrl = function () {
    return getInternalChatbotUrl();
};

exports.getInternalMailerUrl = function () {
    return getInternalMailerUrl();
};

exports.getInternalUrl = function (globalSettingsProperty) {
    return getInternalUrl(globalSettingsProperty, null);
};

// ======= API FUNCTIONALITY =======

exports.apiGet = function (urlPath, userId, callback) {
    apiGet(urlPath, userId, callback);
};

exports.apiPost = function (urlPath, postBody, userId, callback) {
    apiPost(urlPath, postBody, userId, callback);
};

exports.apiPut = function (urlPath, putBody, userId, callback) {
    apiPut(urlPath, putBody, userId, callback);
};

exports.apiPatch = function (urlPath, patchBody, userId, callback) {
    apiPatch(urlPath, patchBody, userId, callback);
};

exports.apiDelete = function (urlPath, userId, callback) {
    apiDelete(urlPath, userId, callback);
};

// ======= OAUTH2 CONVENIENCE FUNCTIONS ======= 

exports.getRedirectUriWithAccessToken = function (userInfo, callback) {
    getRedirectUriWithAccessToken(userInfo, callback);
};

exports.oauth2AuthorizeImplicit = function (userInfo, callback) {
    oauth2AuthorizeImplicit(userInfo, callback);
};

exports.oauth2GetAuthorizationCode = function (userInfo, callback) {
    oauth2GetAuthorizationCode(userInfo, callback);
};

exports.oauth2GetAccessTokenPasswordGrant = function (userInfo, callback) {
    oauth2GetAccessTokenPasswordGrant(userInfo, callback);
};

exports.oauth2RefreshAccessToken = function (tokenInfo, callback) {
    oauth2RefreshAccessToken(tokenInfo, callback);
};

exports.oauth2GetAccessTokenInfo = function (accessToken, callback) {
    oauth2GetAccessTokenInfo(accessToken, callback);
};

exports.oauth2GetRefreshTokenInfo = function (refreshToken, callback) {
    oauth2GetRefreshTokenInfo(refreshToken, callback);
};

exports.getSubscriptionByClientId = function (clientId, apiId, callback) {
    getSubscriptionByClientId(clientId, apiId, callback);
};

exports.revokeAccessToken = function (accessToken, callback) {
    revokeAccessToken(accessToken, callback);
};

exports.revokeAccessTokensByUserId = function (authenticatedUserId, callback) {
    revokeAccessTokensByUserId(authenticatedUserId, callback);
};

// ======= CORRELATION ID HANDLER =======

exports.correlationIdHandler = function () {
    return function (req, res, next) {
        const correlationId = req.get('correlation-id');
        if (correlationId) {
            debug('Picking up correlation id: ' + correlationId);
            req.correlationId = correlationId;
        } else {
            req.correlationId = uuid.v4();
            debug('Creating a new correlation id: ' + req.correlationId);
        }
        wickedStorage.correlationId = correlationId;
        return next();
    };
};

// ======= IMPLEMENTATION ======

function initialize(options, callback) {
    debug('initialize()');
    if (!callback && (typeof (options) === 'function')) {
        callback = options;
        options = null;
    }
    if (options) {
        debug('options:');
        debug(options);
    }

    const validationError = validateOptions(options);
    if (validationError) {
        return callback(validationError);
    }

    // I know, this would look a lot nicer with async or Promises,
    // but I did not want to pull in additional dependencies.
    const apiUrl = resolveApiUrl();
    debug('Awaiting portal API at ' + apiUrl);
    awaitUrl(apiUrl + 'ping', options, function (err) {
        if (err) {
            debug('awaitUrl returned an error:');
            debug(err);
            return callback(err);
        }

        wickedStorage.apiUrl = apiUrl;
        if (options.userAgentName && options.userAgentVersion)
            wickedStorage.userAgent = options.userAgentName + '/' + options.userAgentVersion;
        request.get({
            url: apiUrl + 'confighash',
            timeout: WICKED_TIMEOUT
        }, function (err, res, body) {
            if (err) {
                debug('GET /confighash failed');
                debug(err);
                return callback(err);
            }

            if (200 != res.statusCode) {
                debug('GET /confighash returned status code: ' + res.statusCode);
                debug('Body: ' + body);
                return callback(new Error('GET /confighash returned unexpected status code: ' + res.statusCode + ' (Body: ' + body + ')'));
            }

            wickedStorage.configHash = '' + body;

            request.get({
                url: apiUrl + 'globals',
                headers: {
                    'User-Agent': wickedStorage.userAgent,
                    'X-Config-Hash': wickedStorage.configHash
                },
                timeout: WICKED_TIMEOUT
            }, function (err, res, body) {
                if (err) {
                    debug('GET /globals failed');
                    debug(err);
                    return callback(err);
                }
                if (res.statusCode !== 200) {
                    debug('GET /globals returned status code ' + res.statusCode);
                    return callback(new Error('GET /globals return unexpected error code: ' + res.statusCode));
                }

                let globals = null;
                try {
                    globals = getJson(body);
                    wickedStorage.globals = globals;
                    wickedStorage.initialized = true;
                    wickedStorage.apiReachable = true;
                } catch (ex) {
                    return callback(new Error('Parsing globals failed: ' + ex.message));
                }

                // Success, set up config hash checker loop (if not switched off)
                if (!options.doNotPollConfigHash) {
                    setInterval(checkConfigHash, 10000);
                }

                return callback(null, globals);
            });
        });
    });
}

function validateOptions(options) {
    if ((options.userAgentName && !options.userAgentVersion) ||
        (!options.userAgentName && options.userAgentVersion))
        return new Error('You need to specify both userAgentName and userAgentVersion');
    if (options.userAgentName &&
        !/^[a-zA-Z\ \-\_\.0-9]+$/.test(options.userAgentName))
        return new Error('The userAgentName must only contain characters a-z, A-Z, 0-9, -, _ and space.');
    if (options.userAgentVersion &&
        !/^[0-9\.]+$/.test(options.userAgentVersion))
        return new Error('The userAgentVersion must only contain characters 0-9 and .');
    return null;
}

function checkConfigHash() {
    debug('checkConfigHash()');

    request.get({
        url: wickedStorage.apiUrl + 'confighash',
        timeout: WICKED_TIMEOUT
    }, function (err, res, body) {
        wickedStorage.apiReachable = false;
        if (err) {
            console.error('checkConfigHash(): An error occurred.');
            console.error(err);
            console.error(err.stack);
            return;
        }
        if (200 !== res.statusCode) {
            console.error('checkConfigHash(): Returned unexpected status code: ' + res.statusCode);
            return;
        }
        wickedStorage.apiReachable = true;
        const configHash = '' + body;

        if (configHash !== wickedStorage.configHash) {
            console.log('checkConfigHash() - Detected new configuration version, scheduling shutdown in 2 seconds.');
            wickedStorage.pendingExit = true;
            setTimeout(forceExit, 2000);
        }
    });
}

function forceExit() {
    console.log('Exiting component due to outdated configuration (confighash mismatch).');
    process.exit(0);
}

function isDevelopmentMode() {
    checkInitialized('isDevelopmentMode');

    if (wickedStorage.globals &&
        wickedStorage.globals.network &&
        wickedStorage.globals.network.schema &&
        wickedStorage.globals.network.schema === 'https')
        return false;
    return true;
}

const DEFAULT_AWAIT_OPTIONS = {
    statusCode: 200,
    maxTries: 100,
    retryDelay: 1000
};

function awaitUrl(url, options, callback) {
    debug('awaitUrl(): ' + url);
    if (!callback && (typeof (options) === 'function')) {
        callback = options;
        options = null;
    }
    // Copy the settings from the defaults; otherwise we'd change them haphazardly
    const awaitOptions = {
        statusCode: DEFAULT_AWAIT_OPTIONS.statusCode,
        maxTries: DEFAULT_AWAIT_OPTIONS.maxTries,
        retryDelay: DEFAULT_AWAIT_OPTIONS.retryDelay
    };
    if (options) {
        if (options.statusCode)
            awaitOptions.statusCode = options.statusCode;
        if (options.maxTries)
            awaitOptions.maxTries = options.maxTries;
        if (options.retryDelay)
            awaitOptions.retryDelay = options.retryDelay;
    }

    debug('Invoking tryGet()');
    tryGet(url, awaitOptions.statusCode, awaitOptions.maxTries, 0, awaitOptions.retryDelay, function (err, body) {
        debug('tryGet() returned.');
        if (err) {
            debug('but tryGet() errored.');
            debug(err);
            return callback(err);
        }
        callback(null, body);
    });
}

function awaitKongAdapter(awaitOptions, callback) {
    debug('awaitKongAdapter()');
    checkInitialized('awaitKongAdapter');
    if (!callback && (typeof (awaitOptions) === 'function')) {
        callback = awaitOptions;
        awaitOptions = null;
    }
    if (awaitOptions) {
        debug('awaitOptions:');
        debug(awaitOptions);
    }

    const adapterPingUrl = getInternalKongAdapterUrl() + 'ping';
    awaitUrl(adapterPingUrl, awaitOptions, function (err, body) {
        if (err)
            return callback(err);
        wickedStorage.kongAdapterInitialized = true;
        return callback(null, body);
    });
}

function initMachineUser(serviceId, callback) {
    debug('initMachineUser()');
    checkInitialized('initMachineUser');

    if (!/^[a-zA-Z\-_0-9]+$/.test(serviceId))
        return callback(new Error('Invalid Service ID, must only contain a-z, A-Z, 0-9, - and _.'));

    const customId = makeMachineUserCustomId(serviceId);
    apiGet('users?customId=' + qs.escape(customId), function (err, userInfo) {
        if (err && err.statusCode == 404) {
            // Not found
            return createMachineUser(serviceId, callback);
        } else if (err) {
            return callback(err);
        }
        if (!Array.isArray(userInfo))
            return callback(new Error('GET of user with customId ' + customId + ' did not return expected array.'));
        if (userInfo.length !== 1)
            return callback(new Error('GET of user with customId ' + customId + ' did not return array of length 1 (length == ' + userInfo.length + ').'));
        userInfo = userInfo[0]; // Pick the user from the list.
        debug('Machine user info:');
        debug(userInfo);
        debug('Setting machine user id: ' + userInfo.id);
        wickedStorage.machineUserId = userInfo.id;
        return callback(null, userInfo);
    });
}

function makeMachineUserCustomId(serviceId) {
    const customId = 'internal:' + serviceId;
    return customId;
}

function createMachineUser(serviceId, callback) {
    const customId = makeMachineUserCustomId(serviceId);
    const userInfo = {
        customId: customId,
        firstName: 'Machine-User',
        lastName: serviceId,
        email: serviceId + '@wicked.haufe.io',
        validated: true,
        groups: ['admin']
    };
    apiPost('users', userInfo, function (err, userInfo) {
        if (err)
            return callback(err);
        debug('Machine user info:');
        debug(userInfo);
        debug('Setting machine user id: ' + userInfo.id);
        wickedStorage.machineUserId = userInfo.id;
        return callback(null, userInfo);
    });
}

function getGlobals() {
    debug('getGlobals()');
    checkInitialized('getGlobals');

    return wickedStorage.globals;
}

function getConfigHash() {
    debug('getConfigHash()');
    checkInitialized('getConfigHash');

    return wickedStorage.configHash;
}

function getExternalPortalUrl() {
    debug('getExternalPortalUrl()');
    checkInitialized('getExternalPortalUrl');

    return checkSlash(getSchema() + '://' + getPortalHost());
}

function getExternalGatewayUrl() {
    debug('getExternalGatewayUrl()');
    checkInitialized('getExternalGatewayUrl');

    return checkSlash(getSchema() + '://' + getApiHost());
}

function getInternalApiUrl() {
    debug('getInternalApiUrl()');
    checkInitialized('getInternalApiUrl');

    return checkSlash(wickedStorage.apiUrl);
}

function getInternalKongAdminUrl() {
    debug('getInternalKongAdminUrl()');
    checkInitialized('getInternalKongAdminUrl');

    return getInternalUrl('kongAdminUrl', 'kong', 8001);
}

function getInternalMailerUrl() {
    debug('getInternalMailerUrl');
    checkInitialized('getInternalMailerUrl');

    return getInternalUrl('mailerUrl', 'portal-mailer', 3003);
}

function getInternalChatbotUrl() {
    debug('getInternalChatbotUrl()');
    checkInitialized('getInternalChatbotUrl');

    return getInternalUrl('chatbotUrl', 'portal-chatbot', 3004);
}

function getInternalKongAdapterUrl() {
    debug('getInternalKongAdapterUrl()');
    checkInitialized('getInternalKongAdapterUrl');

    return getInternalUrl('kongAdapterUrl', 'portal-kong-adapter', 3002);
}

function getInternalUrl(globalSettingsProperty, defaultHost, defaultPort) {
    debug('getInternalUrl("' + globalSettingsProperty + '")');
    checkInitialized('getInternalUrl');

    if (wickedStorage.globals.network &&
        wickedStorage.globals.network.hasOwnProperty(globalSettingsProperty)) {
        return checkSlash(wickedStorage.globals.network[globalSettingsProperty]);
    }
    if (defaultHost && defaultPort)
        return checkSlash(guessServiceUrl(defaultHost, defaultPort));
    throw new Error('Configuration property "' + globalSettingsProperty + '" not defined in globals.json: network.');
}

// ======= UTILITY FUNCTIONS ======

function checkSlash(someUrl) {
    if (someUrl.endsWith('/'))
        return someUrl;
    return someUrl + '/';
}

function getSchema() {
    if (wickedStorage.globals.network &&
        wickedStorage.globals.network.schema)
        return wickedStorage.globals.network.schema;
    console.error('In globals.json, network.schema is not defined. Defaulting to https.');
    return 'https';
}

function getPortalHost() {
    if (wickedStorage.globals.network &&
        wickedStorage.globals.network.portalHost)
        return wickedStorage.globals.network.portalHost;
    throw new Error('In globals.json, portalHost is not defined. Cannot return any default.');
}

function getApiHost() {
    if (wickedStorage.globals.network &&
        wickedStorage.globals.network.apiHost)
        return wickedStorage.globals.network.apiHost;
    throw new Error('In globals.json, apiHost is not defined. Cannot return any default.');
}

function checkInitialized(callingFunction) {
    if (!wickedStorage.initialized)
        throw new Error('Before calling ' + callingFunction + '(), initialize() must have been called and has to have returned successfully.');
}

function checkKongAdapterInitialized(callingFunction) {
    if (!wickedStorage.kongAdapterInitialized)
        throw new Error('Before calling ' + callingFunction + '(), awaitKongAdapter() must have been called and has to have returned successfully.');
}

function guessServiceUrl(defaultHost, defaultPort) {
    debug('guessServiceUrl() - defaultHost: ' + defaultHost + ', defaultPort: ' + defaultPort);
    let url = 'http://' + defaultHost + ':' + defaultPort + '/';
    // Are we not running on Linux? Then guess we're in local development mode.
    if (os.type() != 'Linux') {
        const defaultLocalIP = getDefaultLocalIP();
        url = 'http://' + defaultLocalIP + ':' + defaultPort + '/';
    }
    debug(url);
    return url;
}

function resolveApiUrl() {
    let apiUrl = process.env.PORTAL_API_URL;
    if (!apiUrl) {
        apiUrl = guessServiceUrl('portal-api', '3001');
        console.error('Environment variable PORTAL_API_URL is not set, defaulting to ' + apiUrl + '. If this is not correct, please set before starting this process.');
    }
    if (!apiUrl.endsWith('/')) // Add trailing slash
        apiUrl += '/';
    return apiUrl;
}

function getDefaultLocalIP() {
    const localIPs = getLocalIPs();
    if (localIPs.length > 0)
        return localIPs[0];
    return "localhost";
}

function getLocalIPs() {
    debug('getLocalIPs()');
    const interfaces = os.networkInterfaces();
    const addresses = [];
    for (let k in interfaces) {
        for (let k2 in interfaces[k]) {
            const address = interfaces[k][k2];
            if (address.family === 'IPv4' && !address.internal) {
                addresses.push(address.address);
            }
        }
    }
    debug(addresses);
    return addresses;
}

function tryGet(url, statusCode, maxTries, tryCounter, timeout, callback) {
    debug('Try #' + tryCounter + ' to GET ' + url);
    request.get({ url: url, timeout: TRYGET_TIMEOUT }, function (err, res, body) {
        if (err || res.statusCode !== statusCode) {
            if (tryCounter < maxTries || maxTries < 0)
                return setTimeout(tryGet, timeout, url, statusCode, maxTries, tryCounter + 1, timeout, callback);
            debug('Giving up.');
            if (!err)
                err = new Error('Too many unsuccessful retries to GET ' + url + '. Gave up after ' + maxTries + ' tries.');
            return callback(err);
        }
        callback(null, body);
    });
}

function getJson(ob) {
    if (ob instanceof String || typeof ob === "string")
        return JSON.parse(ob);
    return ob;
}

function getText(ob) {
    if (ob instanceof String || typeof ob === "string")
        return ob;
    return JSON.stringify(ob, null, 2);
}

function apiGet(urlPath, userId, callback) {
    debug('apiGet(): ' + urlPath);
    checkInitialized('apiGet');

    apiAction('GET', urlPath, null, userId, callback);
}

function apiPost(urlPath, postBody, userId, callback) {
    debug('apiGet(): ' + urlPath);
    checkInitialized('apiPost');

    apiAction('POST', urlPath, postBody, userId, callback);
}

function apiPut(urlPath, putBody, userId, callback) {
    debug('apiPut(): ' + urlPath);
    checkInitialized('apiPut');

    apiAction('PUT', urlPath, putBody, userId, callback);
}

function apiPatch(urlPath, patchBody, userId, callback) {
    debug('apiPatch(): ' + urlPath);
    checkInitialized('apiPatch');

    apiAction('PATCH', urlPath, patchBody, userId, callback);
}

function apiDelete(urlPath, userId, callback) {
    debug('apiDelete(): ' + urlPath);
    checkInitialized('apiDelete');

    apiAction('DELETE', urlPath, null, userId, callback);
}

function apiAction(method, urlPath, actionBody, userId, callback) {
    debug('apiAction(' + method + '): ' + urlPath);

    if (!wickedStorage.apiReachable)
        return callback(new Error('The wicked API is currently not reachable. Try again later.'));
    if (wickedStorage.pendingExit)
        return callback(new Error('A shutdown due to changed configuration is pending.'));

    if (actionBody)
        debug(actionBody);

    if (!callback && (typeof (userId) === 'function')) {
        callback = userId;
        userId = null;
    }
    if (!userId && wickedStorage.machineUserId) {
        debug('Picking up machine user id: ' + wickedStorage.machineUserId);
        userId = wickedStorage.machineUserId;
    }

    if (urlPath.startsWith('/'))
        urlPath = urlPath.substring(1); // strip slash in beginning; it's in the API url

    const url = getInternalApiUrl() + urlPath;
    debug(method + ' ' + url);
    const reqInfo = {
        method: method,
        url: url,
        timeout: WICKED_TIMEOUT
    };
    if (method != 'DELETE' &&
        method != 'GET') {
        // DELETE and GET ain't got no body.
        reqInfo.body = actionBody;
        reqInfo.json = true;
    }
    // This is the config hash we saw at init; send it to make sure we don't
    // run on an outdated configuration.
    reqInfo.headers = { 'X-Config-Hash': wickedStorage.configHash };
    if (userId)
        reqInfo.headers['X-UserId'] = userId;
    if (wickedStorage.correlationId) {
        debug('Using correlation id: ' + wickedStorage.correlationId);
        reqInfo.headers['Correlation-Id'] = wickedStorage.correlationId;
    }
    if (wickedStorage.userAgent) {
        debug('Using User-Agent: ' + wickedStorage.userAgent);
        reqInfo.headers['User-Agent'] = wickedStorage.userAgent;
    }

    request(reqInfo, function (err, res, body) {
        if (err)
            return callback(err);
        if (res.statusCode > 299) {
            // Looks bad
            const err = new Error('api' + nice(method) + '() ' + urlPath + ' returned non-OK status code: ' + res.statusCode + ', check err.statusCode and err.body for details');
            err.statusCode = res.statusCode;
            err.body = body;
            return callback(err);
        }
        if (res.statusCode !== 204) {
            const contentType = res.headers['content-type'];
            let returnValue = null;
            try {
                if (contentType.startsWith('text'))
                    returnValue = getText(body);
                else
                    returnValue = getJson(body);
            } catch (ex) {
                return callback(new Error('api' + nice(method) + '() ' + urlPath + ' returned non-parseable JSON: ' + ex.message));
            }
            return callback(null, returnValue);
        } else {
            // Empty response
            return callback(null);
        }
    });
}

function nice(methodName) {
    return methodName.substring(0, 1) + methodName.substring(1).toLowerCase();
}

// ====== OAUTH2 ======

function kongAdapterAction(method, url, body, callback) {
    const actionUrl = getInternalKongAdapterUrl() + url;
    const reqBody = {
        method: method,
        url: actionUrl,
        timeout: KONG_TIMEOUT
    };
    if (method !== 'GET') {
        reqBody.json = true;
        reqBody.body = body;
    }
    request(reqBody, function (err, res, body) {
        if (err) {
            debug(method + ' to ' + actionUrl + ' failed.');
            debug(err);
            return callback(err);
        }
        if (res.statusCode > 299) {
            const err = new Error(method + ' to ' + actionUrl + ' returned unexpected status code: ' + res.statusCode + '. Details in err.body and err.statusCode.');
            debug('Unexpected status code.');
            debug('Status Code: ' + res.statusCode);
            debug('Body: ' + body);
            err.statusCode = res.statusCode;
            err.body = body;
            return callback(err);
        }
        let jsonBody = null;
        try {
            jsonBody = getJson(body);
            debug(jsonBody);
        } catch (ex) {
            const err = new Error(method + ' to ' + actionUrl + ' returned non-parseable JSON: ' + ex.message + '. Possible details in err.body.');
            err.body = body;
            return callback(err);
        }
        return callback(null, jsonBody);
    });
}

function getRedirectUriWithAccessToken(userInfo, callback) {
    debug('getRedirectUriWithAccessToken()');
    oauth2AuthorizeImplicit(userInfo, callback);
}

function oauth2AuthorizeImplicit(userInfo, callback) {
    debug('oauth2AuthorizeImplicit()');
    checkInitialized('oauth2AuthorizeImplicit');
    checkKongAdapterInitialized('oauth2AuthorizeImplicit');

    if (!userInfo.client_id)
        return callback(new Error('client_id is mandatory'));
    if (!userInfo.api_id)
        return callback(new Error('api_id is mandatory'));
    if (!userInfo.authenticated_userid)
        return callback(new Error('authenticated_userid is mandatory'));
    if (!userInfo.auth_server)
        console.error('WARNING: wicked-sdk: oauth2AuthorizeImplicit() - auth_server is not passed in to call; this means it is not checked whether the API has the correct auth server configured.');

    kongAdapterAction('POST', 'oauth2/token/implicit', userInfo, function (err, redirectUri) {
        if (err)
            return callback(err);
        callback(null, redirectUri);
    });
}

function oauth2GetAuthorizationCode(userInfo, callback) {
    debug('oauth2GetAuthorizationCode()');
    checkInitialized('oauth2GetAuthorizationCode');
    checkKongAdapterInitialized('oauth2GetAuthorizationCode');

    if (!userInfo.client_id)
        return callback(new Error('client_id is mandatory'));
    if (!userInfo.api_id)
        return callback(new Error('api_id is mandatory'));
    if (!userInfo.authenticated_userid)
        return callback(new Error('authenticated_userid is mandatory'));
    if (!userInfo.auth_server)
        console.error('WARNING: wicked-sdk: oauth2GetAuthorizationCode() - auth_server is not passed in to call; this means it is not checked whether the API has the correct auth server configured.');

    kongAdapterAction('POST', 'oauth2/token/code', userInfo, function (err, redirectUri) {
        if (err)
            return callback(err);
        callback(null, redirectUri);
    });
}

function oauth2GetAccessTokenPasswordGrant(userInfo, callback) {
    debug('oauth2GetAccessTokenPasswordGrant()');
    checkInitialized('oauth2GetAccessTokenPasswordGrant');
    checkKongAdapterInitialized('oauth2GetAccessTokenPasswordGrant');

    if (!userInfo.client_id)
        return callback(new Error('client_id is mandatory'));
    if (!userInfo.api_id)
        return callback(new Error('api_id is mandatory'));
    if (!userInfo.authenticated_userid)
        return callback(new Error('authenticated_userid is mandatory'));
    if (!userInfo.auth_server)
        console.error('WARNING: wicked-sdk: oauth2GetAccessTokenPasswordGrant() - auth_server is not passed in to call; this means it is not checked whether the API has the correct auth server configured.');

    kongAdapterAction('POST', 'oauth2/token/password', userInfo, function (err, accessToken) {
        if (err)
            return callback(err);
        callback(null, accessToken);
    });
}

function oauth2RefreshAccessToken(tokenInfo, callback) {
    debug('oauth2RefreshAccessToken');
    checkInitialized('oauth2RefreshAccessToken');
    checkKongAdapterInitialized('oauth2RefreshAccessToken');

    if (!tokenInfo.refresh_token)
        return callback(new Error('refresh_token is mandatory'));
    if (!tokenInfo.client_id)
        return callback(new Error('client_id is mandatory'));
    if (!tokenInfo.auth_server)
        console.error('WARNING: wicked-sdk: oauth2RefreshAccessToken() - auth_server is not passed in to call; this means it is not checked whether the API has the correct auth server configured.');

    kongAdapterAction('POST', 'oauth2/token/refresh', tokenInfo, function (err, accessToken) {
        if (err)
            return callback(err);
        callback(null, accessToken);
    });
}

function oauth2GetAccessTokenInfo(accessToken, callback) {
    debug('oauth2GetAccessTokenInfo()');
    checkInitialized('oauth2GetAccessTokenInfo');
    checkKongAdapterInitialized('oauth2GetAccessTokenInfo');

    kongAdapterAction('GET', 'oauth2/token?access_token=' + qs.escape(accessToken), null, function (err, tokenInfo) {
        if (err)
            return callback(err);
        callback(null, tokenInfo);
    });
}

function oauth2GetRefreshTokenInfo(refreshToken, callback) {
    debug('oauth2GetRefreshTokenInfo()');
    checkInitialized('oauth2GetRefreshTokenInfo');
    checkKongAdapterInitialized('oauth2GetRefreshTokenInfo');

    kongAdapterAction('GET', 'oauth2/token?refresh_token=' + qs.escape(refreshToken), null, function (err, tokenInfo) {
        if (err)
            return callback(err);
        callback(null, tokenInfo);
    });
}

function revokeAccessToken(accessToken, callback) {
    debug(`revokeAccessToken(${accessToken})`);
    checkInitialized('revokeAccessToken()');
    checkKongAdapterInitialized('revokeAccessToken()');

    kongAdapterAction('DELETE', 'oauth2/token?access_token=' + qs.escape(accessToken), null, callback);
}

function revokeAccessTokensByUserId(authenticatedUserId, callback) {
    debug(`revokeAccessTokenByUserId(${authenticatedUserId})`);
    checkInitialized('revokeAccessTokenByUserId()');
    checkKongAdapterInitialized('revokeAccessTokenByUserId()');
    
    kongAdapterAction('DELETE', 'oauth2/token?authenticated_userid=' + qs.escape(authenticatedUserId), null, callback);
}

function getSubscriptionByClientId(clientId, apiId, callback) {
    debug('getSubscriptionByClientId()');
    checkInitialized('getSubscriptionByClientId');

    // Validate format of clientId
    if (!/^[a-zA-Z0-9\-]+$/.test(clientId)) {
        return callback(new Error('Invalid client_id format.'));
    }

    // Check whether we know this client ID, otherwise we won't bother.
    apiGet('subscriptions/' + qs.escape(clientId), function (err, subsInfo) {
        if (err) {
            debug('GET of susbcription for client_id ' + clientId + ' failed.');
            debug(err);
            return callback(new Error('Could not identify application with given client_id.'));
        }
        debug('subscription info:');
        debug(subsInfo);
        if (!subsInfo.subscription)
            return callback(new Error('Could not successfully retrieve subscription information.'));
        if (subsInfo.subscription.api != apiId) {
            debug('subsInfo.api != apiId: ' + subsInfo.subscription.api + ' != ' + apiId);
            return callback(new Error('Bad request. The client_id does not match the API.'));
        }
        debug('Successfully identified application: ' + subsInfo.subscription.application);

        return callback(null, subsInfo);
    });
}
