'use strict';

var os = require('os');
//var async = require('async');
var debug = require('debug')('wicked-sdk');
var request = require('request');
var qs = require('querystring');
var uuid = require('node-uuid');

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
    correlationId: null
};

// ======= SDK INTERFACE =======

// ======= INITIALIZATION =======

exports.initialize = function (awaitOptions, callback) {
    initialize(awaitOptions, callback);
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

exports.getSubscriptionByClientId = function (clientId, apiId, callback) {
    getSubscriptionByClientId(clientId, apiId, callback);
};

// ======= CORRELATION ID HANDLER =======

exports.correlationIdHandler = function () {
    return function (req, res, next) {
        var correlationId = req.get('correlation-id');
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

function initialize(awaitOptions, callback) {
    debug('initialize()');
    if (!callback && (typeof (awaitOptions) === 'function')) {
        callback = awaitOptions;
        awaitOptions = null;
    }
    if (awaitOptions) {
        debug('awaitOptions:');
        debug(awaitOptions);
    }

    const apiUrl = resolveApiUrl();
    debug('Awaiting portal API at ' + apiUrl);
    awaitUrl(apiUrl + 'ping', awaitOptions, function (err) {
        if (err) {
            debug('awaitUrl returned an error:');
            debug(err);
            return callback(err);
        }

        wickedStorage.apiUrl = apiUrl;
        request.get({
            url: apiUrl + 'globals'
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
            } catch (ex) {
                return callback(new Error('Parsing globals failed: ' + ex.message));
            }
            return callback(null, globals);
        });
    });
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
    var url = 'http://' + defaultHost + ':' + defaultPort + '/';
    // Are we not running on Linux? Then guess we're in local development mode.
    if (os.type() != 'Linux') {
        let defaultLocalIP = getDefaultLocalIP();
        url = 'http://' + defaultLocalIP + ':' + defaultPort + '/';
    }
    debug(url);
    return url;
}

function resolveApiUrl() {
    var apiUrl = process.env.PORTAL_API_URL;
    if (!apiUrl) {
        apiUrl = guessServiceUrl('portal-api', '3001');
        console.error('Environment variable PORTAL_API_URL is not set, defaulting to ' + apiUrl + '. If this is not correct, please set before starting this process.');
    }
    if (!apiUrl.endsWith('/')) // Add trailing slash
        apiUrl += '/';
    return apiUrl;
}

function getDefaultLocalIP() {
    let localIPs = getLocalIPs();
    if (localIPs.length > 0)
        return localIPs[0];
    return "localhost";
}

function getLocalIPs() {
    debug('getLocalIPs()');
    var interfaces = os.networkInterfaces();
    var addresses = [];
    for (var k in interfaces) {
        for (var k2 in interfaces[k]) {
            var address = interfaces[k][k2];
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
    request.get({ url: url }, function (err, res, body) {
        var isOk = true;
        if (err || res.statusCode != statusCode) {
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
        url: url
    };
    if (method != 'DELETE' &&
        method != 'GET') {
        // DELETE and GET ain't got no body.
        reqInfo.body = actionBody;
        reqInfo.json = true;
    }
    if (userId || wickedStorage.correlationId)
        reqInfo.headers = {};
    if (userId)
        reqInfo.headers['X-UserId'] = userId;
    if (wickedStorage.correlationId) {
        debug('Using correlation id: ' + wickedStorage.correlationId);
        reqInfo.headers['Correlation-Id'] = wickedStorage.correlationId;
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
            let jsonBody = null;
            try {
                jsonBody = getJson(body);
            } catch (ex) {
                return callback(new Error('api' + nice(method) + '() ' + urlPath + ' returned non-parseable JSON: ' + ex.message));
            }
            return callback(null, jsonBody);
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

function getRedirectUriWithAccessToken(userInfo, callback) {
    debug('getRedirectUriWithAccessToken()');
    checkInitialized('getRedirectUriWithAccessToken');
    checkKongAdapterInitialized('getRedirectUriWithAccessToken');

    if (!userInfo.client_id)
        return callback(new Error('client_id is mandatory'));
    if (!userInfo.api_id)
        return callback(new Error('api_id is mandatory'));
    if (!userInfo.authenticated_userid)
        return callback(new Error('authenticated_userid is mandatory'));

    const registerUrl = getInternalKongAdapterUrl() + 'oauth2/register';
    request.post({
        url: registerUrl,
        json: true,
        body: userInfo
    }, function (err, res, body) {
        if (err) {
            debug('POST to ' + registerUrl + ' failed.');
            debug(err);
            return callback(err);
        } else if (res.statusCode > 299) {
            const err = new Error('POST to ' + registerUrl + ' returned unexpected status code: ' + res.statusCode + '. Details in err.body and err.statusCode.');
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
            const err = new Error('POST to ' + registerUrl + ' returned non-parseable JSON: ' + ex.message + '. Possible details in err.body.');
            err.body = body;
            return callback(err);
        }
        return callback(null, jsonBody);
    });
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