import passwordUtils from './password-utils';

// 兼容层：历史调用方仍可 import crypto-utils。
// 真正的密码算法在 password-utils.js（PBKDF2-SHA256 + 旧格式透明升级）。
const saltHashUtils = {

	generateSalt(length = 16) {
		return passwordUtils.generateSalt(length);
	},


	async hashPassword(password) {
		return passwordUtils.hashPassword(password);
	},

	// 旧格式（单轮加盐 SHA-256）原语，仅为兼容历史调用方保留；
	// 新代码请使用 password-utils.hashPassword。
	async genHashPassword(password, salt) {
		return passwordUtils.legacySha256Hash(password, salt);
	},

	// 兼容旧签名：返回布尔值。内部走统一实现，新旧格式都能校验。
	// 需要 needsRehash 的调用方请直接用 password-utils.verifyPassword。
	async verifyPassword(inputPassword, salt, storedHash) {
		const { ok } = await passwordUtils.verifyPassword(inputPassword, salt, storedHash);
		return ok;
	},

	// 账号不存在时也执行一次等价开销的哈希运算，消除账号枚举的计时侧信道
	async dummyVerify(inputPassword) {
		await passwordUtils.dummyVerify(inputPassword);
	},

	genRandomPwd(length = 8) {
		const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		let result = '';
		for (let i = 0; i < length; i++) {
			result += chars.charAt(Math.floor(Math.random() * chars.length));
		}
		return result;
	}
};

export default saltHashUtils;
