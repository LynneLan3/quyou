/**
 * 分享链接中的 from 参数（用户 id）编码/解码，避免 URL 中明文暴露
 */

const PREFIX = 'f.'; // 简单标识，解码时兼容无前缀的旧链接

/** 将用户 id 编码为可放在 URL 中的字符串（Base64URL + 前缀） */
export function encodeFromParam(userId: string): string {
  if (!userId) return '';
  try {
    const base64 = btoa(unescape(encodeURIComponent(userId)));
    const safe = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return PREFIX + safe;
  } catch {
    return userId;
  }
}

/** 从 URL 参数解码出用户 id；解码失败或非编码格式时返回原字符串（兼容旧链接） */
export function decodeFromParam(encoded: string | null | undefined): string | null {
  if (encoded == null || encoded === '') return null;
  try {
    let raw = encoded;
    if (raw.startsWith(PREFIX)) raw = raw.slice(PREFIX.length);
    const base64 = raw.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    return decodeURIComponent(escape(atob(padded))) || null;
  } catch {
    return encoded;
  }
}
