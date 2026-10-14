import http from "@/axios/index.js";

// 为有权访问的附件 key 申请短时效签名直读 URL
export function signAtt(keys) {
    return http.post('/att/sign', {keys}, {noMsg: true})
}
