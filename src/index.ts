import { DurableObject } from 'cloudflare:workers';
import { createMergeableStore, Id, IdAddedOrRemoved } from 'tinybase';
import { createDurableObjectStoragePersister } from 'tinybase/persisters/persister-durable-object-storage';
import { getWsServerDurableObjectFetch, WsServerDurableObject } from 'tinybase/synchronizers/synchronizer-ws-server-durable-object';
import * as jose from 'jose';
import { nanoid } from 'nanoid';

const AUTH_COOKIE_KEY = 'auth'

export class SyncObject extends WsServerDurableObject {
	onPathId(pathId: Id, addedOrRemoved: IdAddedOrRemoved) {
		console.info((addedOrRemoved ? 'Added' : 'Removed') + ` path ${pathId}`);
	}

	onClientId(pathId: Id, clientId: Id, addedOrRemoved: IdAddedOrRemoved) {
		console.info((addedOrRemoved ? 'Added' : 'Removed') + ` client ${clientId} on path ${pathId}`);
	}
}

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);
		console.log(url.pathname);

		// Only proceed if the path matches your WebSocket endpoint
		if (url.pathname.startsWith('/ws/sync/')) {

			const id = url.pathname.match(/\/ws\/sync\/([^/]+)/)?.[1];
			if (!id) {
				return new Response('Invalid request', { status: 400 });
			}

			// Check for authentication cookie
			const cookies = request.headers.get('Cookie') || '';
			const authCookieMatch = cookies.match(/auth=([^;]+)/)?.[1];

			// If the auth cookie is missing or invalid, reject the request
			if (!authCookieMatch || !isValidAuthToken(env, authCookieMatch, id)) {
				return new Response('Unauthorized', {
					status: 401,
					headers: { 'Content-Type': 'text/plain' }
				});
			}

			// If authenticated, proceed with the WebSocket connection
			return getWsServerDurableObjectFetch('SyncObject')(request, env);
		}


		if (url.pathname == '/' || url.pathname == '' || url.pathname == '/e') {
			let id = url.searchParams.get('id');
			if (!id) {
				const newId = nanoid(); // Generate a new ID
				var newUrl = new URL(request.url);
				newUrl.searchParams.set('id', newId); // Use the generated ID for the redirect
				newUrl.pathname = '/e';
				// IMPORTANT: The client will follow this redirect.
				// The 'id' for cookie generation will be read from the URL in the *next* request.
				return Response.redirect(newUrl.href, 301);
			}

			// If 'id' is present (either from initial request or after redirect)
			var clientPageUrl = new URL(request.url);
			clientPageUrl.pathname = `/client.html`; // Serve the client HTML
			// Note: The 'id' from url.searchParams.get('id') is implicitly used by getCookieValue

			let assetResponse = await env.ASSETS.fetch(clientPageUrl); // Fetch client.html using the original URL's params
			let finalResponse = new Response(assetResponse.body, assetResponse);
			addSecurityHeaders(finalResponse); // Add security headers
			// The 'id' from the current URL (which now has it in searchParams) is used for the cookie
			finalResponse.headers.set('Set-Cookie', await getCookieValue(env, id));
			return finalResponse;
		}

		// Fallback for other static assets
		let assetResponse = await env.ASSETS.fetch(request);
		// Ensure it's a valid response before attempting to add headers (e.g. not a 404)
		if (assetResponse.ok) {
			let finalResponse = new Response(assetResponse.body, assetResponse);
			addSecurityHeaders(finalResponse);
			return finalResponse;
		}
		return assetResponse; // Return original response if not OK (e.g., 404, 500)
	}
} satisfies ExportedHandler<Env, unknown, unknown>;



// Helper function to validate the auth token using jose
async function isValidAuthToken(env: Env, token: string, id: string) {
	try {
		// Convert your JWT secret to proper format
		const secretKey = new TextEncoder().encode(env.JWT_SECRET);

		// Verify the JWT
		const { payload } = await jose.jwtVerify(token, secretKey, {
			algorithms: ['HS256'], // Specify the algorithm you're using
		});

		// Check if the token has the required claims
		return payload?.id === id;
	} catch (err) {
		console.error('JWT verification failed:', err);
		return false;
	}
}

// In your frontend after user authentication
// document.cookie = `tinybaseAuth=${token}; path=/; Max-Age=3600; Secure; HttpOnly; SameSite=Strict`;

// On your authentication endpoint
async function generateAuthToken(env: Env, id: string,) {
	const secretKey = new TextEncoder().encode(env.JWT_SECRET);

	// Create a new JWT
	return await new jose.SignJWT({ id })
		.setProtectedHeader({ alg: 'HS256' })
		.setIssuedAt()
		.setExpirationTime('24h')
		.sign(secretKey);
}

async function getCookieValue(env: Env, id: string) {
	const authToken = await generateAuthToken(env, id);
	if (env.DEVMODE) {
		return `${AUTH_COOKIE_KEY}=${authToken}; path=/; Max-Age=3600; SameSite=Strict`
	} else {
		return `${AUTH_COOKIE_KEY}=${authToken}; path=/; Max-Age=3600; Secure; HttpOnly; SameSite=Strict`;
	}
}

// Helper function to add common security headers
function addSecurityHeaders(response: Response) {
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('X-Frame-Options', 'DENY');
	// Baseline Content-Security-Policy. This may need to be adjusted based on specific frontend needs
	// (e.g., external resources, inline scripts if strictly necessary, or 'unsafe-eval' for some frameworks in dev mode).
	response.headers.set('Content-Security-Policy', 
		"default-src 'self'; " +
		"script-src 'self'; " + // Consider adding hashes/nonces or 'unsafe-inline'/'unsafe-eval' if required by framework/dev tools
		"style-src 'self' 'unsafe-inline'; " + // 'unsafe-inline' is often needed for dynamically set styles
		"img-src 'self' data:; " +
		"font-src 'self'; " +
		"connect-src 'self' wss:; " + // wss: for WebSocket connections
		"object-src 'none'; " +
		"base-uri 'self';"
	);
	response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
	// Add other headers as needed, e.g., Referrer-Policy, Permissions-Policy
}
