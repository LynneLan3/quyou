import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabase/client';
import { getCurrentUser } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { messageToast } from '@/components/MessageModal';
import {
  Loader2,
  ClipboardList,
  Plus,
  Edit3,
  Globe,
  Lock,
  ChevronRight,
  CheckCircle2,
  Calendar,
  Award,
} from 'lucide-react';

interface CompletedQuiz {
  id: string;
  quiz_id: string;
  score: number;
  tag: string;
  answers: Record<string, string>;
  created_at: string;
  quizzes: {
    title: string;
    description: string | null;
  } | null;
}

interface CreatedQuiz {
  id: string;
  title: string;
  description: string | null;
  is_public: boolean;
  created_at: string;
  question_count: number;
}

export default function MyQuizzesPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [completedQuizzes, setCompletedQuizzes] = useState<CompletedQuiz[]>([]);
  const [createdQuizzes, setCreatedQuizzes] = useState<CreatedQuiz[]>([]);
  const initialTab = (location.state as { tab?: string })?.tab === 'created' ? 'created' : 'completed';
  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const user = await getCurrentUser();
      if (!user) {
        navigate('/auth');
        return;
      }

      // 并行加载已完成和已创建的问卷
      await Promise.all([
        loadCompletedQuizzes(user.id),
        loadCreatedQuizzes(user.id),
      ]);
    } catch (err) {
      console.error('加载数据失败:', err);
      messageToast.error('加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  const loadCompletedQuizzes = async (userId: string) => {
    const { data, error } = await supabase
      .from('quiz_results')
      .select(`
        id,
        quiz_id,
        score,
        tag,
        answers,
        created_at,
        quizzes (title, description)
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    setCompletedQuizzes((data || []) as unknown as CompletedQuiz[]);
  };

  const loadCreatedQuizzes = async (userId: string) => {
    const { data, error } = await supabase
      .from('quizzes')
      .select('id, title, description, is_public, created_at')
      .eq('creator_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // 获取每个问卷的题目数量
    const quizzesWithCount = await Promise.all(
      (data || []).map(async (quiz: any) => {
        const { count } = await supabase
          .from('quiz_questions')
          .select('*', { count: 'exact', head: true })
          .eq('quiz_id', quiz.id);
        return { ...quiz, question_count: count || 0 };
      })
    );

    setCreatedQuizzes(quizzesWithCount);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-[#2D5A27]" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* 页面标题 */}
      <div className="glass rounded-3xl p-6 shadow-xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ClipboardList className="w-8 h-8 text-[#2D5A27]" />
          <div>
            <h1 className="text-3xl font-bold text-[#2C3E50]">我的问卷</h1>
            <p className="text-gray-600">管理你参与和创建的所有问卷</p>
          </div>
        </div>
        <Button
          onClick={() => navigate('/create-quiz')}
          className="bg-gradient-to-r from-[#2D5A27] to-[#234a1f] hover:from-[#234a1f] hover:to-[#1a3515] text-white shadow-lg"
        >
          <Plus className="w-4 h-4 mr-2" />
          创建问卷
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="glass border-0 shadow-lg w-full grid grid-cols-2 h-12">
          <TabsTrigger
            value="completed"
            className="data-[state=active]:bg-[#2D5A27] data-[state=active]:text-white rounded-xl font-medium"
          >
            <CheckCircle2 className="w-4 h-4 mr-2" />
            我已完成
            {completedQuizzes.length > 0 && (
              <span className="ml-2 bg-white/30 text-current text-xs rounded-full px-2 py-0.5">
                {completedQuizzes.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="created"
            className="data-[state=active]:bg-[#2D5A27] data-[state=active]:text-white rounded-xl font-medium"
          >
            <Edit3 className="w-4 h-4 mr-2" />
            我创建的
            {createdQuizzes.length > 0 && (
              <span className="ml-2 bg-white/30 text-current text-xs rounded-full px-2 py-0.5">
                {createdQuizzes.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* 我已完成 */}
        <TabsContent value="completed" className="space-y-4">
          {completedQuizzes.length === 0 ? (
            <div className="glass rounded-3xl p-16 text-center shadow-xl">
              <CheckCircle2 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-xl text-gray-600 mb-2">还没有完成过问卷</h3>
              <p className="text-gray-400 mb-6">去首页挑选感兴趣的问卷开始答题吧！</p>
              <Button
                onClick={() => navigate('/')}
                className="bg-[#2D5A27] hover:bg-[#234a1f] text-white"
              >
                去首页浏览
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {completedQuizzes.map((result) => (
                <CompletedQuizCard
                  key={result.id}
                  result={result}
                  onView={() => navigate(`/my-quizzes/result/${result.id}`)}
                  formatDate={formatDate}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* 我创建的 */}
        <TabsContent value="created" className="space-y-4">
          {createdQuizzes.length === 0 ? (
            <div className="glass rounded-3xl p-16 text-center shadow-xl">
              <Edit3 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-xl text-gray-600 mb-2">还没有创建过问卷</h3>
              <p className="text-gray-400 mb-6">创建你的专属问卷，邀请朋友一起参与！</p>
              <Button
                onClick={() => navigate('/create-quiz')}
                className="bg-[#2D5A27] hover:bg-[#234a1f] text-white"
              >
                <Plus className="w-4 h-4 mr-2" />
                立即创建
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {createdQuizzes.map((quiz) => (
                <CreatedQuizCard
                  key={quiz.id}
                  quiz={quiz}
                  onEdit={() => navigate(`/edit-quiz/${quiz.id}`)}
                  formatDate={formatDate}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// 已完成问卷卡片
function CompletedQuizCard({
  result,
  onView,
  formatDate,
}: {
  result: CompletedQuiz;
  onView: () => void;
  formatDate: (d: string) => string;
}) {
  const answers = result.answers as Record<string, string>;
  const answerCount = Object.keys(answers).length;

  return (
    <Card
      className="glass-card border-0 shadow-xl group shine-effect overflow-hidden cursor-pointer transition-transform hover:scale-[1.02] active:scale-[0.99]"
      onClick={onView}
    >
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-5 h-5 text-[#2D5A27] shrink-0" />
              <h3 className="text-lg font-bold text-[#2C3E50] truncate group-hover:text-[#2D5A27] transition-colors">
                {result.quizzes?.title || '未知问卷'}
              </h3>
            </div>
            {result.quizzes?.description && (
              <p className="text-gray-500 text-sm mb-3 line-clamp-1">{result.quizzes.description}</p>
            )}
            <div className="flex flex-wrap gap-3 text-sm text-gray-500">
              <div className="flex items-center gap-1">
                <Award className="w-4 h-4 text-amber-500" />
                <span className="font-semibold text-amber-600">{result.score}分</span>
                <Badge variant="outline" className="ml-1 text-xs border-amber-300 text-amber-700 bg-amber-50">
                  {result.tag}
                </Badge>
              </div>
              <div className="flex items-center gap-1">
                <ClipboardList className="w-4 h-4" />
                <span>已回答 {answerCount} 道题</span>
              </div>
              <div className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                <span>{formatDate(result.created_at)}</span>
              </div>
            </div>
          </div>
          <div className="shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-[#2D5A27]/10 text-[#2D5A27] group-hover:bg-[#2D5A27]/20 transition-colors">
            <ChevronRight className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// 已创建问卷卡片
function CreatedQuizCard({
  quiz,
  onEdit,
  formatDate,
}: {
  quiz: CreatedQuiz;
  onEdit: () => void;
  formatDate: (d: string) => string;
}) {
  return (
    <Card
      className="glass-card border-0 shadow-xl group shine-effect overflow-hidden cursor-pointer transition-transform hover:scale-[1.02] active:scale-[0.99]"
      onClick={onEdit}
    >
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              {quiz.is_public ? (
                <Globe className="w-5 h-5 text-blue-500 shrink-0" />
              ) : (
                <Lock className="w-5 h-5 text-gray-400 shrink-0" />
              )}
              <h3 className="text-lg font-bold text-[#2C3E50] truncate group-hover:text-[#2D5A27] transition-colors">
                {quiz.title}
              </h3>
              <Badge
                variant={quiz.is_public ? 'default' : 'secondary'}
                className={`shrink-0 text-xs ${quiz.is_public ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-gray-100 text-gray-500'}`}
              >
                {quiz.is_public ? '公开' : '私密'}
              </Badge>
            </div>
            {quiz.description && (
              <p className="text-gray-500 text-sm mb-3 line-clamp-2">{quiz.description}</p>
            )}
            <div className="flex flex-wrap gap-3 text-sm text-gray-500">
              <div className="flex items-center gap-1">
                <ClipboardList className="w-4 h-4" />
                <span>{quiz.question_count} 道题目</span>
              </div>
              <div className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                <span>创建于 {formatDate(quiz.created_at)}</span>
              </div>
            </div>
          </div>
          <Button
            size="sm"
            className="shrink-0 bg-[#2D5A27] hover:bg-[#234a1f] text-white shadow-md group-hover:scale-105 transition-transform pointer-events-none"
            tabIndex={-1}
          >
            <Edit3 className="w-4 h-4 mr-1" />
            编辑
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
