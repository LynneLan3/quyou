import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase/client';
import { getCurrentUser } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { messageToast } from '@/components/MessageModal';
import { Loader2, ChevronRight } from 'lucide-react';
import { decodeFromParam, encodeFromParam } from '@/lib/shareLink';

interface QuestionWithOptions {
  question_code: string;
  question_text: string;
  display_order: number;
  options: {
    id: string;
    option_text: string;
    score: number;
  }[];
}

interface QuizData {
  id: string;
  title: string;
  scoring_rules: {
    rules: {
      min: number;
      max: number;
      tag: string;
      description: string;
    }[];
  };
}

export default function QuizPage() {
  const { quizId } = useParams<{ quizId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // 优先用 URL 的 from（分享人 id，已编码），登录跳转后若丢失则从 sessionStorage 恢复；解码得到真实用户 id
  const fromRaw = searchParams.get('from') || (quizId ? sessionStorage.getItem(`from_quiz_${quizId}`) : null);
  const fromUserId = decodeFromParam(fromRaw);

  const [quiz, setQuiz] = useState<QuizData | null>(null);
  const [questions, setQuestions] = useState<QuestionWithOptions[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [selectedOption, setSelectedOption] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [inviteInfo, setInviteInfo] = useState<{nickname?: string, fromUserId: string} | null>(null);

  useEffect(() => {
    const fetchQuizData = async () => {
      if (!quizId) return;

      try {
        // 如果是受邀答题，获取邀请人信息
        if (fromUserId) {
          const { data: fromUserProfile } = await supabase
            .from('profiles')
            .select('nickname')
            .eq('id', fromUserId)
            .single();
          
          if (fromUserProfile) {
            setInviteInfo({
              nickname: (fromUserProfile as any).nickname,
              fromUserId
            });
          }
        }

        // 获取问卷信息
        const { data: quizData, error: quizError } = await supabase
          .from('quizzes')
          .select('id, title, scoring_rules')
          .eq('id', quizId)
          .single();

        if (quizError) throw quizError;
        setQuiz(quizData);

        // 获取题目和选项
        const { data: questionsData, error: questionsError } = await supabase
          .from('quiz_questions')
          .select(`
            display_order,
            questions:question_code (
              question_code,
              question_text
            )
          `)
          .eq('quiz_id', quizId)
          .order('display_order');

        // 获取每个问题的选项
        const questionCodes = (questionsData as any[])?.map(q => q.questions.question_code) || [];
        console.log('Question codes from nested structure:', questionCodes);
        
        const { data: optionsData, error: optionsError } = await supabase
          .from('options')
          .select('id, question_code, option_text, score')
          .in('question_code', questionCodes)
          .order('display_order');

        console.log('Options data:', optionsData);
        console.log('Options error:', optionsError);

        if (optionsError) throw optionsError;

        if (questionsError) throw questionsError;
        console.log('Questions data:', questionsData);

        const formattedQuestions = (questionsData || []).map((q: any) => {
          const questionOptions = (optionsData || []).filter((opt: any) => {
            console.log('Matching option:', opt.question_code, 'with question:', q.questions.question_code);
            return opt.question_code === q.questions.question_code;
          });
          console.log('Question', q.questions.question_code, 'has', questionOptions.length, 'options');
          return {
            question_code: q.questions.question_code,
            question_text: q.questions.question_text,
            display_order: q.display_order,
            options: questionOptions,
          };
        });

        console.log('Quiz questions loaded:', formattedQuestions.length);
        console.log('Sample question:', formattedQuestions[0]);

        setQuestions(formattedQuestions);
      } catch (error) {
        console.error('Error fetching quiz:', error);
        messageToast.error('加载问卷失败');
      } finally {
        setLoading(false);
      }
    };

    fetchQuizData();
  }, [quizId]);

  const handleOptionSelect = (optionId: string) => {
    setSelectedOption(optionId);
  };

  const handleNext = async () => {
    if (!selectedOption) {
      messageToast.error('请选择一个选项');
      return;
    }

    const currentQuestion = questions[currentIndex];
    const newAnswers = { ...answers, [currentQuestion.question_code]: selectedOption };
    setAnswers(newAnswers);

    if (currentIndex < questions.length - 1) {
      // 进入下一题
      setTimeout(() => {
        setCurrentIndex(currentIndex + 1);
        setSelectedOption('');
      }, 300);
    } else {
      // 提交答案
      await submitQuiz(newAnswers);
    }
  };

  const submitQuiz = async (finalAnswers: Record<string, string>) => {
    if (!quiz || !quizId) return;

    setSubmitting(true);

    try {
      const user = await getCurrentUser();
      if (!user) {
        messageToast.error('请先登录');
        return;
      }

      // 计算总分
      let totalScore = 0;
      Object.entries(finalAnswers).forEach(([questionCode, optionId]) => {
        const question = questions.find(q => q.question_code === questionCode);
        const option = question?.options.find(o => o.id === optionId);
        if (option) {
          totalScore += option.score;
        }
      });

      // 匹配标签
      const matchedRule = quiz.scoring_rules.rules.find(
        rule => totalScore >= rule.min && totalScore <= rule.max
      );
      const tag = matchedRule?.tag || '未知类型';

      // 保存答题结果：先删除旧记录，再插入新记录（避免 upsert 约束问题）
      const row = {
        user_id: user.id,
        quiz_id: quizId,
        score: totalScore,
        tag: tag,
        answers: finalAnswers as any,
        created_at: new Date().toISOString(),
      } as any;

      // 删除该用户该问卷的旧记录
      const { error: deleteError } = await supabase
        .from('quiz_results')
        .delete()
        .eq('user_id', user.id)
        .eq('quiz_id', quizId);

      if (deleteError) {
        console.error('删除旧记录失败:', deleteError);
        // 继续执行，可能是没有旧记录
      }

      // 插入新记录
      const { data: resultData, error: insertError } = await supabase
        .from('quiz_results')
        .insert(row)
        .select('id')
        .single();

      if (insertError) {
        console.error('插入记录失败:', insertError);
        console.error('尝试插入的数据:', row);
        throw insertError;
      }

      // 如果是受邀答题，创建匹配记录（只创建一条，避免重复）
      if (fromUserId && fromUserId !== user.id) {
        const { error: matchError } = await supabase
          .from('matches')
          .insert({
            requester_id: fromUserId,
            receiver_id: user.id,
            quiz_id: quizId,
            requester_agreed: false,
            receiver_agreed: false,
            status: 'pending',
          } as any);

        if (matchError && !matchError.message.includes('unique constraint') && !matchError.message.includes('duplicate')) {
          messageToast.warning('答题已保存，但匹配记录创建失败。请在「我的匹配」中查看，或联系管理员检查数据库权限。');
        } else {
          try { sessionStorage.removeItem(`from_quiz_${quizId}`); } catch (_) {}
        }
      }

      messageToast.success('答题完成！');
      // 如果是受邀答题，跳转时携带from参数
      console.log('🔍 [QuizPage调试] fromUserId:', fromUserId);
      console.log('🔍 [QuizPage调试] resultData:', resultData);
      const resultPath = fromUserId
        ? `/result/${(resultData as any)?.id}?from=${encodeFromParam(fromUserId)}`
        : `/result/${(resultData as any)?.id}`;
      console.log('🔍 [QuizPage调试] 跳转路径:', resultPath);
      navigate(resultPath);
    } catch (error: any) {
      const msg = error?.message || String(error);
      messageToast.error(msg ? `提交失败：${msg.slice(0, 80)}${msg.length > 80 ? '…' : ''}` : '提交失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-[#2D5A27]" />
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">问卷暂无题目</p>
      </div>
    );
  }

  const currentQuestion = questions[currentIndex];
  const progress = ((currentIndex + 1) / questions.length) * 100;
  const isLastQuestion = currentIndex === questions.length - 1;

  return (
    <div className="max-w-2xl mx-auto">
      {/* 邀请提示 */}
      {inviteInfo && (
        <div className="mb-6 p-5 glass rounded-2xl border-2 border-blue-200/50 shadow-xl animate-scale-in">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center shadow-lg animate-float">
              <span className="text-white text-2xl font-semibold">👋</span>
            </div>
            <div>
              <h3 className="font-bold text-blue-900 text-lg">
                {inviteInfo.nickname || '朋友'} 邀请你参与测试
              </h3>
              <p className="text-blue-700 text-sm mt-1">
                完成测试后你们可以看到彼此的匹配度
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 进度条 */}
      <div className="mb-8 glass rounded-2xl p-4 shadow-lg">
        <div className="flex justify-between text-sm text-gray-700 font-medium mb-3">
          <span>题目 {currentIndex + 1} / {questions.length}</span>
          <span className="text-[#2D5A27] font-bold">{Math.round(progress)}%</span>
        </div>
        <Progress value={progress} className="h-3 shadow-inner" />
      </div>

      {/* 题目卡片 */}
      <Card className="glass-card border-0 shadow-2xl animate-scale-in">
        <CardContent className="p-10">
          <h2 className="text-2xl font-bold text-[#2C3E50] mb-8 leading-relaxed">
            {currentQuestion.question_text}
          </h2>

          <RadioGroup 
            value={selectedOption} 
            onValueChange={handleOptionSelect}
            className="space-y-3"
          >
            {currentQuestion.options.map((option) => (
              <div
                key={option.id}
                onClick={() => handleOptionSelect(option.id)}
                className={`
                  flex items-center space-x-4 p-5 rounded-2xl border-2 cursor-pointer
                  transition-all duration-300 shine-effect
                  ${selectedOption === option.id 
                    ? 'border-[#2D5A27] bg-[#2D5A27]/10 shadow-lg scale-105' 
                    : 'border-white/40 hover:border-[#2D5A27]/40 hover:bg-white/60 hover:scale-102'
                  }
                `}
              >
                <RadioGroupItem 
                  value={option.id} 
                  id={option.id}
                  className="border-[#2D5A27] text-[#2D5A27]"
                />
                <Label 
                  htmlFor={option.id} 
                  className="flex-1 cursor-pointer font-normal"
                >
                  {option.option_text}
                </Label>
              </div>
            ))}
          </RadioGroup>

          <Button
            onClick={handleNext}
            disabled={!selectedOption || submitting}
            className="w-full mt-10 h-14 bg-gradient-to-r from-[#2D5A27] to-[#234a1f] hover:from-[#234a1f] hover:to-[#1a3515] text-white text-lg font-bold shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105"
          >
            {submitting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                {isLastQuestion ? '完成答题' : '下一题'}
                <ChevronRight className="w-5 h-5 ml-2" />
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
