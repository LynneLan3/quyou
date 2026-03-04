import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import { MessageModalProvider, messageToast } from '@/components/MessageModal';

// 页面组件
import HomePage from './pages/HomePage';
import QuizPage from './pages/QuizPage';
import ResultPage from './pages/ResultPage';
import MatchesPage from './pages/MatchesPage';
import ProfilePage from './pages/ProfilePage';
import AuthPage from './pages/AuthPage';
import CreateQuizPage from './pages/CreateQuizPage';
import MyQuizzesPage from './pages/MyQuizzesPage';
import EditQuizPage from './pages/EditQuizPage';
import MatchAnswersPage from './pages/MatchAnswersPage';
import CompletedQuizDetailPage from './pages/CompletedQuizDetailPage';
import Layout from './components/Layout';

/** 未登录时跳转到登录页，并带上当前路径作为 redirect，以便登录后回到问卷等页面 */
function AuthRedirect() {
  const location = useLocation();
  // 问卷邀请链接：登录后可能丢失 query，先把 from 存到 sessionStorage
  if (location.pathname.startsWith('/quiz/') && location.search) {
    const quizId = location.pathname.split('/')[2];
    const from = new URLSearchParams(location.search).get('from');
    if (quizId && from) {
      try {
        sessionStorage.setItem(`from_quiz_${quizId}`, from);
      } catch (_) {}
    }
  }
  const to = `/auth?redirect=${encodeURIComponent(location.pathname + location.search)}`;
  return <Navigate to={to} replace />;
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // 无法连接 Supabase（如项目暂停、网络不通）时提示用户
  useEffect(() => {
    const onConnectionFailed = () => {
      messageToast.error('无法连接服务器，已退出登录。请检查网络或稍后重试。若使用 Supabase 免费版，请在控制台恢复项目。');
    };
    window.addEventListener('supabase-connection-failed', onConnectionFailed);
    return () => window.removeEventListener('supabase-connection-failed', onConnectionFailed);
  }, []);

  useEffect(() => {
    // 获取当前用户并处理重定向
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      setLoading(false);
    };

    getUser();

    // 监听认证状态变化
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      
      // 注册/登录成功后，确保新用户有 profile；若当前在登录页则跳转到资料页
      if (event === 'SIGNED_IN' && session?.user) {
        (async () => {
          try {
            const userId = session.user.id;
            const { data: profileData, error: profileError } = await supabase
              .from('profiles')
              .select('id')
              .eq('id', userId)
              .maybeSingle();

            if (profileError) throw profileError;

            if (!profileData) {
              const defaultNickname = (session.user.email || '').split('@')[0] || '新用户';
              const defaultAvatarUrl = 'https://api.dicebear.com/7.x/avataaars/svg?seed=default';
              await supabase.from('profiles').upsert(
                {
                  id: userId,
                  nickname: defaultNickname,
                  bio: '新用户，期待发现更多志同道合的朋友！',
                  contact_info: null,
                  avatar_url: defaultAvatarUrl,
                  gender: 'female',
                } as any,
                { onConflict: 'id', ignoreDuplicates: true }
              );
            }

            // 仅当用户刚从登录/注册页进来时跳转：若有 redirect 则去问卷等目标页，否则去资料页
            if (window.location.pathname === '/auth') {
              const params = new URLSearchParams(window.location.search);
              const redirectTo = params.get('redirect');
              if (redirectTo && redirectTo.startsWith('/') && !redirectTo.startsWith('//')) {
                window.location.href = redirectTo;
              } else {
                window.location.href = '/profile';
              }
            }
          } catch (err) {
            console.error('Post-auth profile setup failed:', err);
            if (window.location.pathname === '/auth') {
              const params = new URLSearchParams(window.location.search);
              const redirectTo = params.get('redirect');
              if (redirectTo && redirectTo.startsWith('/') && !redirectTo.startsWith('//')) {
                window.location.href = redirectTo;
              } else {
                window.location.href = '/profile';
              }
            }
          }
        })();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="glass rounded-3xl p-8 shadow-2xl animate-scale-in">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-[#2D5A27] border-t-transparent shadow-lg"></div>
            <p className="text-[#2D5A27] font-semibold text-lg">加载中...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <MessageModalProvider>
      <Router>
        <Routes>
        <Route path="/auth" element={user ? <Navigate to="/" /> : <AuthPage />} />
        <Route path="/" element={user ? <Layout user={user} /> : <AuthRedirect />}>
          <Route index element={<HomePage />} />
          <Route path="create-quiz" element={<CreateQuizPage />} />
          <Route path="my-quizzes" element={<MyQuizzesPage />} />
          <Route path="my-quizzes/result/:resultId" element={<CompletedQuizDetailPage />} />
          <Route path="edit-quiz/:quizId" element={<EditQuizPage />} />
          <Route path="quiz/:quizId" element={<QuizPage />} />
          <Route path="result/:resultId" element={<ResultPage />} />
          <Route path="match-answers/:matchId" element={<MatchAnswersPage />} />
          <Route path="matches" element={<MatchesPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>
      </Routes>
    </Router>
    </MessageModalProvider>
  );
}

export default App;
