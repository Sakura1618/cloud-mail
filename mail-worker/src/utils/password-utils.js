const encoder = new TextEncoder();

// PBKDF2-SHA256 迭代次数。
//
// 本机 WebCrypto 单次 deriveBits(256bit) 实测：100000 → 11.2ms、210000 → 22.3ms、
// 600000 → 60.3ms（node v24.19.0）。但 Cloudflare Workers 的 WebCrypto 对 PBKDF2
// 有硬上限：>100000 会抛 NotSupportedError（生产实测：
// "Pbkdf2 failed: iteration counts above 100000 are not supported (requested 600000)"）。
// 因此取运行时可支持的最大值 100000。
// 迭代次数已写入存储串，未来 Workers 放宽上限时可无痛调高。
// 格式：pbkdf2$sha256$<iterations>$<b64salt>$<b64derivedKey>
export const ITERATIONS = 100000;

const ALGORITHM = 'SHA-256';
const PREFIX = 'pbkdf2$sha256$';
const SCHEME = 'sha256';
const SALT_LENGTH = 16;
const KEY_BITS = 256;
const KEY_LENGTH = KEY_BITS / 8;
// 解析存储串时接受的迭代次数上限，防止被构造的超大值拖垮 Worker
const MAX_ITERATIONS = 10000000;

// 账号不存在时也执行一次等价开销的运算，消除账号枚举的计时侧信道。
// 盐固定为 16 字节，开销与一次真实的 PBKDF2 校验一致。
const DUMMY_SALT = encoder.encode('cloud-mail-dummy');
const DUMMY_KEY = new Uint8Array(KEY_LENGTH);

function bytesToBase64(bytes) {
	let binary = '';
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}

function base64ToBytes(value) {
	const binary = atob(value);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

// 长度不同直接返回 false（长度是公开信息），其余按位累积差异，避免短路比较
function constantTimeEqual(a, b) {
	if (a.length !== b.length) {
		return false;
	}
	let diff = 0;
	for (let i = 0; i < a.length; i++) {
		diff |= a[i] ^ b[i];
	}
	return diff === 0;
}

function normalizePassword(password) {
	return typeof password === 'string' ? password : String(password ?? '');
}

async function deriveKey(password, saltBytes, iterations) {
	const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
	const bits = await crypto.subtle.deriveBits(
		{ name: 'PBKDF2', hash: ALGORITHM, salt: saltBytes, iterations },
		key,
		KEY_BITS
	);
	return new Uint8Array(bits);
}

async function verifyPbkdf2(inputPassword, storedHash) {
	const parts = storedHash.split('$');
	if (parts.length !== 5) {
		return false;
	}
	const [, scheme, iterationsStr, saltB64, keyB64] = parts;
	if (scheme !== SCHEME || !/^[0-9]+$/.test(iterationsStr)) {
		return false;
	}
	const iterations = Number(iterationsStr);
	if (iterations < 1 || iterations > MAX_ITERATIONS) {
		return false;
	}
	const saltBytes = base64ToBytes(saltB64);
	const expectedKey = base64ToBytes(keyB64);
	if (saltBytes.length === 0 || expectedKey.length !== KEY_LENGTH) {
		return false;
	}
	const derivedKey = await deriveKey(inputPassword, saltBytes, iterations);
	return constantTimeEqual(derivedKey, expectedKey);
}

// 旧格式：btoa(SHA-256(salt + password))，单轮加盐 SHA-256。
// 保留原样实现，用于校验历史数据，不做任何“顺手加固”。
async function legacySha256Hash(password, salt) {
	const data = encoder.encode(salt + password);
	const hashBuffer = await crypto.subtle.digest(ALGORITHM, data);
	return bytesToBase64(new Uint8Array(hashBuffer));
}

const passwordUtils = {

	generateSalt(length = SALT_LENGTH) {
		const array = new Uint8Array(length);
		crypto.getRandomValues(array);
		return bytesToBase64(array);
	},

	// 新格式：pbkdf2$sha256$<iterations>$<b64salt>$<b64derivedKey>
	// salt 列继续写入同一份盐的 base64，保证任何旧的读取路径仍可用
	async hashPassword(password) {
		const saltBytes = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
		const salt = bytesToBase64(saltBytes);
		const derivedKey = await deriveKey(normalizePassword(password), saltBytes, ITERATIONS);
		return { salt, hash: `${PREFIX}${ITERATIONS}$${salt}$${bytesToBase64(derivedKey)}` };
	},

	legacySha256Hash,

	// 返回 { ok, needsRehash }，任何异常/畸形数据一律 { ok: false }，绝不抛出
	async verifyPassword(inputPassword, salt, storedHash) {
		try {
			if (typeof storedHash !== 'string' || storedHash.length === 0) {
				return { ok: false, needsRehash: false };
			}
			const password = normalizePassword(inputPassword);
			if (storedHash.startsWith(PREFIX)) {
				return { ok: await verifyPbkdf2(password, storedHash), needsRehash: false };
			}
			const ok = (await legacySha256Hash(password, salt)) === storedHash;
			return { ok, needsRehash: ok };
		} catch (e) {
			return { ok: false, needsRehash: false };
		}
	},

	async dummyVerify(inputPassword) {
		const derivedKey = await deriveKey(normalizePassword(inputPassword), DUMMY_SALT, ITERATIONS);
		constantTimeEqual(derivedKey, DUMMY_KEY);
	}

};

export default passwordUtils;
