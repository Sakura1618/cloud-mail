const encoder = new TextEncoder();

const toHex = (buffer) => Array.from(new Uint8Array(buffer))
	.map(b => b.toString(16).padStart(2, '0'))
	.join('');

async function hmac(secret, data) {
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	return toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(data)));
}

function timingSafeEqual(a, b) {
	if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) {
		return false;
	}
	let diff = 0;
	for (let i = 0; i < a.length; i++) {
		diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return diff === 0;
}

// Short-lived: the signed URL is only meant to authorise the browser's own
// <img>/<a> fetches for the page currently being rendered.
const DEFAULT_TTL = 60 * 15;

const signUtils = {

	async signedPath(key, secret, ttl = DEFAULT_TTL) {
		const e = Math.floor(Date.now() / 1000) + ttl;
		const s = await hmac(secret, `${key}:${e}`);
		return `/${key}?e=${e}&s=${s}`;
	},

	async verify(key, e, s, secret) {
		const exp = Number(e);
		if (!key || !e || !s || !Number.isFinite(exp)) {
			return false;
		}
		if (exp < Math.floor(Date.now() / 1000)) {
			return false;
		}
		const expected = await hmac(secret, `${key}:${exp}`);
		return timingSafeEqual(expected, s);
	}

};

export default signUtils;
