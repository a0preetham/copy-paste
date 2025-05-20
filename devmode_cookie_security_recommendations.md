# Cookie Security Recommendations for DEVMODE

This document provides advice regarding the security implications of cookie configurations when the application is operating in `DEVMODE`. In `DEVMODE`, certain cookie security flags (`HttpOnly` and `Secure`) are intentionally omitted to facilitate local development. While this can simplify testing, it's crucial to understand the associated risks and best practices.

## 1. Current Behavior in DEVMODE

The application's `getCookieValue` function, which sets the authentication cookie, behaves as follows:

```typescript
async function getCookieValue(env: Env, id: string) {
	const authToken = await generateAuthToken(env, id);
	if (env.DEVMODE) {
		// In DEVMODE: Secure and HttpOnly flags are OMITTED
		return `${AUTH_COOKIE_KEY}=${authToken}; path=/; Max-Age=3600; SameSite=Strict`
	} else {
		// In Production (not DEVMODE): Secure and HttpOnly flags are INCLUDED
		return `${AUTH_COOKIE_KEY}=${authToken}; path=/; Max-Age=3600; Secure; HttpOnly; SameSite=Strict`;
	}
}
```

As shown, when `env.DEVMODE` is true, the `Set-Cookie` header will not include the `HttpOnly` and `Secure` attributes.

## 2. Risks of Omitting `HttpOnly` in DEVMODE

The `HttpOnly` flag prevents client-side JavaScript from accessing the cookie.

*   **Risk:** If `HttpOnly` is omitted, and there is a Cross-Site Scripting (XSS) vulnerability anywhere in the application being developed, an attacker could potentially inject JavaScript that steals the authentication cookie (`auth`). Even in a local development environment, this stolen token could be used to impersonate the developer's session, potentially leading to unauthorized actions if the `DEVMODE` instance interacts with any sensitive local or remote resources.
*   **Recommendation:** Developers should be extremely cautious when `HttpOnly` is disabled. Be mindful of any third-party scripts or untested code introduced during development. If an XSS flaw is present, the auth token is vulnerable.

## 3. Risks and Behavior of Omitting `Secure` Flag in DEVMODE

The `Secure` flag ensures that the cookie is only transmitted over HTTPS connections.

*   **Reason for Omission in DEVMODE:** The `Secure` flag is typically omitted in `DEVMODE` to allow developers to test the application on a local development server running over plain HTTP (e.g., `http://localhost:xxxx`). If `Secure` were active, browsers would not send the cookie over HTTP, making local testing difficult without setting up HTTPS locally.
*   **Risk:** If `DEVMODE` is inadvertently used in a context that is not strictly local and private (e.g., a shared development server accessible over HTTP, or if a developer exposes their local server to the internet for testing with external webhooks without proper network controls), the authentication token could be transmitted unencrypted. This makes it vulnerable to interception by anyone on the same network (Man-in-the-Middle attack).
*   **Recommendation:**
    *   Ensure `DEVMODE` is used only for strictly local development on a trusted machine and network.
    *   If the local development environment supports HTTPS (see section 5), the `Secure` flag should be considered.

## 4. Recommendation for `HttpOnly` Flag in DEVMODE

**Strong Recommendation:** If your local development and debugging workflow **does not strictly require JavaScript to access the authentication cookie**, it is strongly recommended to **enable the `HttpOnly` flag even in `DEVMODE`**.

This can be achieved by modifying the `getCookieValue` function:

```typescript
// Option 1: Always HttpOnly
if (env.DEVMODE) {
    return `${AUTH_COOKIE_KEY}=${authToken}; path=/; Max-Age=3600; HttpOnly; SameSite=Strict`; // HttpOnly added
} else {
    // ...
}
```

*   **Conscious Decision:** If your development tooling or debugging practices *do* require JavaScript access to this specific cookie, this should be a conscious decision. Understand that you are trading off a layer of security for development convenience. In such cases, maintain heightened vigilance against XSS.

## 5. Recommendation for `Secure` Flag in DEVMODE

If your local development environment is configured to use HTTPS, the `Secure` flag should be enabled. Many modern local development tools, including `wrangler dev`, support HTTPS locally (e.g., via `wrangler dev --https` or by configuring `dev.server.https` in `wrangler.toml`).

*   **Recommendation:** When using HTTPS locally, enable the `Secure` flag. This can be done by:
    1.  **Modifying the condition:** If `DEVMODE` always implies HTTPS locally for your setup.
        ```typescript
        // Example: If DEVMODE implies local HTTPS
        if (env.DEVMODE) {
            return `${AUTH_COOKIE_KEY}=${authToken}; path=/; Max-Age=3600; Secure; HttpOnly; SameSite=Strict`;
        } else { // ... }
        ```
    2.  **Using a more granular check:** Introduce another environment variable or a more specific check if `DEVMODE` can be used with both HTTP and HTTPS locally.
        ```typescript
        // Example: Using an additional check for local HTTPS
        const useSecureCookie = env.LOCAL_HTTPS_ENABLED || !env.DEVMODE;
        let cookieString = `${AUTH_COOKIE_KEY}=${authToken}; path=/; Max-Age=3600; SameSite=Strict`;
        if (useSecureCookie) {
            cookieString += '; Secure';
        }
        if (!env.DEVMODE_ALLOW_JS_COOKIE_ACCESS) { // Example for HttpOnly
             cookieString += '; HttpOnly';
        }
        return cookieString;
        ```
        (This example also shows a more granular flag for `HttpOnly` for illustration).

This ensures that the cookie behaves more closely to the production environment and maintains security best practices even during development if the local setup supports it.

## 6. General Warning: `DEVMODE` is for Development Only

**Crucial Reminder:** Configurations specifically designed for `DEVMODE` (like omitting `Secure` and `HttpOnly` flags) are inherently less secure and are intended only for isolated, local development environments.

**Under no circumstances should `DEVMODE` configurations, or the `DEVMODE` flag itself being true, be deployed to a staging, testing (shared), or production environment.** Doing so would expose your application and its users to significant and unnecessary security risks. Always ensure that production deployments use the most secure settings, including `HttpOnly` and `Secure` flags for sensitive cookies.

Regularly review and audit your deployment processes to prevent accidental deployment of development configurations.
---

This document aims to help developers make informed decisions about cookie security when working in `DEVMODE`. Prioritize security, even in local environments, and understand the trade-offs of any relaxed security settings.
