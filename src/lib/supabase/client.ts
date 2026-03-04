import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

/** 请求超时时间（毫秒） */
const FETCH_TIMEOUT_MS = 30000;
/** 网络失败时最多重试次数（不含首次） */
const FETCH_RETRY_COUNT = 2;
/** 重试前等待（毫秒） */
const FETCH_RETRY_DELAY_MS = 1500;

/** 获取请求的 URL 字符串，用于判断是否为 token 刷新 */
function getRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/**
 * 带超时 + 重试的 fetch，缓解网络不稳定或访问慢导致的 ERR_TIMED_OUT / Failed to fetch
 */
async function fetchWithTimeoutAndRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  retriesLeft = FETCH_RETRY_COUNT
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  if (init?.signal) {
    init.signal.addEventListener('abort', () => controller.abort());
  }

  try {
    const res = await fetch(input, { ...init, signal: controller.signal });
    clearTimeout(timeoutId);
    return res;
  } catch (e) {
    clearTimeout(timeoutId);
    const isRetryable =
      e instanceof TypeError && (e.message === 'Failed to fetch' || e.message.includes('fetch')) ||
      (e instanceof Error && e.name === 'AbortError');
    if (isRetryable && retriesLeft > 0) {
      await new Promise((r) => setTimeout(r, FETCH_RETRY_DELAY_MS));
      return fetchWithTimeoutAndRetry(input, init, retriesLeft - 1);
    }
    // 若为 token 刷新请求且连接失败（如项目暂停、网络不通），通知应用清除会话，避免无限重试刷屏
    const url = getRequestUrl(input);
    if (url.includes('/auth/v1/token') && url.includes('refresh_token')) {
      window.dispatchEvent(new CustomEvent('supabase-connection-failed'));
    }
    throw e;
  }
}

// 调试信息
console.log('=== Supabase 配置调试 ===');
console.log('Supabase URL:', supabaseUrl);
console.log('Supabase Key exists:', !!supabaseAnonKey);
console.log('Supabase Key length:', supabaseAnonKey?.length);
console.log('Supabase Key format:', supabaseAnonKey?.startsWith('sb_') ? 'Publishable' : 'JWT');
console.log('Key preview:', supabaseAnonKey?.substring(0, 20) + '...');
console.log('========================');

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables.');
}

// 创建 Supabase 客户端：使用带超时与重试的 fetch，减少网络超时导致注册/登录失败
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  },
  global: {
    fetch: fetchWithTimeoutAndRetry,
    headers: {
      'apikey': supabaseAnonKey
    }
  }
});

// 连接失败（如项目暂停、网络不通）时清除本地 session，停止刷新重试并让用户重新登录
if (typeof window !== 'undefined') {
  window.addEventListener('supabase-connection-failed', () => {
    supabase.auth.signOut().then(() => {
      console.warn('[Supabase] 无法连接服务器，已退出登录，请检查网络或稍后重试。');
    });
  });
}

// 认证相关函数
export async function signUpWithEmail(email: string, password: string) {
  try {
    console.log('Attempting to sign up with email:', email);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });
    
    if (error) {
      console.error('Sign up error:', error);
      // 处理频率限制错误
      if (error.message?.includes('rate limit') || error.status === 429) {
        throw new Error('注册过于频繁，请稍后再试');
      }
    } else {
      console.log('Sign up successful:', data);
      // 不在此时创建 profile：session 可能尚未写入，会导致 401；改为在 session 就绪后由 AuthPage 或 onAuthStateChange 创建
    }
    
    return { data, error };
  } catch (error) {
    console.error('Sign up exception:', error);
    return { data: null, error };
  }
}

export async function createUserProfile(userId: string, email: string) {
  try {
    const defaultNickname = email.split('@')[0] || '新用户';
    const defaultAvatarUrl = 'https://api.dicebear.com/7.x/avataaars/svg?seed=default';
    const { error } = await supabase
      .from('profiles')
      .upsert(
        {
          id: userId,
          nickname: defaultNickname,
          bio: '新用户，期待发现更多志同道合的朋友！',
          contact_info: null,
          avatar_url: defaultAvatarUrl,
          gender: 'female', // 默认性别为女性
        } as any,
        { onConflict: 'id', ignoreDuplicates: true }
      );

    if (error) {
      console.error('Error creating user profile:', error);
      throw error;
    }
    console.log('User profile created or already exists');
  } catch (error) {
    console.error('Failed to create user profile:', error);
    // 不抛出错误，避免影响注册流程
  }
}

export async function signInWithEmail(email: string, password: string) {
  try {
    console.log('Attempting to sign in with email:', email);
    console.log('Supabase client config:', {
      url: supabaseUrl?.substring(0, 20) + '...',
      keyLength: supabaseAnonKey?.length,
      hasUrl: !!supabaseUrl,
      hasKey: !!supabaseAnonKey
    });
    
    // 验证基本参数
    if (!supabaseUrl || !supabaseAnonKey) {
      const error = new Error('Supabase credentials not configured');
      console.error('Missing credentials:', { supabaseUrl: !!supabaseUrl, supabaseAnonKey: !!supabaseAnonKey });
      return { data: null, error };
    }
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    if (error) {
      console.error('Sign in error:', error);
      console.error('Error details:', {
        message: error.message,
        status: error.status,
        code: error.code
      });
    } else {
      console.log('Sign in successful:', {
        user: data.user?.email,
        session: !!data.session
      });
    }
    
    return { data, error };
  } catch (error) {
    console.error('Sign in exception:', error);
    return { data: null, error: error as Error };
  }
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  return { error };
}

export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/** 返回与 Supabase Auth 一致的 { data: { session } }，便于安全解构 */
export async function getSession() {
  return supabase.auth.getSession();
}
