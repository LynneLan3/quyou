import { Outlet, Link, useLocation } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import { signOut } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Heart, LogOut, Home, ClipboardList, User as UserIcon, BookOpen } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

interface LayoutProps {
  user: User;
}

export default function Layout({ user }: LayoutProps) {
  const location = useLocation();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    // 获取待处理的匹配数量（排除已拒绝的）
    const getPendingCount = async () => {
      const { count } = await supabase
        .from('matches')
        .select('*', { count: 'exact', head: true })
        .eq('receiver_id', user.id)
        .eq('receiver_agreed', false)
        .eq('requester_agreed', true)
        .neq('status', 'rejected');
      
      setPendingCount(count || 0);
    };

    getPendingCount();

    // 监听 matches 表的变化，实时更新待处理数量
    const subscription = supabase
      .channel('matches-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'matches',
          filter: `receiver_id=eq.${user.id}`
        },
        () => {
          getPendingCount();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [user.id]);

  const handleSignOut = async () => {
    await signOut();
    window.location.href = '/auth';
  };

  const isActive = (path: string) => {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  return (
    <div className="min-h-screen">
      {/* 导航栏 - 磨玻璃效果 */}
      <nav className="glass-dark text-white shadow-2xl sticky top-0 z-50 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            {/* Logo - 添加动画效果 */}
            <Link to="/" className="flex items-center gap-2 hover:opacity-90 transition-all duration-300 hover:scale-105">
              <ClipboardList className="w-6 h-6 animate-float" />
              <span className="text-xl font-bold tracking-wide">趣友</span>
            </Link>

            {/* 导航链接 */}
            <div className="flex items-center gap-6">
              <Link 
                to="/" 
                className={`flex items-center gap-1 hover:opacity-90 transition-all duration-300 hover:scale-110 px-3 py-2 rounded-lg hover:bg-white/10 ${
                  isActive('/') && !isActive('/matches') ? 'text-[#D4A574] bg-white/15' : ''
                }`}
              >
                <Home className="w-4 h-4" />
                <span className="hidden sm:inline">首页</span>
              </Link>
              
              <Link 
                to="/my-quizzes" 
                className={`flex items-center gap-1 hover:opacity-90 transition-all duration-300 hover:scale-110 px-3 py-2 rounded-lg hover:bg-white/10 ${
                  isActive('/my-quizzes') || isActive('/create-quiz') || isActive('/edit-quiz') ? 'text-[#D4A574] bg-white/15' : ''
                }`}
              >
                <BookOpen className="w-4 h-4" />
                <span className="hidden sm:inline">问卷</span>
              </Link>

              <Link 
                to="/matches" 
                className={`flex items-center gap-1 hover:opacity-90 transition-all duration-300 hover:scale-110 relative px-3 py-2 rounded-lg hover:bg-white/10 ${
                  isActive('/matches') ? 'text-[#D4A574] bg-white/15' : ''
                }`}
              >
                <Heart className="w-4 h-4" />
                <span className="hidden sm:inline">我的匹配</span>
                {pendingCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-[#FF6B35] text-white text-xs rounded-full w-5 h-5 flex items-center justify-center animate-pulse shadow-lg">
                    {pendingCount}
                  </span>
                )}
              </Link>
              
              <Link 
                to="/profile" 
                className={`flex items-center gap-1 hover:opacity-90 transition-all duration-300 hover:scale-110 px-3 py-2 rounded-lg hover:bg-white/10 ${
                  isActive('/profile') ? 'text-[#D4A574] bg-white/15' : ''
                }`}
              >
                <UserIcon className="w-4 h-4" />
                <span className="hidden sm:inline">个人中心</span>
              </Link>

              <div className="flex items-center gap-3 ml-4">
                <span className="text-sm text-white/80 hidden sm:inline">
                  {user.email}
                </span>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleSignOut}
                  className="text-white hover:bg-white/20"
                >
                  <LogOut className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* 主内容区 */}
      <main className="max-w-6xl mx-auto px-4 py-8 animate-fade-in-up">
        <Outlet />
      </main>
    </div>
  );
}
