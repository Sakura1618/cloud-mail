import app from './hono/webs';
import { email } from './email/email';
import userService from './service/user-service';
import verifyRecordService from './service/verify-record-service';
import emailService from './service/email-service';
import kvObjService from './service/kv-obj-service';
import oauthService from './service/oauth-service';
import analysisService from './service/analysis-service';
import signUtils from './utils/sign-utils';
import constant from './const/constant';

// 附件/背景对象统一出口。除公开的站点背景外，必须携带由 /api/att/sign 签发的
// 短时效签名（?e=&s=），否则无法按 key 直读对象。
async function objResponse(env, url) {
	const key = url.pathname.substring(1);

	if (!key.startsWith(constant.BACKGROUND_PREFIX)) {
		const ok = await signUtils.verify(
			key,
			url.searchParams.get('e'),
			url.searchParams.get('s'),
			env.jwt_secret
		);
		if (!ok) {
			return new Response('Forbidden', { status: 403 });
		}
	}

	const resp = await kvObjService.toObjResp({ env }, key);
	if (!resp) {
		return new Response('Not Found', { status: 404 });
	}
	resp.headers.set('X-Content-Type-Options', 'nosniff');
	return resp;
}

export default {
	 async fetch(req, env, ctx) {

		const url = new URL(req.url)

		if (url.pathname.startsWith('/api/')) {
			url.pathname = url.pathname.replace('/api', '')
			req = new Request(url.toString(), req)
			return app.fetch(req, env, ctx);
		}

		 if (['/static/','/attachments/'].some(p => url.pathname.startsWith(p))) {
			 return await objResponse(env, url);
		 }

		return env.assets.fetch(req);
	},
	email: email,
	async scheduled(c, env, ctx) {
		if (c.cron === '*/30 * * * *') {
			await analysisService.refreshEchartsCache({ env })
			return;
		}

		await verifyRecordService.clearRecord({ env })
		await userService.resetDaySendCount({ env })
		await emailService.completeReceiveAll({ env })
		await emailService.autoClean({ env })
		await analysisService.refreshEchartsCache({ env })
		await oauthService.clearNoBindOathUser({ env })
	},
};
