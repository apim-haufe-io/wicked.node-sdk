'use strict';

var os = require('os');
//var async = require('async');
var debug = require('debug')('wicked-sdk');
var request = require('request'); 

// ====== VARIABLES ======

// Use this for local caching of things. Usually just the globals.
// The apiUrl will - after initialization - contain the URL which
// was used to access the portal API with.
const wickedStorage = {
    initialized: false,
    apiUrl: null,
    globals: null
};

// ======= SDK INTERFACE =======

exports.initialize = function (awaitOptions, callback) {
    initialize(awaitOptions, callback);
};

exports.awaitUrl = function (url, options, callback) {
    awaitUrl(url, options, callback);
};

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

// ======= IMPLEMENTATION ======

function initialize(awaitOptions, callback) {
    debug('initialize()');
    if (!callback && (typeof(awaitOptions) === 'function')) {
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

            try {
                const globals = getJson(body);
                wickedStorage.globals = globals;

                return callback(null, globals);
            } catch (ex) {
                return callback(new Error('Parsing globals failed: ' + err.message));
            }
        });
    });
}

const DEFAULT_AWAIT_OPTIONS = {
    statusCode: 200,
    maxTries: 100,
    retryDelay: 1000
};

function awaitUrl(url, options, callback) {
    debug('awaitUrl(): ' + url);
    if (!callback && (typeof(options) === 'function')) {
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

    if (wickedStorage.globals.network &&
        wickedStorage.globals.network.kongAdminUrl)
        return wickedStorage.globals.network.kongAdminUrl;
    return guessServiceUrl('kong', 8001);
}

function getInternalKongAdapterUrl() {
    debug('getInternalKongAdapterUrl()');
    checkInitialized('getInternalKongAdapterUrl');

    if (wickedStorage.globals.network &&
        wickedStorage.globals.network.kongAdapterUrl)
        return wickedStorage.globals.network.kongAdapterUrl;
    return guessServiceUrl('portal-kong-adapter', 3002);
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
        throw new Error('Before calling ' + callingFunction + '(), initialize() must return successfully.');
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