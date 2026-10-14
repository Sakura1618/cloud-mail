import { Hono } from 'hono';
const app = new Hono();

import result from '../model/result';
import { cors } from 'hono/cors';

// 允许的来源白名单。`/public/*` 是第三方集成用的 token 鉴权接口，单独保留通配 CORS。
const ALLOWED_ORIGINS = [
	'https://sakura1618.com',
	'https://cloud-mail.2895203798.workers.dev',
	// 本地开发（vite dev server / wrangler dev）
	'http://localhost:5173',
	'http://127.0.0.1:5173',
	'http://localhost:8787',
	'http://127.0.0.1:8787',
];

app.use('*', cors({
	credentials: false,
	origin: (origin, c) => {
		if (c.req.path.startsWith('/public/')) {
			return '*';
		}
		return ALLOWED_ORIGINS.includes(origin) ? origin : null;
	},
}));

app.onError((err, c) => {

	if (err.name === 'BizError') {
		console.log(err.message);
		return c.json(result.fail(err.message, err.code));
	}

	console.error(err);

	if (err.message === `Cannot read properties of undefined (reading 'get')`) {
		return c.json(result.fail('KV数据库未绑定<br/>KV database not bound',502));
	}

	if (err.message === `Cannot read properties of undefined (reading 'put')`) {
		return c.json(result.fail('KV数据库未绑定<br/>KV database not bound',502));
	}

	if (err.message === `Cannot read properties of undefined (reading 'prepare')`) {
		return c.json(result.fail('D1数据库未绑定<br/>D1 database not bound',502));
	}

	if (err.message?.includes('D1_ERROR: no such column')) {
		return c.json(result.fail('请按照文档更新数据库<br/>Please update the database as documented',502));
	}

	// 非 BizError 不回显原始内部错误（仅记录到日志）
	return c.json(result.fail('服务器内部错误<br/>Server internal error',500));
});

export default app;


