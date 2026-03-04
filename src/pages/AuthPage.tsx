import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { signUpWithEmail, signInWithEmail, getSession, createUserProfile } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { ClipboardList, Loader2 } from 'lucide-react';

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchParams] = useSearchParams();
  const [redirectMessage, setRedirectMessage] = useState('');

  useEffect(() => {
    // 检查是否有邀请参数：来自 redirect（如 /quiz/xxx?from=yyy）或单独 from
    const redirect = searchParams.get('redirect');
    const fromUserId = searchParams.get('from');
    const hasQuizRedirect = redirect?.includes('/quiz/');
    if (fromUserId || hasQuizRedirect) {
      setRedirectMessage('朋友邀请你参与兴趣问卷，请先登录或注册');
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 防止重复提交
    if (loading) return;
    
    setLoading(true);

    try {
      if (isLogin) {
        console.log('Attempting login with email:', email);
        const { error } = await signInWithEmail(email, password);
        console.log('Login result:', { error: error ? 'failed' : 'success' });
        
        if (error) {
          console.error('Login error details:', error);
          const errorMessage = (error as any).message || '登录失败';
          const errorName = (error as any).name || '';
          if (errorMessage.includes('Invalid login') || errorMessage.includes('Invalid API') || errorMessage.includes('Unauthorized')) {
            toast.error('邮箱或密码错误');
          } else if (errorMessage.includes('credentials')) {
            toast.error('配置错误，请联系管理员');
          } else if (
            errorMessage.includes('Failed to fetch') ||
            errorName.includes('AuthRetryableFetchError') ||
            errorMessage.includes('timeout') ||
            errorMessage.includes('TIMED_OUT')
          ) {
            toast.error('网络超时或无法连接，请检查网络后重试。若在中国大陆可尝试使用 VPN。');
          } else {
            toast.error(errorMessage);
          }
        } else {
          toast.success('登录成功！');
          const redirectTo = searchParams.get('redirect');
          if (redirectTo && redirectTo.startsWith('/') && !redirectTo.startsWith('//')) {
            window.location.href = redirectTo;
          } else {
            window.location.href = '/';
          }
        }
      } else {
        console.log('Attempting signup with email:', email);
        const { data: signUpData, error } = await signUpWithEmail(email, password);
        console.log('Signup result:', { error: error ? 'failed' : 'success', hasUser: !!signUpData?.user, hasSession: !!signUpData?.session });
        
        if (error) {
          console.error('Signup error details:', error);
          const errorMessage = (error as any).message || '注册失败';
          const errorName = (error as any).name || '';
          if (errorMessage.includes('already registered')) {
            toast.error('该邮箱已注册');
          } else if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
            toast.error('注册过于频繁，请1分钟后再试');
          } else if (errorMessage.includes('credentials')) {
            toast.error('配置错误，请联系管理员');
          } else if (
            errorMessage.includes('Failed to fetch') ||
            errorName.includes('AuthRetryableFetchError') ||
            errorMessage.includes('timeout') ||
            errorMessage.includes('TIMED_OUT')
          ) {
            toast.error('网络超时或无法连接，请检查网络后重试。若在中国大陆可尝试使用 VPN。');
          } else {
            toast.error(errorMessage);
          }
        } else if (signUpData?.session) {
          // 未开启邮箱确认时：直接有 session，立即写 profile 并跳转
          const redirectTo = searchParams.get('redirect');
          toast.success(redirectTo?.includes('/quiz/') ? '注册成功！正在跳转到问卷…' : '注册成功！正在跳转…');
          try {
            await createUserProfile(signUpData.session.user.id, email);
          } catch (_) {
            // 忽略 profile 创建失败，由 App 或 Profile 页兜底
          }
          if (redirectTo && redirectTo.startsWith('/') && !redirectTo.startsWith('//')) {
            window.location.href = redirectTo;
          } else {
            window.location.href = '/profile';
          }
        } else if (signUpData?.user) {
          // 开启了邮箱确认：user 存在但 session 为 null，需用户点击邮件链接后才会有 session
          toast.success('注册成功！请查收邮件并点击链接完成验证，验证后可登录。');
          // 不跳转，避免被 App 因无 session 重定向回 /auth
        } else {
          // 极少数情况：无 error 但无 user/session，短暂轮询 session 后决定
          toast.success('注册请求已提交…');
          const redirectTo = searchParams.get('redirect');
          const waitForSession = async (retries = 15) => {
            for (let i = 0; i < retries; i++) {
              const result = await getSession();
              const session = result?.data?.session;
              if (session?.user) {
                try {
                  await createUserProfile(session.user.id, email);
                } catch (_) {}
                if (redirectTo && redirectTo.startsWith('/') && !redirectTo.startsWith('//')) {
                  window.location.href = redirectTo;
                } else {
                  window.location.href = '/profile';
                }
                return;
              }
              await new Promise((r) => setTimeout(r, 300));
            }
            toast.info('若已开启邮箱验证，请查收邮件完成验证后登录。');
          };
          waitForSession();
        }
      }
    } catch (error) {
      console.error('Auth operation failed:', error);
      toast.error('操作失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-scale-in">
        {/* Logo */}
        <div className="flex flex-col items-center gap-2 mb-10">
          <div className="flex items-center gap-4">
            <ClipboardList className="w-12 h-12 text-[#2D5A27] animate-float drop-shadow-lg" />
            <h1 className="text-4xl font-bold text-white drop-shadow-2xl tracking-tight">趣友</h1>
          </div>
          <p className="text-white/90 text-sm drop-shadow-lg">根据兴趣进行匹配交友</p>
        </div>

        <Card className="glass-card shadow-2xl border-0">
        <CardHeader className="text-center pb-6">
          {redirectMessage && (
            <div className="mb-6 p-4 glass rounded-xl border-2 border-blue-200/50 shadow-lg animate-scale-in">
              <p className="text-blue-800 text-sm font-medium">{redirectMessage}</p>
            </div>
          )}
          <CardTitle className="text-3xl text-[#2C3E50] font-bold mb-2">
            {isLogin ? '👋 欢迎回来' : '🌟 创建账号'}
          </CardTitle>
          <CardDescription className="text-gray-600 text-base">
            {isLogin 
              ? '登录后继续探索兴趣问卷，发现志同道合的朋友' 
              : '注册后参与兴趣问卷，根据兴趣匹配交友'}
          </CardDescription>
        </CardHeader>
          
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-semibold text-gray-700">邮箱</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-14 glass-input text-base"
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-semibold text-gray-700">密码</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="至少6位密码"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-14 glass-input text-base"
                  disabled={loading}
                />
              </div>

              <Button
                type="submit"
                className="w-full h-14 bg-gradient-to-r from-[#2D5A27] to-[#234a1f] hover:from-[#234a1f] hover:to-[#1a3515] text-white text-base font-bold shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105"
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  isLogin ? '登录' : '注册'
                )}
              </Button>
            </form>

            <div className="mt-8 text-center">
              <button
                type="button"
                onClick={() => setIsLogin(!isLogin)}
                className="text-[#2D5A27] hover:text-[#234a1f] font-semibold text-base transition-all duration-300 hover:scale-105 inline-block"
                disabled={loading}
              >
                {isLogin 
                  ? '还没有账号？立即注册 →' 
                  : '已有账号？立即登录 →'}
              </button>
            </div>
          </CardContent>
        </Card>

        <div className="text-center mt-8 glass rounded-2xl p-4 shadow-lg">
          <p className="text-sm text-gray-700 font-medium">
            ✨ 完成测试，根据兴趣发现志同道合的朋友
          </p>
        </div>
      </div>
    </div>
  );
}
