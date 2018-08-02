'use strict';

import { KongPlugin, KongApi, KongApiConfig } from "./kong-interfaces";


// ====================
// WICKED TYPES
// ====================

/**
 * Options defining how wicked awaits an URL.
 */
export interface WickedAwaitOptions {
    /** The expected status code */
    statusCode?: number,
    /** Maximum number of retries until wicked gives up */
    maxTries?: number,
    /** Delay between retries (ms) */
    retryDelay?: number
}

/**
 * Initialization options for the wicked SDK.
 */
export interface WickedInitOptions extends WickedAwaitOptions {
    /** A user agent name; do not use the `wicked` prefix, otherwise a strict version check is enforced. */
    userAgentName: string,
    /** The version of your user agent. */
    userAgentVersion: string,
    /** Defaults to `false`; if `false`, the wicked SDK will poll the `/confighash` end point of the wicked API to check for updated static configuration; if such is detected, the SDK will force quit the component to make the assumed orchestrator restart it. */
    doNotPollConfigHash?: boolean
}

export interface WickedGlobals {
    /** The wicked static config version (written by the Kickstarter, don't change this) */
    version: number,
    title: string,
    footer: string,
    company: string,
    /** Group validated users are automatically assigned to */
    validatedUsergGroup?: string,
    /** Used to validate that the secret config key is correct */
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
    /**
     * Array of allowed auth methods for the portal login; in the form
     * `<auth server name>:<auth method name>`.
     *
     * Example: `["default:local", "default:google"]`
     */
    authMethods: string[]
}

export interface WickedKongAdapterConfig {
    useKongAdapter: boolean,
    /** List of Kong plugins which the Kong Adapter doesn't touch when configuring Kong */
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
    /** Specify the id of the user in case you are importing from a different system and
     * want to re-use the user IDs (for whatever reason).
     */
    id?: string,
    customId?: string,
    email: string,
    password?: string,
    /** Pass "true" if you are creating the user with a pre-hashed password; supported hashing mechanisms are:
     * - `bcrypt(password)`
     * - `bcrypt(SHA256(password))`
     */
    passwordIsHashed?: boolean,
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
    hide_credentials?: boolean,
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
    mandatory_scope?: boolean,
    accept_http_if_terminated?: boolean,
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
    /** This is a date time object */
    grantedDate?: string
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
    config: KongApiConfig
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
    trusted?: boolean,
}

export interface WickedSubscription extends WickedSubscriptionCreateInfo {
    clientId?: string,
    clientSecret?: string,
    approved: boolean,
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
    /** Disable interactive registration */
    disableRegister?: boolean,
    properties: WickedPoolProperty[]
}

export interface WickedPoolMap {
    [poolId: string]: WickedPool
}

export interface WickedRegistration {
    userId: string,
    poolId: string,
    namespace?: string,
    [key: string]: any
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
    /** Not needed when creating, is returned on retrieval */
    userId?: string,
    /** The fully qualified link to the verification page, with a placeholder for the ID (mustache {{id}}) */
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
    /** Deprecated */
    ImportFailed = 'failed',
    /** Deprecated */
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
    /** Deprecated */
    Export = 'export',
    /** Deprecated */
    Import = 'import'
}

// OPTION TYPES

/**
 * Generic parameters for paging collection output.
 */
export interface WickedGetOptions {
    /** The offset of the collection items to retrieve. Defaults to `0`. */
    offset?: number,
    /** The maximum number of items a get operation retrieves. Specify `0` to retrieve **all** elements. **Note**: This can be a dangerous operation, depending on the amount of data in your data store. */
    limit?: number
}

/**
 * Extended options for getting collections.
 */
export interface WickedGetCollectionOptions extends WickedGetOptions {
    /** 
     * Specify keys and values to filter for when retrieving information. The filtering is case insensitive, and
     * searches specifically only for substrings. This does (currently) **not** support wild card searches.
     * 
     * Example: `{ filter: { name: "herbert" }, order_by: "name ASC" }`
     */
    filter?: {
        [field: string]: string
    },
    /** Order by clause; syntax: `<field name> <ASC|DESC>`, e.g. `name DESC`. */
    order_by?: string,
    /** 
     * Specify `false` to make sure the paging return values (item count and such) are re-calculated. Otherwise
     * the wicked API makes use of a cached value for the item count for short amount of time. This option is
     * usually only used for integration testing, and does not play a role in application development.
     */
    no_cache?: boolean
}

/**
 * Extended get options for wicked registrations.
 */
export interface WickedGetRegistrationOptions extends WickedGetCollectionOptions {
    /**
     * The namespace for which to retrieve registrations. In case the registration pool requires
     * namespaces, this is a required option, otherwise it's a forbidden option. */
    namespace?: string
}

// ====================
// GENERICS
// ====================

/**
 * A wrapper interface for returning typed collections. Contains additional information
 * which is useful for paging UI scenarios.
 */
export interface WickedCollection<T> {
    items: T[],
    /** The total count of items, disregarding paging (limit and options). */
    count: number,
    /** Contains `true` if the total count (property `count`) was retrieved from the cache. */
    count_cached: boolean,
    /** The offset of the items which were retrieved, if specified, otherwise `0`. */
    offset: number,
    /** The maximum number of items in `items`, if specified, otherwise `0`. */
    limit: number
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

/**
 * For APIs which use the `passthroughScopeUrl` property, this is the type of the
 * payload which is sent by `POST` to the instance to which the scope decision is
 * delegated.
 */
export interface PassthroughScopeRequest {
    /** If `scope` was passed to the authorize request, the scope is passed on upstream by the Authorization Server. Otherwise `null` or not present. */
    scope?: string[],
    /** 
     * The OpenID Connect compatible profile of the authenticated user. You will find a unique ID in the `sub` property, 
     * plus other properties, depending on the type of identity provider which was used.
     */
    profile: OidcProfile
}

/**
 * This is the expected response type of a service which is used for APIs which have specified
 * the `passthroughScopeUrl` parameter. Mandatory properties are `allow` and `authenticated_userid`,
 * which must contain information on whether the operation is allowed and if so, which user id is
 * to be associated with the access token which is about to be created.
 */
export interface PassthroughScopeResponse {
    /** Return `true` to allow the operation to continue, otherwise `false`. */
    allow: boolean,
    /** In case `allow` contains `false`, it is recommended to return an error message stating "why" here. */
    error_message?: string,
    /** Specify which user id is passed as the `X-Authenticated-UserId` to the API backends when presenting the created access token. */
    authenticated_userid: string,
    /** An array of valid scopes for the API; please note that the list of scopes must be configured on the API, otherwise a subsequent error will be generated (by the API Gateway). */
    authenticated_scope?: string[]
}
