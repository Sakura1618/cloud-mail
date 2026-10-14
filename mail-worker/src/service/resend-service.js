import emailService from './email-service';
import { emailConst } from '../const/entity-const';
import BizError from '../error/biz-error';

const encoder = new TextEncoder();

// Resend 通过 Svix 投递 webhook：签名 = HMAC-SHA256(base64)，签名内容 "<svix-id>.<svix-timestamp>.<body>"
const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

const WEBHOOK_TYPES = [
	'email.sent',
	'email.delivered',
	'email.complained',
	'email.bounced',
	'email.delivery_delayed',
	'email.failed',
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function base64ToBytes(b64) {
	const bin = atob(b64);
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) {
		bytes[i] = bin.charCodeAt(i);
	}
	return bytes;
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

const resendService = {

	// 校验 Resend/Svix 签名。密钥缺失时 fail closed（返回 false → 上层 401）。
	async verifySignature(c, rawBody) {
		const secret = c.env.resend_webhook_secret;
		if (!secret) {
			console.error('resend_webhook_secret not configured; /webhooks fails closed');
			return false;
		}

		const id = c.req.header('svix-id');
		const timestamp = c.req.header('svix-timestamp');
		const signature = c.req.header('svix-signature');
		if (!id || !timestamp || !signature) {
			return false;
		}

		const ts = Number(timestamp);
		if (!Number.isFinite(ts)) {
			return false;
		}
		if (Math.abs(Math.floor(Date.now() / 1000) - ts) > SIGNATURE_TOLERANCE_SECONDS) {
			return false;
		}

		let secretBytes;
		try {
			secretBytes = base64ToBytes(String(secret).replace(/^whsec_/, ''));
		} catch (e) {
			return false;
		}

		const key = await crypto.subtle.importKey(
			'raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
		);
		const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(`${id}.${timestamp}.${rawBody}`));
		const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));

		// svix-signature 形如 "v1,<base64> v1,<base64> ..."（支持多签名轮换）
		return signature.split(' ').some(part => {
			const [version, value] = part.split(',');
			return version === 'v1' && !!value && timingSafeEqual(value, expected);
		});
	},

	async webhooks(c, body) {

		if (!body || typeof body !== 'object' || !WEBHOOK_TYPES.includes(body.type)) {
			throw new BizError('unsupported webhook type', 400);
		}

		const emailId = body.data && body.data.email_id;
		if (typeof emailId !== 'string' || !UUID_RE.test(emailId)) {
			throw new BizError('invalid email_id', 400);
		}

		const params = {
			resendEmailId: emailId,
			status: emailConst.status.SENT
		}

		if (body.type === 'email.delivered') {
			params.status = emailConst.status.DELIVERED
			params.message = null
		}

		if (body.type === 'email.complained') {
			params.status = emailConst.status.COMPLAINED
			params.message = null
		}

		if (body.type === 'email.bounced') {
			params.status = emailConst.status.BOUNCED
			params.message = JSON.stringify(body.data.bounce ?? null)
		}

		if (body.type === 'email.delivery_delayed') {
			params.status = emailConst.status.DELAYED
			params.message = null
		}

		if (body.type === 'email.failed') {
			params.status = emailConst.status.FAILED
			params.message = typeof body.data.failed?.reason === 'string' ? body.data.failed.reason : null
		}

		const emailRow = await emailService.updateEmailStatus(c, params)

		if (!emailRow) {
			throw new BizError('更新邮件状态记录失败', 500);
		}

	}
}

export default resendService
