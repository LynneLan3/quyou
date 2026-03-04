import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { signUpWithEmail, signInWithEmail, getSession, createUserProfile } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { messageToast } from '@/components/MessageModal';
import { ClipboardList, Loader2, Eye, EyeOff } from 'lucide-react';

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchParams] = useSearchParams();
  const [redirectMessage, setRedirectMessage] = useState('');
  /** 登录失败后提示新用户设置密码（显示确认密码并走注册） */
  const [isNewUserPrompt, setIsNewUserPrompt] = useState(false);

  useEffect(() => {
    // 检查是否有邀请参数：来自 redirect（如 /quiz/xxx?from=yyy）或单独 from
    const redirect = searchParams.get('redirect');
    const fromUserId = searchParams.get('from');
    const hasQuizRedirect = redirect?.includes('/quiz/');
    if (fromUserId || hasQuizRedirect) {
      setRedirectMessage('朋友邀请你参与兴趣问卷，请先登录或注册');
    }
  }, [searchParams]);

  const needConfirmPassword = !isLogin || isNewUserPrompt;
  const isInvalidCreds = (msg: string) =>
    /Invalid login|Invalid API|Unauthorized|credentials/i.test(msg);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    if (needConfirmPassword) {
      if (password !== passwordConfirm) {
        messageToast.error('两次输入的密码不一致，请检查');
        return;
      }
      if (password.length < 6) {
        messageToast.error('密码至少 6 位');
        return;
      }
    }

    setLoading(true);
    setIsNewUserPrompt(false);

    try {
      if (isLogin && !isNewUserPrompt) {
        // 先尝试登录：已有账号则直接登录成功
        const { error } = await signInWithEmail(email, password);
        if (!error) {
          messageToast.success('登录成功！');
          const redirectTo = searchParams.get('redirect');
          if (redirectTo && redirectTo.startsWith('/') && !redirectTo.startsWith('//')) {
            window.location.href = redirectTo;
          } else {
            window.location.href = '/';
          }
          return;
        }
        const errorMessage = (error as any).message || '';
        const errorName = (error as any).name || '';
        if (isInvalidCreds(errorMessage) || errorName.includes('Auth')) {
          // 未找到账号或密码错误 → 提示新用户设置密码
          setIsNewUserPrompt(true);
          messageToast.info('未找到该账号，请设置密码完成注册（请再输入一次密码确认）');
          setLoading(false);
          return;
        }
        if (
          errorMessage.includes('Failed to fetch') ||
          errorName.includes('AuthRetryableFetchError') ||
          /timeout|TIMED_OUT/i.test(errorMessage)
        ) {
          messageToast.error('网络超时或无法连接，请检查网络后重试。若在中国大陆可尝试使用 VPN。');
        } else {
          messageToast.error(errorMessage);
        }
        setLoading(false);
        return;
      }

      // 注册：新用户设置密码（双密码已校验）
      console.log('Attempting signup with email:', email);
      const { data: signUpData, error } = await signUpWithEmail(email, password);
        console.log('Signup result:', { error: error ? 'failed' : 'success', hasUser: !!signUpData?.user, hasSession: !!signUpData?.session });
        
        if (error) {
          console.error('Signup error details:', error);
          const errorMessage = (error as any).message || '注册失败';
          const errorName = (error as any).name || '';
          if (errorMessage.includes('already registered') || errorMessage.includes('already been registered')) {
            messageToast.error('该邮箱已注册，请检查密码或直接登录');
          } else if (errorMessage.includes('注册请求过于频繁') || errorMessage.includes('rate limit') || errorMessage.includes('429')) {
            messageToast.error('注册请求过于频繁，请稍后再试。若该邮箱已注册请直接登录。');
          } else if (errorMessage.includes('credentials')) {
            messageToast.error('配置错误，请联系管理员');
          } else if (
            errorMessage.includes('Failed to fetch') ||
            errorName.includes('AuthRetryableFetchError') ||
            errorMessage.includes('timeout') ||
            errorMessage.includes('TIMED_OUT')
          ) {
            messageToast.error('网络超时或无法连接，请检查网络后重试。若在中国大陆可尝试使用 VPN。');
          } else {
            messageToast.error(errorMessage);
          }
        } else if (signUpData?.session) {
          // 未开启邮箱确认时：直接有 session，立即写 profile 并跳转
          const redirectTo = searchParams.get('redirect');
          messageToast.success(redirectTo?.includes('/quiz/') ? '注册成功！正在跳转到问卷…' : '注册成功！正在跳转…');
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
          messageToast.success('注册成功！请查收邮件并点击链接完成验证，验证后可登录。');
          // 不跳转，避免被 App 因无 session 重定向回 /auth
        } else {
          // 极少数情况：无 error 但无 user/session，短暂轮询 session 后决定
          messageToast.success('注册请求已提交…');
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
            messageToast.info('若已开启邮箱验证，请查收邮件完成验证后登录。');
          };
          waitForSession();
        }
    } catch (error) {
      console.error('Auth operation failed:', error);
      messageToast.error('操作失败，请重试');
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
            {isNewUserPrompt ? '🔐 设置密码完成注册' : isLogin ? '👋 欢迎回来' : '🌟 创建账号'}
          </CardTitle>
          <CardDescription className="text-gray-600 text-base">
            {isNewUserPrompt
              ? '请再次输入密码以确认，完成注册'
              : isLogin 
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
                <Label htmlFor="password" className="text-sm font-semibold text-gray-700">
                  {needConfirmPassword ? '设置密码' : '密码'}
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="至少6位密码"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-14 glass-input text-base pr-12"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 p-1 rounded"
                    aria-label={showPassword ? '隐藏密码' : '显示密码'}
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {needConfirmPassword && (
                <div className="space-y-2">
                  <Label htmlFor="passwordConfirm" className="text-sm font-semibold text-gray-700">
                    确认密码
                  </Label>
                  <div className="relative">
                    <Input
                      id="passwordConfirm"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="请再次输入密码"
                      value={passwordConfirm}
                      onChange={(e) => setPasswordConfirm(e.target.value)}
                      className="h-14 glass-input text-base pr-12"
                      disabled={loading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 p-1 rounded"
                      aria-label={showPassword ? '隐藏密码' : '显示密码'}
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
              )}

              <Button
                type="submit"
                className="w-full h-14 bg-gradient-to-r from-[#2D5A27] to-[#234a1f] hover:from-[#234a1f] hover:to-[#1a3515] text-white text-base font-bold shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105"
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : needConfirmPassword ? (
                  isNewUserPrompt ? '设置密码并注册' : '注册'
                ) : (
                  '登录'
                )}
              </Button>
            </form>

            <div className="mt-8 text-center">
              <button
                type="button"
                onClick={() => {
                  setIsLogin(!isLogin);
                  setIsNewUserPrompt(false);
                  setPasswordConfirm('');
                }}
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
