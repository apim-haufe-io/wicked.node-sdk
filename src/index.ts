'use strict';

const os = require('os');
const debug = require('debug')('wicked-sdk');
const request = require('request');
const qs = require('querystring');
const uuid = require('node-uuid');
const containerized = require('containerized');

import { WickedError } from "./wicked-error";

const isLinux = (os.platform() === 'linux');
const isContainerized = isLinux && containerized();

const WICKED_TIMEOUT = 2000; // request timeout for wicked API operations
const KONG_TIMEOUT = 5000; // request timeout for kong admin API operations
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
    apiReachable: false,
    // This field will not necessarily be filled.
    apiVersion: null,
    isV012OrHigher: false,
    isV100OrHigher: false,
    portalApiScope: null
};

// ======= SDK INTERFACE =======

// ====================
// INTERNAL TYPES
// ====================

interface RequestBody {
    method: string,
    url: string,
    headers?: {
        [headerName: string]: string
    }
    timeout?: number,
    json?: boolean,
    body?: any
}

// ====================
// WICKED TYPES
// ====================

export interface WickedAwaitOptions {
    statusCode?: number,
    maxTries?: number,
    retryDelay?: number
}

export interface WickedInitOptions extends WickedAwaitOptions {
    userAgentName: string,
    userAgentVersion: string,
    doNotPollConfigHash?: boolean
}

export interface WickedGlobals {
    version: number,
    title: string,
    footer: string,
    company: string,
    // Group validated users are automatically assigned to
    validatedUsergGroup?: string,
    // Used to validate that the secret config key is correct
    configKeyCheck: string,
    api?: WickedGlobalsApi
    network: WickedGlobalsNetwork,
    db: WickedGlobalsDb,

    sessionStore: WickedSessionStoreConfig,
    kongAdapter?: WickedKongAdapterConfig,
    portal: WickedPortalConfig,
    storage: WickedStorageConfig,

    initialUsers: WickedGlobalsInitialUser[],
    recaptcha: WickedRecaptchaConfig
    mailer: WickedMailerConfig
    chatbot: WickedChatbotConfig,
    layouts?: WickedLayoutConfig
    views?: WickedViewsConfig
}

export interface WickedStorageConfig {
    type: WickedStorageType
    pgHost?: string
    pgPort?: number,
    pgUser?: string,
    pgPassword?: string
}

export enum WickedStorageType {
    JSON = 'json',
    Postgres = 'postgres'
}

export interface WickedPortalConfig {
    // Array of allowed auth methods for the portal login; in the form
    // <auth server name>:<auth method name>,
    // Example: ["default:local", "default:google"]
    authMethods: string[]
}

export interface WickedKongAdapterConfig {
    useKongAdapter: boolean,
    // List of Kong plugins which the Kong Adapter doesn't touch when configuring Kong
    ignoreList: string[]
}

export interface WickedSessionStoreConfig {
    type: WickedSessionStoreType
    host?: string,
    port?: number,
    password?: string
}

export enum WickedSessionStoreType {
    Redis = 'redis',
    File = 'file'
}

export interface WickedViewsConfig {
    apis: {
        showApiIcon: boolean,
        titleTagline: string
    },
    applications: {
        titleTagline: string
    },
    application: {
        titleTagline: string
    }
}

export interface WickedLayoutConfig {
    defautRootUrl: string,
    defautRootUrlTarget: string,
    defautRootUrlText: null,
    menu: {
        homeLinkText: string,
        apisLinkVisibleToGuest: boolean,
        applicationsLinkVisibleToGuest: boolean,
        contactLinkVisibleToGuest: boolean,
        contentLinkVisibleToGuest: boolean,
        classForLoginSignupPosition: string,
        showSignupLink: boolean,
        loginLinkText: string
    },
    footer: {
        showBuiltBy: boolean,
        showBuilds: boolean
    },
    swaggerUi: {
        menu: {
            homeLinkText: string,
            showContactLink: boolean,
            showContentLink: boolean
        }
    }
}

export interface WickedChatbotConfig {
    username: string,
    icon_url: string,
    hookUrls: string[],
    events: WickedChatbotEventsConfig
}

export interface WickedChatbotEventsConfig {
    userSignedUp: boolean,
    userValidatedEmail: boolean,
    applicationAdded: boolean,
    applicationDeleted: boolean,
    subscriptionAdded: boolean,
    subscriptionDeleted: boolean,
    approvalRequired: boolean,
    lostPasswordRequest: boolean,
    verifyEmailRequest: boolean
}

export interface WickedMailerConfig {
    senderEmail: string,
    senderName: string,
    smtpHost: string,
    smtpPort?: number,
    username?: string,
    password?: string,
    adminEmail: string,
    adminName: string
}

export interface WickedRecaptchaConfig {
    useRecaptcha: boolean,
    websiteKey: string,
    secretKey: string
}

export interface WickedGlobalsApi {
    headerName: string
}

export interface WickedGlobalsNetwork {
    schema: string,
    portalHost: string,
    apiHost: string,
    apiUrl: string,
    portalUrl: string,
    kongAdapterUrl: string,
    kongAdminUrl: string,
    mailerUrl: string,
    chatbotUrl: string
}

export interface WickedGlobalsDb {
    staticConfig: string,
    dynamicConfig?: string
}

export interface WickedGlobalsInitialUser {
    id: string,
    customId?: string,
    name: string
    email: string,
    password?: string,
    validated?: boolean,
    groups: string[]
}

export interface WickedUserShortInfo {
    id: string,
    customId?: string,
    email: string,
}

export interface WickedUserCreateInfo {
    customId?: string,
    email: string,
    password?: string,
    validated?: boolean,
    groups: string[]
}

export interface WickedUserInfo extends WickedUserCreateInfo {
    id: string,
    applications?: WickedApplication[]
}

export interface OidcProfile {
    sub: string,
    email?: string,
    email_verified?: boolean,
    preferred_username?: string,
    username?: string,
    name?: string,
    given_name?: string,
    family_name?: string,
    phone?: string,
    [key: string]: any
};

export interface WickedApi {
    id: string,
    name: string,
    desc: string,
    auth: string,
    tags?: string[],
    authMethods?: string[],
    registrationPool?: string,
    requiredGroup?: string,
    passthroughUsers?: boolean,
    passthroughScopeUrl?: string,
    settings: WickedApiSettings,
    _links?: any
}

export interface WickedApiCollection {
    apis: WickedApi[],
    _links?: any
}

export interface WickedApiSettings {
    enable_client_credentials?: boolean,
    enable_implicit_grant?: boolean,
    enable_authorization_code?: boolean,
    enable_password_grant?: boolean,
    token_expiration?: string,
    scopes: WickedApiScopes,
    tags: string[],
    plans: string[],
    internal?: boolean
}

export interface WickedApiScopes {
    [scope: string]: {
        description: string
    }
}

export interface WickedApiPlan {
    id: string,
    name: string,
    desc: string,
    needsApproval?: boolean,
    requiredGroup?: string,
    config: {
        plugins: KongPlugin[]
    }
}

export interface WickedApiPlanCollection {
    plans: WickedApiPlan[]
}

export interface WickedScopeGrant {
    scope: string,
    grantedDate?: string // DateTime
}

export interface WickedGrant {
    userId?: string,
    apiId?: string,
    applicationId?: string,
    grants: WickedScopeGrant[]
}

export interface WickedAuthMethod {
    enabled: string,
    name: string,
    type: string,
    friendlyShort: string,
    friendlyLong: string,
    config: any
}

export interface WickedAuthServer {
    id: string,
    name: string,
    authMethods: WickedAuthMethod[],
    config: {
        api: KongApi,
        plugins: KongPlugin[]
    }
}

export enum WickedOwnerRole {
    Owner = "owner",
    Collaborator = "collaborator",
    Reader = "reader"
}

export interface WickedOwner {
    userId: string,
    email: string,
    role: WickedOwnerRole
}

export interface WickedApplicationCreateInfo {
    id: string,
    name: string,
    redirectUri?: string,
    confidential?: boolean,
}

export interface WickedApplication extends WickedApplicationCreateInfo {
    ownerList: WickedOwner[]
}

export enum WickedAuthType {
    KeyAuth = "key-auth",
    OAuth2 = "oauth2"
}

export enum WickedApplicationRoleType {
    Admin = 'admin',
    Collaborator = 'collaborator',
    Reader = 'reader'
}

export interface WickedApplicationRole {
    role: WickedApplicationRoleType,
    desc: string
}

export interface WickedSubscriptionCreateInfo {
    application: string,
    api: string,
    plan: string,
    auth: WickedAuthType,
    apikey?: string,
}

export interface WickedSubscription extends WickedSubscriptionCreateInfo {
    clientId?: string,
    clientSecret?: string,
    approved: boolean,
    trusted?: boolean,
    changedBy?: string,
    changedDate?: string
}

export interface WickedSubscriptionPatchInfo {
    approved?: boolean,
    trusted?: boolean
}

export interface WickedSubscriptionInfo {
    application: WickedApplication,
    subscription: WickedSubscription
}

export enum WickedPoolPropertyType {
    String = "string"
}

export interface WickedPoolProperty {
    id: string,
    description: string,
    type: string,
    maxLength: number,
    minLength: number,
    required: boolean,
    oidcClaim: string
}

export interface WickedPool {
    id: string,
    name: string,
    requiresNamespace?: boolean,
    // Disallow interactive registration
    disallowRegister?: boolean,
    properties: WickedPoolProperty[]
}

export interface WickedPoolMap {
    [poolId: string]: WickedPool
}

export interface WickedRegistration {
    userId: string,
    poolId: string,
    namespace?: string
}

export interface WickedRegistrationMap {
    pools: {
        [poolId: string]: WickedRegistration[]
    }
}

export interface WickedNamespace {
    namespace: string,
    poolId: string,
    description: string
}

export interface WickedGroup {
    id: string,
    name: string,
    alt_ids?: string[],
    adminGroup?: boolean,
    approverGroup?: boolean
}

export interface WickedGroupCollection {
    groups: WickedGroup[]
}

export interface WickedApproval {
    id: string,
    user: {
        id: string,
        name: string,
        email: string
    },
    api: {
        id: string,
        name: string
    },
    application: {
        id: string,
        name: string
    },
    plan: {
        id: string,
        name: string
    }
}

export interface WickedVerification {
    id: string,
    type: WickedVerificationType,
    email: string,
    // Not needed when creating, is returned on retrieval
    userId?: string,
    // The fully qualified link to the verification page, with a placeholder for the ID (mustache {{id}})
    link?: string
}

export enum WickedVerificationType {
    Email = 'email',
    LostPassword = 'lostpassword'
}

export interface WickedComponentHealth {
    name: string,
    message?: string,
    uptime: number,
    healthy: WickedComponentHealthType,
    pingUrl: string,
    pendingEvents: number
}

export enum WickedComponentHealthType {
    NotHealthy = 0,
    Healthy = 1,
    Initializing = 2
}

export interface WickedChatbotTemplates {
    userLoggedIn: string,
    userSignedUp: string,
    userValidatedEmail: string,
    applicationAdded: string,
    applicationDeleted: string,
    subscriptionAdded: string,
    subscriptionDeleted: string,
    approvalRequired: string,
    lostPasswordRequest: string,
    verifyEmailRequest: string
}

export enum WickedEmailTemplateType {
    LostPassword = 'lost_password',
    PendingApproval = 'pending_approval',
    VerifyEmail = 'verify_email'
}

export interface WickedWebhookListener {
    id: string,
    url: string
}

export interface WickedEvent {
    id: string,
    action: WickedEventActionType,
    entity: WickedEventEntityType,
    href?: string,
    data?: object
}

export enum WickedEventActionType {
    Add = 'add',
    Update = 'update',
    Delete = 'delete',
    Password = 'password',
    Validated = 'validated',
    Login = 'login',
    // These two are deprecated
    ImportFailed = 'failed',
    ImportDone = 'done'
}

export enum WickedEventEntityType {
    Application = 'application',
    User = 'user',
    Subscription = 'subscription',
    Approval = 'approval',
    Owner = 'owner',
    Verification = 'verification',
    VerificationLostPassword = 'verification_lost_password',
    VerificationEmail = 'verification_email',
    // Deprecated
    Export = 'export',
    Import = 'import'
}

// OPTION TYPES

export interface WickedGetOptions {
    offset?: number,
    limit?: number
}

export interface WickedGetCollectionOptions extends WickedGetOptions {
    filter?: {
        [field: string]: string
    },
    order_by?: string,
    no_cache?: boolean
}

export interface WickedGetRegistrationOptions extends WickedGetCollectionOptions {
    namespace?: string
}

// ====================
// GENERICS
// ====================

export interface WickedCollection<T> {
    items: T[],
    count: number,
    count_cached: boolean,
    offset: number,
    limit: number
}

// ====================
// KONG TYPES
// ====================

export interface KongApi {
    retries: number,
    upstream_send_timeout: number,
    upstream_connect_timeout: number,
    id: string,
    upstream_read_timeout: number,
    strip_uri: boolean,
    created_at: number,
    upstream_url: string,
    name: string,
    uris: string[],
    preserve_host: boolean,
    http_if_terminated: boolean,
    https_only: boolean
}

export interface KongPlugin {
    name: string,
    config: any
}

// ====================
// CALLBACK TYPES
// ====================

export interface ErrorCallback {
    (err): void
}

export interface Callback<T> {
    (err, t?: T): void
}


// ====================
// FUNCTION TYPES
// ====================

export interface ExpressHandler {
    (req, res, next?): void
}


// ====================
// PASSTHROUGH HANDLING TYPES
// ====================

export interface PassthroughScopeRequest {
    scope?: string[],
    profile: OidcProfile
}

export interface PassthroughScopeResponse {
    allow: boolean,
    error_message?: string,
    authenticated_userid: string,
    authenticated_scope?: string[]
}

// ======= INITIALIZATION =======

export function initialize(options: WickedInitOptions, callback: Callback<WickedGlobals>): void {
    _initialize(options, callback);
}

export function isDevelopmentMode(): boolean {
    return _isDevelopmentMode();
};

export function initMachineUser(serviceId: string, callback: ErrorCallback): void {
    _initMachineUser(serviceId, callback);
};

export function awaitUrl(url: string, options: WickedAwaitOptions, callback: Callback<any>): void {
    _awaitUrl(url, options, callback);
};

export function awaitKongAdapter(awaitOptions: WickedAwaitOptions, callback: Callback<any>): void {
    _awaitKongAdapter(awaitOptions, callback);
};

// exports.awaitKongOAuth2 = function (awaitOptions, callback) {
//     awaitKongOAuth2(awaitOptions, callback);
// };

// ======= INFORMATION RETRIEVAL =======

export function getGlobals(): WickedGlobals {
    return _getGlobals();
};

export function getConfigHash(): string {
    return _getConfigHash();
};

export function getSchema(): string {
    return _getSchema();
};

export function getExternalPortalHost(): string {
    return _getExternalPortalHost();
};

export function getExternalPortalUrl(): string {
    return _getExternalPortalUrl();
};

export function getExternalApiHost(): string {
    return _getExternalGatewayHost();
};

export function getExternalApiUrl(): string {
    return _getExternalGatewayUrl();
};

export function getInternalApiUrl(): string {
    return _getInternalApiUrl();
};

export function getPortalApiScope(): string {
    return _getPortalApiScope();
};

export function getInternalKongAdminUrl(): string {
    return _getInternalKongAdminUrl();
};

export function getInternalKongAdapterUrl(): string {
    return _getInternalKongAdapterUrl();
};

export function getInternalChatbotUrl(): string {
    return _getInternalChatbotUrl();
};

export function getInternalMailerUrl(): string {
    return _getInternalMailerUrl();
};

export function getInternalUrl(globalSettingsProperty: string): string {
    return _getInternalUrl(globalSettingsProperty, null, 0);
};

// ======= API FUNCTIONALITY =======

export function apiGet(urlPath: string, userIdOrCallback, callback): void {
    let userId = userIdOrCallback;
    if (!callback && typeof (userIdOrCallback) === 'function') {
        callback = userIdOrCallback;
        userId = null;
    }
    _apiGet(urlPath, userId, null, callback);
};

export function apiPost(urlPath: string, postBody: object, userIdOrCallback, callback): void {
    let userId = userIdOrCallback;
    if (!callback && typeof (userIdOrCallback) === 'function') {
        callback = userIdOrCallback;
        userId = null;
    }
    _apiPost(urlPath, postBody, userId, callback);
};

export function apiPut(urlPath: string, putBody: object, userIdOrCallback, callback): void {
    let userId = userIdOrCallback;
    if (!callback && typeof (userIdOrCallback) === 'function') {
        callback = userIdOrCallback;
        userId = null;
    }
    _apiPut(urlPath, putBody, userId, callback);
};

export function apiPatch(urlPath: string, patchBody: object, userIdOrCallback, callback): void {
    let userId = userIdOrCallback;
    if (!callback && typeof (userIdOrCallback) === 'function') {
        callback = userIdOrCallback;
        userId = null;
    }
    _apiPatch(urlPath, patchBody, userId, callback);
};

export function apiDelete(urlPath: string, userIdOrCallback, callback): void {
    let userId = userIdOrCallback;
    if (!callback && typeof (userIdOrCallback) === 'function') {
        callback = userIdOrCallback;
        userId = null;
    }
    _apiDelete(urlPath, userId, callback);
};

// ======= API CONVENIENCE FUNCTIONS =======

// APIS

export function getApis(callback: Callback<WickedApiCollection>): void {
    getApisAs(null, callback);
}

export function getApisAs(asUserId: string, callback: Callback<WickedApiCollection>): void {
    apiGet('apis', asUserId, callback);
}

export function getApisDescription(callback: Callback<string>): void {
    getApisDescriptionAs(null, callback);
}

export function getApisDescriptionAs(asUserId: string, callback: Callback<string>): void {
    apiGet(`apis/desc`, asUserId, callback);
}

export function getApi(apiId: string, callback: Callback<WickedApi>): void {
    getApiAs(apiId, null, callback);
}

export function getApiAs(apiId: string, asUserId: string, callback: Callback<WickedApi>): void {
    apiGet(`apis/${apiId}`, asUserId, callback);
}

export function getApiDescription(apiId: string, callback: Callback<string>): void {
    getApiDescriptionAs(apiId, null, callback);
}

export function getApiDescriptionAs(apiId: string, asUserId: string, callback: Callback<string>): void {
    apiGet(`apis/${apiId}/desc`, asUserId, callback);
}

export function getApiConfig(apiId: string, callback: Callback<any>): void {
    getApiConfigAs(apiId, null, callback);
}

export function getApiConfigAs(apiId: string, asUserId: string, callback: Callback<any>): void {
    apiGet(`apis/${apiId}/config`, asUserId, callback);
}

export function getApiSwagger(apiId: string, callback: Callback<object>): void {
    getApiSwaggerAs(apiId, null, callback);
}

export function getApiSwaggerAs(apiId: string, asUserId: string, callback: Callback<object>): void {
    apiGet(`apis/${apiId}/swagger`, asUserId, callback);
}

export function getApiSubscriptions(apiId: string, callback: Callback<WickedCollection<WickedSubscription>>): void {
    getApiSubscriptionsAs(apiId, null, callback);
}

export function getApiSubscriptionsAs(apiId: string, asUserId: string, callback: Callback<WickedCollection<WickedSubscription>>): void {
    apiGet(`apis/${apiId}/subscriptions`, asUserId, callback);
}

// PLANS

export function getApiPlans(apiId: string, callback: Callback<WickedApiPlan[]>): void {
    getApiPlansAs(apiId, null, callback);
}

export function getApiPlansAs(apiId: string, asUserId: string, callback: Callback<WickedApiPlan[]>): void {
    apiGet(`apis/${apiId}/plans`, asUserId, callback);
}

export function getPlans(callback: Callback<WickedApiPlanCollection>): void {
    apiGet('plans', null, callback);
}

// GROUPS

export function getGroups(callback: Callback<WickedGroupCollection>): void {
    apiGet('groups', null, callback);
}

// USERS

export function getUserByCustomId(customId: string, callback: Callback<WickedUserShortInfo[]>): void {
    apiGet(`users?customId=${qs.escape(customId)}`, null, callback);
}

export function getUserByEmail(email: string, callback: Callback<WickedUserShortInfo[]>): void {
    apiGet(`users?email=${qs.escape(email)}`, null, callback);
}

export function getUsers(options: WickedGetOptions, callback: Callback<WickedUserShortInfo[]>): void {
    getUsersAs(options, null, callback);
}

export function getUsersAs(options: WickedGetOptions, asUserId: string, callback: Callback<WickedUserShortInfo[]>): void {
    let o = validateGetOptions(options);
    let url = buildUrl('users', o);
    apiGet(url, asUserId, callback);
}

export function createUser(userCreateInfo: WickedUserCreateInfo, callback: Callback<WickedUserInfo>): void {
    createUserAs(userCreateInfo, null, callback);
}

export function createUserAs(userCreateInfo: WickedUserCreateInfo, asUserId: string, callback: Callback<WickedUserInfo>): void {
    apiPost('users', userCreateInfo, asUserId, callback);
}

export function getUser(userId: string, callback: Callback<WickedUserInfo>): void {
    getUserAs(userId, null, callback);
}

export function getUserAs(userId: string, asUserId: string, callback: Callback<WickedUserInfo>): void {
    apiGet(`users/${userId}`, asUserId, callback);
}

export function deleteUserPassword(userId: string, callback: ErrorCallback): void {
    deleteUserPasswordAs(userId, null, callback);
}

export function deleteUserPasswordAs(userId: string, asUserId: string, callback: ErrorCallback): void {
    apiDelete(`users/${userId}/password`, asUserId, callback);
}

// APPLICATIONS

export function getApplications(options: WickedGetCollectionOptions, callback: Callback<WickedCollection<WickedApplication>>): void {
    getApplicationsAs(options, null, callback);
}

export function getApplicationsAs(options: WickedGetCollectionOptions, asUserId: string, callback: Callback<WickedCollection<WickedApplication>>): void {
    const o = validateGetCollectionOptions(options);
    const url = buildUrl('applications', o);
    apiGet(url, asUserId, callback);
}

export function createApplication(appCreateInfo: WickedApplicationCreateInfo, callback: Callback<WickedApplication>): void {
    createApplicationAs(appCreateInfo, null, callback);
}

export function createApplicationAs(appCreateInfo: WickedApplicationCreateInfo, asUserId: string, callback: Callback<WickedApplication>): void {
    apiPost('applications', appCreateInfo, asUserId, callback);
}

export function getApplicationRoles(callback: Callback<WickedApplicationRole[]>): void {
    apiGet('applications/roles', null, callback);
}

export function getApplication(appId: string, callback: Callback<WickedApplication>): void {
    getApplicationAs(appId, null, callback);
}

export function getApplicationAs(appId: string, asUserId: string, callback: Callback<WickedApplication>): void {
    apiGet(`applications/${appId}`, asUserId, callback);
}

export function patchApplication(appId: string, appPatchInfo: WickedApplicationCreateInfo, callback: Callback<WickedApplication>): void {
    patchApplicationAs(appId, appPatchInfo, null, callback);
}

export function patchApplicationAs(appId: string, appPatchInfo: WickedApplicationCreateInfo, asUserId: string, callback: Callback<WickedApplication>): void {
    apiPatch(`applications/${appId}`, appPatchInfo, asUserId, callback);
}

export function deleteApplication(appId: string, callback: ErrorCallback): void {
    deleteApplicationAs(appId, null, callback);
}

export function deleteApplicationAs(appId: string, asUserId: string, callback: ErrorCallback): void {
    apiDelete(`applications/${appId}`, asUserId, callback);
}

export function addApplicationOwner(appId: string, email: string, role: WickedApplicationRoleType, callback: Callback<WickedApplication>): void {
    addApplicationOwnerAs(appId, email, role, null, callback);
}

export function addApplicationOwnerAs(appId: string, email: string, role: WickedApplicationRoleType, asUserId: string, callback: Callback<WickedApplication>): void {
    const body = {
        email: email,
        role: role
    };
    apiPost(`applications/${appId}/owners`, body, asUserId, callback);
}

export function deleteApplicationOwner(appId: string, email: string, callback: Callback<WickedApplication>): void {
    deleteApplicationOwnerAs(appId, email, null, callback);
}

export function deleteApplicationOwnerAs(appId: string, email: string, asUserId: string, callback: Callback<WickedApplication>): void {
    apiDelete(`applications/${appId}/owners?email=${qs.escape(email)}`, asUserId, callback);
}

// SUBSCRIPTIONS

export function getSubscriptions(appId: string, callback: Callback<WickedSubscription[]>): void {
    getSubscriptionsAs(appId, null, callback);
}

export function getSubscriptionsAs(appId: string, asUserId: string, callback: Callback<WickedSubscription[]>): void {
    apiGet(`applications/${appId}/subscriptions`, asUserId, callback);
}

export function getSubscriptionByClientId(clientId: string, apiId: string, callback: Callback<WickedSubscriptionInfo>): void {
    getSubscriptionByClientIdAs(clientId, apiId, null, callback);
}

export function getSubscriptionByClientIdAs(clientId: string, apiId: string, asUserId: string, callback: Callback<WickedSubscriptionInfo>): void {
    _getSubscriptionByClientId(clientId, apiId, asUserId, callback);
}

export function createSubscription(appId: string, subsCreateInfo: WickedSubscriptionCreateInfo, callback: Callback<WickedSubscription>): void {
    createSubscriptionAs(appId, subsCreateInfo, null, callback);
}

export function createSubscriptionAs(appId: string, subsCreateInfo: WickedSubscriptionCreateInfo, asUserId: string, callback: Callback<WickedSubscription>): void {
    apiPost(`applications/${appId}/subscriptions`, subsCreateInfo, asUserId, callback);
}

export function getSubscription(appId: string, apiId: string, callback: Callback<WickedSubscription>): void {
    getSubscriptionAs(appId, apiId, null, callback);
}

export function getSubscriptionAs(appId: string, apiId: string, asUserId: string, callback: Callback<WickedSubscription>): void {
    apiGet(`applications/${appId}/subscriptions/${apiId}`, asUserId, callback);
}

export function patchSubscription(appId: string, apiId: string, patchInfo: WickedSubscriptionPatchInfo, callback: Callback<WickedSubscription>): void {
    patchSubscriptionAs(appId, apiId, patchInfo, null, callback);
}

export function patchSubscriptionAs(appId: string, apiId: string, patchInfo: WickedSubscriptionPatchInfo, asUserId: string, callback: Callback<WickedSubscription>): void {
    apiPatch(`applications/${appId}/apis/${apiId}`, patchInfo, asUserId, callback);
}

// APPROVALS

export function getApprovals(callback: Callback<WickedApproval[]>): void {
    getApprovalsAs(null, callback);
}

export function getApprovalsAs(asUserId: string, callback: Callback<WickedApproval[]>): void {
    apiGet('approvals', asUserId, callback);
}

export function getApproval(approvalId: string, callback: Callback<WickedApproval>): void {
    getApprovalAs(approvalId, null, callback);
}

export function getApprovalAs(approvalId: string, asUserId: string, callback: Callback<WickedApproval>): void {
    apiGet(`approvals/${approvalId}`, asUserId, callback);
}

// VERIFICATIONS

export function createVerification(verification: WickedVerification, callback: ErrorCallback): void {
    createVerificationAs(verification, null, callback);
}

export function createVerificationAs(verification: WickedVerification, asUserId: string, callback: ErrorCallback): void {
    apiPost('verifications', verification, asUserId, callback);
}

export function getVerifications(callback: Callback<WickedVerification[]>): void {
    getVerificationsAs(null, callback);
}

export function getVerificationsAs(asUserId: string, callback: Callback<WickedVerification[]>): void {
    apiGet('verificaations', asUserId, callback);
}

export function getVerification(verificationId, callback: Callback<WickedVerification>): void {
    getVerificationAs(verificationId, null, callback);
}

export function getVerificationAs(verificationId, asUserId: string, callback: Callback<WickedVerification>): void {
    apiGet(`verifications/${verificationId}`, asUserId, callback);
}

export function deleteVerification(verificationId: string, callback: ErrorCallback): void {
    deleteVerificationAs(verificationId, null, callback);
}

export function deleteVerificationAs(verificationId: string, asUserId: string, callback: ErrorCallback): void {
    apiDelete(`verifications/${verificationId}`, asUserId, callback);
}

// SYSTEM HEALTH

export function getSystemHealth(callback: Callback<WickedComponentHealth[]>): void {
    getSystemHealthAs(null, callback);
}

export function getSystemHealthAs(asUserId: string, callback: Callback<WickedComponentHealth[]>): void {
    apiGet('systemhealth', asUserId, callback);
}

// TEMPLATES

export function getChatbotTemplates(callback: Callback<WickedChatbotTemplates>): void {
    getChatbotTemplatesAs(null, callback);
}

export function getChatbotTemplatesAs(asUserId: string, callback: Callback<WickedChatbotTemplates>): void {
    apiGet('templates/chatbot', asUserId, callback);
}

export function getEmailTemplate(templateId: WickedEmailTemplateType, callback: Callback<string>): void {
    getEmailTemplateAs(templateId, null, callback);
}

export function getEmailTemplateAs(templateId: WickedEmailTemplateType, asUserId: string, callback: Callback<string>): void {
    apiGet(`templates/email/${templateId}`, asUserId, callback);
}

// AUTH-SERVERS

export function getAuthServerNames(callback: Callback<string[]>): void {
    getAuthServerNamesAs(null, callback);
}

export function getAuthServerNamesAs(asUserId: string, callback: Callback<string[]>): void {
    apiGet('auth-servers', asUserId, callback);
}

export function getAuthServer(serverId: string, callback: Callback<WickedAuthServer>): void {
    getAuthServerAs(serverId, null, callback);
}

export function getAuthServerAs(serverId: string, asUserId: string, callback: Callback<WickedAuthServer>): void {
    apiGet(`auth-servers/${serverId}`, asUserId, callback);
}

// WEBHOOKS

export function getWebhookListeners(callback: Callback<WickedWebhookListener[]>): void {
    getWebhookListenersAs(null, callback);
}

export function getWebhookListenersAs(asUserId: string, callback: Callback<WickedWebhookListener[]>): void {
    apiGet('webhooks/listeners', asUserId, callback);
}

export function upsertWebhookListener(listenerId: string, listener: WickedWebhookListener, callback: ErrorCallback): void {
    upsertWebhookListenerAs(listenerId, listener, null, callback);
}

export function upsertWebhookListenerAs(listenerId: string, listener: WickedWebhookListener, asUserId: string, callback: ErrorCallback): void {
    apiPut(`webhooks/listeners/${listenerId}`, listener, asUserId, callback);
}

export function deleteWebhookListener(listenerId: string, callback: ErrorCallback): void {
    deleteWebhookListenerAs(listenerId, null, callback);
}

export function deleteWebhookListenerAs(listenerId: string, asUserId: string, callback: ErrorCallback): void {
    apiDelete(`webhooks/listeners/${listenerId}`, asUserId, callback);
}

export function getWebhookEvents(listenerId: string, callback: Callback<WickedEvent[]>): void {
    getWebhookEventsAs(listenerId, null, callback);
}

export function getWebhookEventsAs(listenerId: string, asUserId: string, callback: Callback<WickedEvent[]>): void {
    apiGet(`webhooks/events/${listenerId}`, asUserId, callback);
}

export function flushWebhookEvents(listenerId: string, callback: ErrorCallback): void {
    flushWebhookEventsAs(listenerId, null, callback);
}

export function flushWebhookEventsAs(listenerId: string, asUserId: string, callback: ErrorCallback): void {
    apiDelete(`webhooks/events/${listenerId}`, asUserId, callback);
}

export function deleteWebhookEvent(listenerId: string, eventId: string, callback: ErrorCallback): void {
    deleteWebhookEventAs(listenerId, eventId, null, callback);
}

export function deleteWebhookEventAs(listenerId: string, eventId: string, asUserId: string, callback: ErrorCallback): void {
    apiDelete(`webhooks/events/${listenerId}/${eventId}`, asUserId, callback);
}

// REGISTRATION POOLS

export function getRegistrationPools(callback: Callback<WickedPoolMap>): void {
    getRegistrationPoolsAs(null, callback);
}

export function getRegistrationPoolsAs(asUserId: string, callback: Callback<WickedPoolMap>): void {
    apiGet('pools', asUserId, callback);
}

export function getRegistrationPool(poolId: string, callback: Callback<WickedPool>): void {
    getRegistrationPoolAs(poolId, null, callback);
}

export function getRegistrationPoolAs(poolId: string, asUserId: string, callback: Callback<WickedPool>): void {
    apiGet(`pools/${poolId}`, asUserId, callback);
}

// NAMESPACES

export function getPoolNamespaces(poolId: string, options: WickedGetCollectionOptions, callback: Callback<WickedCollection<WickedNamespace>>): void {
    getPoolNamespacesAs(poolId, options, null, callback);
}

export function getPoolNamespacesAs(poolId: string, options: WickedGetCollectionOptions, asUserId: string, callback: Callback<WickedCollection<WickedNamespace>>): void {
    const o = validateGetCollectionOptions(options);
    const url = buildUrl(`pools/${poolId}/namespaces`, options);
    apiGet(url, asUserId, callback);
}

export function getPoolNamespace(poolId: string, namespaceId: string, callback: Callback<WickedNamespace>): void {
    getPoolNamespaceAs(poolId, namespaceId, null, callback);
}

export function getPoolNamespaceAs(poolId: string, namespaceId: string, asUserId: string, callback: Callback<WickedNamespace>): void {
    apiGet(`pools/${poolId}/namespaces/${namespaceId}`, asUserId, callback);
}

export function upsertPoolNamespace(poolId: string, namespaceId: string, namespaceInfo: WickedNamespace, callback: ErrorCallback): void {
    upsertPoolNamespaceAs(poolId, namespaceId, namespaceInfo, null, callback);
}

export function upsertPoolNamespaceAs(poolId: string, namespaceId: string, namespaceInfo: WickedNamespace, asUserId: string, callback: ErrorCallback): void {
    apiPut(`pools/${poolId}/namespaces/${namespaceId}`, namespaceInfo, asUserId, callback);
}

export function deletePoolNamespace(poolId: string, namespaceId: string, callback: ErrorCallback): void {
    deletePoolNamespaceAs(poolId, namespaceId, null, callback);
}

export function deletePoolNamespaceAs(poolId: string, namespaceId: string, asUserId: string, callback: ErrorCallback): void {
    apiDelete(`pools/${poolId}/namespaces/${namespaceId}`, asUserId, callback);
}

// REGISTRATIONS

export function getPoolRegistrations(poolId: string, options: WickedGetRegistrationOptions, callback: Callback<WickedCollection<WickedRegistration>>): void {
    getPoolRegistrationsAs(poolId, options, null, callback);
}

export function getPoolRegistrationsAs(poolId: string, options: WickedGetRegistrationOptions, asUserId: string, callback: Callback<WickedCollection<WickedRegistration>>): void {
    const o = validateGetCollectionOptions(options) as WickedGetRegistrationOptions;
    if (options.namespace)
        o.namespace = options.namespace;
    const url = buildUrl(`registrations/pools/${poolId}`, o);
    apiGet(url, asUserId, callback);
}

export function getUserRegistrations(poolId: string, userId: string, callback: Callback<WickedCollection<WickedRegistration>>): void {
    getUserRegistrationsAs(poolId, userId, null, callback);
}

export function getUserRegistrationsAs(poolId: string, userId: string, asUserId: string, callback: Callback<WickedCollection<WickedRegistration>>): void {
    apiGet(`registrations/pools/${poolId}/users/${userId}`, asUserId, callback);
}

export function upsertUserRegistration(poolId: string, userId: string, userRegistration: WickedRegistration, callback: ErrorCallback): void {
    upsertUserRegistrationAs(poolId, userId, userRegistration, null, callback);
}

export function upsertUserRegistrationAs(poolId: string, userId: string, userRegistration: WickedRegistration, asUserId: string, callback: ErrorCallback): void {
    apiPut(`registrations/pools/${poolId}/users/${userId}`, userRegistration, asUserId, callback);
}

export function deleteUserRegistration(poolId: string, userId: string, namespaceId: string, callback: ErrorCallback): void {
    deleteUserRegistrationAs(poolId, userId, namespaceId, null, callback);
}

export function deleteUserRegistrationAs(poolId: string, userId: string, namespaceId: string, asUserId: string, callback: ErrorCallback): void {
    const o = {} as any;
    if (namespaceId)
        o.namespace = namespaceId;
    const url = buildUrl(`registrations/pools/${poolId}/users/${userId}`, o);
    apiDelete(url, asUserId, callback);
}

export function getAllUserRegistrations(userId: string, callback: Callback<WickedRegistrationMap>): void {
    getAllUserRegistrationsAs(userId, null, callback);
}

export function getAllUserRegistrationsAs(userId: string, asUserId: string, callback: Callback<WickedRegistrationMap>): void {
    apiGet(`registrations/users/${userId}`, asUserId, callback);
}

// GRANTS

export function getUserGrants(userId: string, options: WickedGetOptions, callback: Callback<WickedCollection<WickedGrant>>): void {
    getUserGrantsAs(userId, options, null, callback);
}

export function getUserGrantsAs(userId: string, options: WickedGetOptions, asUserId: string, callback: Callback<WickedCollection<WickedGrant>>): void {
    const o = validateGetOptions(options);
    const url = buildUrl(`grants/${userId}`, o);
    apiGet(url, asUserId, callback);
}

export function deleteAllUserGrants(userId: string, callback: ErrorCallback): void {
    deleteAllUserGrantsAs(userId, null, callback);
}

export function deleteAllUserGrantsAs(userId: string, asUserId: string, callback: ErrorCallback): void {
    apiDelete(`grants/${userId}`, asUserId, callback);
}

export function getUserGrant(userId: string, applicationId: string, apiId: string, callback: Callback<WickedGrant>): void {
    getUserGrantAs(userId, applicationId, apiId, null, callback);
}

export function getUserGrantAs(userId: string, applicationId: string, apiId: string, asUserId: string, callback: Callback<WickedGrant>): void {
    apiGet(`grants/${userId}/applications/${applicationId}/apis/${apiId}`, asUserId, callback);
}

export function upsertUserGrant(userId: string, applicationId: string, apiId: string, grantInfo: WickedGrant, callback: ErrorCallback): void {
    upsertUserGrantAs(userId, applicationId, apiId, grantInfo, null, callback);
}

export function upsertUserGrantAs(userId: string, applicationId: string, apiId: string, grantInfo: WickedGrant, asUserId: string, callback: ErrorCallback): void {
    apiPut(`grants/${userId}/applications/${applicationId}/apis/${apiId}`, grantInfo, asUserId, callback);
}

export function deleteUserGrant(userId: string, applicationId: string, apiId: string, callback: ErrorCallback): void {
    deleteUserGrantAs(userId, applicationId, apiId, null, callback);
}

export function deleteUserGrantAs(userId: string, applicationId: string, apiId: string, asUserId: string, callback: ErrorCallback): void {
    apiDelete(`grants/${userId}/applications/${applicationId}/apis/${apiId}`, asUserId, callback);
}

// ======= CORRELATION ID HANDLER =======

export function correlationIdHandler(): ExpressHandler {
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
}

// ======= IMPLEMENTATION ======

function _initialize(options: WickedInitOptions, callback: Callback<WickedGlobals>): void {
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
    _awaitUrl(apiUrl + 'ping', options, function (err, pingResult) {
        if (err) {
            debug('awaitUrl returned an error:');
            debug(err);
            return callback(err);
        }

        debug('Ping result:');
        debug(pingResult);
        const pingJson = getJson(pingResult);
        if (pingJson.version) {
            // The version field is not filled until wicked 0.12.0
            wickedStorage.apiVersion = pingJson.version;
            wickedStorage.isV012OrHigher = true;
            if (pingJson.version >= '1.0.0') {
                wickedStorage.isV100OrHigher = true;
            }
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

function validateGetOptions(options: WickedGetOptions): WickedGetOptions {
    const o = {} as WickedGetOptions;
    if (options) {
        if (options.offset)
            o.offset = options.offset;
        if (options.limit)
            o.limit = options.limit;
    }
    return o;
}

function validateGetCollectionOptions(options: WickedGetCollectionOptions): WickedGetCollectionOptions {
    const o = {} as WickedGetCollectionOptions;
    if (options) {
        if (options.filter)
            o.filter = options.filter;
        if (options.offset)
            o.offset = options.offset;
        if (options.limit)
            o.limit = options.limit;
        if (options.order_by)
            o.order_by = options.order_by;
        if (options.no_cache)
            o.no_cache = options.no_cache;
    }
    return o;
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

function _isDevelopmentMode() {
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

function _awaitUrl(url: string, options: WickedAwaitOptions, callback: Callback<any>) {
    debug('awaitUrl(): ' + url);
    if (!callback && (typeof (options) === 'function')) {
        callback = options;
        options = null;
    }
    // Copy the settings from the defaults; otherwise we'd change them haphazardly
    const awaitOptions: WickedAwaitOptions = {
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

function _awaitKongAdapter(awaitOptions, callback) {
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

    const adapterPingUrl = _getInternalKongAdapterUrl() + 'ping';
    _awaitUrl(adapterPingUrl, awaitOptions, function (err, body) {
        if (err)
            return callback(err);
        wickedStorage.kongAdapterInitialized = true;
        return callback(null, body);
    });
}

function _initMachineUser(serviceId: string, callback: ErrorCallback) {
    debug('initMachineUser()');
    checkInitialized('initMachineUser');
    retrieveOrCreateMachineUser(serviceId, (err, _) => {
        if (err)
            return callback(err);
        // wickedStorage.machineUserId has been filled now;
        // now we want to retrieve the API scopes of portal-api.
        return initPortalApiScopes(callback);
    });
}

function retrieveOrCreateMachineUser(serviceId: string, callback: Callback<WickedUserInfo>) {
    debug('retrieveOrCreateMachineUser()');
    if (!/^[a-zA-Z\-_0-9]+$/.test(serviceId))
        return callback(new Error('Invalid Service ID, must only contain a-z, A-Z, 0-9, - and _.'));

    const customId = makeMachineUserCustomId(serviceId);
    _apiGet('users?customId=' + qs.escape(customId), null, 'read_users', function (err, userInfo) {
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
        storeMachineUser(userInfo);
        return callback(null, userInfo);
    });
}

function storeMachineUser(userInfo) {
    debug('Machine user info:');
    debug(userInfo);
    debug('Setting machine user id: ' + userInfo.id);
    wickedStorage.machineUserId = userInfo.id;
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
    _apiPost('users/machine', userInfo, null, function (err, userInfo) {
        if (err)
            return callback(err);
        storeMachineUser(userInfo);
        return callback(null, userInfo);
    });
}

function initPortalApiScopes(callback) {
    debug('initPortalApiScopes()');
    if (!wickedStorage.machineUserId)
        return callback(new Error('initPortalApiScopes: Machine user id not initialized.'));
    _apiGet('apis/portal-api', null, 'read_apis', (err, apiInfo) => {
        if (err)
            return callback(err);
        debug(apiInfo);
        if (!apiInfo.settings)
            return callback(new Error('initPortalApiScope: Property settings not found.'));
        if (!apiInfo.settings.scopes)
            return callback(new Error('initPortalApiScope: Property settings.scopes not found.'));
        const scopeList = [];
        for (let scope in apiInfo.settings.scopes) {
            scopeList.push(scope);
        }
        wickedStorage.portalApiScope = scopeList.join(' ');
        debug(`initPortalApiScopes: Full API Scope: "${wickedStorage.portalApiScope}"`);
        return callback(null);
    });
}

function _getGlobals() {
    debug('getGlobals()');
    checkInitialized('getGlobals');

    return wickedStorage.globals;
}

function _getConfigHash() {
    debug('getConfigHash()');
    checkInitialized('getConfigHash');

    return wickedStorage.configHash;
}

function _getExternalPortalHost() {
    debug('getExternalPortalHost()');
    checkInitialized('getExternalPortalHost');

    return checkNoSlash(getPortalHost());
}

function _getExternalPortalUrl() {
    debug('getExternalPortalUrl()');
    checkInitialized('getExternalPortalUrl');

    return checkSlash(_getSchema() + '://' + getPortalHost());
}

function _getExternalGatewayHost() {
    debug('getExternalGatewayHost()');
    checkInitialized('getExternalGatewayHost()');

    return checkNoSlash(getApiHost());
}

function _getExternalGatewayUrl() {
    debug('getExternalGatewayUrl()');
    checkInitialized('getExternalGatewayUrl');

    return checkSlash(_getSchema() + '://' + getApiHost());
}

function _getInternalApiUrl() {
    debug('getInternalApiUrl()');
    checkInitialized('getInternalApiUrl');

    return checkSlash(wickedStorage.apiUrl);
}

function _getPortalApiScope() {
    debug('getPortalApiScope()');
    checkInitialized('getPortalApiScope');

    if (wickedStorage.isV100OrHigher && wickedStorage.portalApiScope)
        return wickedStorage.portalApiScope;
    debug('WARNING: portalApiScope is not defined, or wicked API is <1.0.0');
    return '';
}

function _getInternalKongAdminUrl() {
    debug('getInternalKongAdminUrl()');
    checkInitialized('getInternalKongAdminUrl');

    return _getInternalUrl('kongAdminUrl', 'kong', 8001);
}

function _getInternalMailerUrl() {
    debug('getInternalMailerUrl');
    checkInitialized('getInternalMailerUrl');

    return _getInternalUrl('mailerUrl', 'portal-mailer', 3003);
}

function _getInternalChatbotUrl() {
    debug('getInternalChatbotUrl()');
    checkInitialized('getInternalChatbotUrl');

    return _getInternalUrl('chatbotUrl', 'portal-chatbot', 3004);
}

function _getInternalKongAdapterUrl() {
    debug('getInternalKongAdapterUrl()');
    checkInitialized('getInternalKongAdapterUrl');

    return _getInternalUrl('kongAdapterUrl', 'portal-kong-adapter', 3002);
}

function _getInternalKongOAuth2Url() {
    debug('getInternalKongOAuth2Url()');
    checkInitialized('getInternalKongOAuth2Url');

    return _getInternalUrl('kongOAuth2Url', 'portal-kong-oauth2', 3006);
}

function _getInternalUrl(globalSettingsProperty: string, defaultHost: string, defaultPort: number) {
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

function checkNoSlash(someUrl) {
    if (someUrl.endsWith('/'))
        return someUrl.substring(0, someUrl.length - 1);
    return someUrl;
}

function _getSchema() {
    checkInitialized('getSchema');
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
    // Are we not running containerized? Then guess we're in local development mode.
    if (!isContainerized) {
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
    if (typeof ob === "string")
        return JSON.parse(ob);
    return ob;
}

function getText(ob) {
    if (ob instanceof String || typeof ob === "string")
        return ob;
    return JSON.stringify(ob, null, 2);
}

function _apiGet(urlPath, userId, scope, callback) {
    debug('apiGet(): ' + urlPath);
    checkInitialized('apiGet');
    if (arguments.length !== 4)
        throw new Error('apiGet was called with wrong number of arguments');

    apiAction('GET', urlPath, null, userId, scope, callback);
}

function _apiPost(urlPath, postBody, userId, callback) {
    debug('apiPost(): ' + urlPath);
    checkInitialized('apiPost');
    if (arguments.length !== 4)
        throw new Error('apiPost was called with wrong number of arguments');

    apiAction('POST', urlPath, postBody, userId, null, callback);
}

function _apiPut(urlPath, putBody, userId, callback) {
    debug('apiPut(): ' + urlPath);
    checkInitialized('apiPut');
    if (arguments.length !== 4)
        throw new Error('apiPut was called with wrong number of arguments');

    apiAction('PUT', urlPath, putBody, userId, null, callback);
}

function _apiPatch(urlPath, patchBody, userId, callback) {
    debug('apiPatch(): ' + urlPath);
    checkInitialized('apiPatch');
    if (arguments.length !== 4)
        throw new Error('apiPatch was called with wrong number of arguments');

    apiAction('PATCH', urlPath, patchBody, userId, null, callback);
}

function _apiDelete(urlPath, userId, callback) {
    debug('apiDelete(): ' + urlPath);
    checkInitialized('apiDelete');
    if (arguments.length !== 3)
        throw new Error('apiDelete was called with wrong number of arguments');

    apiAction('DELETE', urlPath, null, userId, null, callback);
}

function apiAction(method, urlPath, actionBody, userId, scope, callback) {
    debug('apiAction(' + method + '): ' + urlPath);
    if (arguments.length !== 6)
        throw new Error('apiAction called with wrong number of arguments');
    if (typeof (callback) !== 'function')
        throw new Error('apiAction: callback is not a function');

    if (!wickedStorage.apiReachable)
        return callback(new Error('The wicked API is currently not reachable. Try again later.'));
    if (wickedStorage.pendingExit)
        return callback(new Error('A shutdown due to changed configuration is pending.'));

    if (!scope) {
        if (wickedStorage.portalApiScope)
            scope = wickedStorage.portalApiScope;
        else
            scope = '';
    }
    debug(`apiAction: Using scope ${scope}`);

    if (actionBody)
        debug(actionBody);

    if (!userId && wickedStorage.machineUserId) {
        debug('Picking up machine user id: ' + wickedStorage.machineUserId);
        userId = wickedStorage.machineUserId;
    }

    if (urlPath.startsWith('/'))
        urlPath = urlPath.substring(1); // strip slash in beginning; it's in the API url

    const url = _getInternalApiUrl() + urlPath;
    debug(method + ' ' + url);
    const reqInfo: RequestBody = {
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
    if (userId) {
        if (wickedStorage.isV012OrHigher) {
            reqInfo.headers['X-Authenticated-UserId'] = userId;
        } else {
            reqInfo.headers['X-UserId'] = userId;
        }
    }
    if (wickedStorage.isV100OrHigher) {
        reqInfo.headers['X-Authenticated-Scope'] = scope;
    }
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
            const err = new WickedError('api' + nice(method) + '() ' + urlPath + ' returned non-OK status code: ' + res.statusCode + ', check err.statusCode and err.body for details', res.statusCode, body);
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

function buildUrl(base, queryParams) {
    let url = base;
    let first = true;
    for (let p in queryParams) {
        if (first) {
            url += '?';
            first = false;
        } else {
            url += '&';
        }
        const v = queryParams[p];
        if (typeof v === 'number')
            url += v;
        else if (typeof v === 'string')
            url += qs.escape(v);
        else if (typeof v === 'boolean')
            url += v ? 'true' : 'false';
        else // Object or array or whatever
            url += qs.escape(JSON.stringify(v));
    }
    return url;
}


function _getSubscriptionByClientId(clientId: string, apiId: string, asUserId: string, callback: Callback<WickedSubscriptionInfo>): void {
    debug('getSubscriptionByClientId()');
    checkInitialized('getSubscriptionByClientId');

    // Validate format of clientId
    if (!/^[a-zA-Z0-9\-]+$/.test(clientId)) {
        return callback(new Error('Invalid client_id format.'));
    }

    // Check whether we know this client ID, otherwise we won't bother.
    _apiGet('subscriptions/' + qs.escape(clientId), asUserId, 'read_subscriptions', function (err, subsInfo) {
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
