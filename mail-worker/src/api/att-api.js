import app from '../hono/hono';
import result from '../model/result';
import attService from '../service/att-service';
import userContext from '../security/user-context';

// 为当前登录用户有权访问的附件签发短时效直读 URL（替代原先无需鉴权的裸 key 直读）。
app.post('/att/sign', async (c) => {
	const { keys } = await c.req.json();
	const userId = userContext.getUserId(c);
	const urls = await attService.signKeys(c, keys, userId);
	return c.json(result.ok({ urls }));
});
