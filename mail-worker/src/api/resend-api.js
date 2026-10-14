import resendService from '../service/resend-service';
import app from '../hono/hono';

app.post('/webhooks', async (c) => {
	const raw = await c.req.text();

	// 未通过 Svix 签名校验（含未配置密钥）一律 401，且不回显任何内部信息
	if (!(await resendService.verifySignature(c, raw))) {
		return c.json({ code: 401, message: 'unauthorized' }, 401);
	}

	let body;
	try {
		body = JSON.parse(raw);
	} catch (e) {
		return c.json({ code: 400, message: 'bad request' }, 400);
	}

	try {
		await resendService.webhooks(c, body);
	} catch (e) {
		if (e.name === 'BizError' && e.code === 400) {
			return c.json({ code: 400, message: 'bad request' }, 400);
		}
		console.error(e);
		return c.json({ code: 500, message: 'server error' }, 500);
	}

	return c.json({ code: 200, message: 'success' });
});
