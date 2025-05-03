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
			const id = url.searchParams.get('id');
			if (!id) {
				const id = nanoid();
				var newUrl = new URL(request.url);
				newUrl.searchParams.set('id', nanoid());
				newUrl.pathname = '/e';
				return Response.redirect(newUrl.href, 301);
			}

			var newUrl = new URL(request.url);;
			newUrl.pathname = `/client.html`;
			let resp = await env.ASSETS.fetch(newUrl);
			resp = new Response(resp.body, resp);
			resp.headers.set('Set-Cookie', await getCookieValue(env, id));
			return resp;
		}

		return await env.ASSETS.fetch(request);
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
