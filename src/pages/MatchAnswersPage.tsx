import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase/client';
import { getCurrentUser } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2, ArrowLeft, ClipboardList, Check, XCircle } from 'lucide-react';

interface AnswerRow {
  question_text: string;
  option_text_other: string;
  option_text_mine: string | null;
  same: boolean | null; // null = 我未答此题
}

export default function MatchAnswersPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [otherNickname, setOtherNickname] = useState('');
  const [quizTitle, setQuizTitle] = useState('');
  const [rows, setRows] = useState<AnswerRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!matchId) {
        setError('缺少匹配信息');
        setLoading(false);
        return;
      }
      try {
        const user = await getCurrentUser();
        if (!user) {
          toast.error('请先登录');
          navigate('/auth');
          return;
        }
        const currentUserId = user.id;

        const { data: match, error: matchErr } = await supabase
          .from('matches')
          .select('requester_id, receiver_id, quiz_id')
          .eq('id', matchId)
          .single();

        if (matchErr || !match) {
          setError('匹配记录不存在');
          setLoading(false);
          return;
        }

        const otherUserId = match.requester_id === currentUserId ? match.receiver_id : match.requester_id;
        const quizId = match.quiz_id;

        const [
          { data: otherProfile },
          { data: quizData },
          { data: myResult },
          { data: otherResult },
        ] = await Promise.all([
          supabase.from('profiles').select('nickname').eq('id', otherUserId).single(),
          supabase.from('quizzes').select('title').eq('id', quizId).maybeSingle(),
          supabase.from('quiz_results').select('answers').eq('user_id', currentUserId).eq('quiz_id', quizId).maybeSingle(),
          supabase.from('quiz_results').select('answers').eq('user_id', otherUserId).eq('quiz_id', quizId).maybeSingle(),
        ]);

        setOtherNickname((otherProfile as any)?.nickname || 'TA');
        setQuizTitle((quizData as any)?.title || '未知问卷');

        const myAnswers = myResult?.answers
          ? (typeof (myResult as any).answers === 'string' ? JSON.parse((myResult as any).answers) : (myResult as any).answers) as Record<string, string>
          : null;
        const otherAnswers = otherResult?.answers
          ? (typeof (otherResult as any).answers === 'string' ? JSON.parse((otherResult as any).answers) : (otherResult as any).answers) as Record<string, string>
          : null;

        if (!otherAnswers || Object.keys(otherAnswers).length === 0) {
          setError('暂无对方答题数据');
          setLoading(false);
          return;
        }

        const { data: qqData } = await supabase
          .from('quiz_questions')
          .select('question_code, display_order')
          .eq('quiz_id', quizId)
          .order('display_order', { ascending: true });

        const questionCodes = (qqData || []).map((r: any) => r.question_code);
        if (questionCodes.length === 0) {
          setError('暂无题目数据');
          setLoading(false);
          return;
        }

        const [{ data: qData }, { data: optData }] = await Promise.all([
          supabase.from('questions').select('question_code, question_text').in('question_code', questionCodes),
          supabase.from('options').select('id, question_code, option_text').in('question_code', questionCodes),
        ]);

        const questionsMap = new Map((qData || []).map((r: any) => [r.question_code, r.question_text]));
        const optionsByCode = new Map<string, { id: string; option_text: string }[]>();
        (optData || []).forEach((o: any) => {
          if (!optionsByCode.has(o.question_code)) optionsByCode.set(o.question_code, []);
          optionsByCode.get(o.question_code)!.push({ id: o.id, option_text: o.option_text });
        });

        const list: AnswerRow[] = [];
        (qqData || []).forEach((qq: any) => {
          const question_text = questionsMap.get(qq.question_code) || '';
          const otherOptionId = otherAnswers[qq.question_code];
          const myOptionId = myAnswers?.[qq.question_code] ?? null;
          const opts = optionsByCode.get(qq.question_code) || [];
          const option_text_other = opts.find(x => x.id === otherOptionId)?.option_text ?? '';
          const option_text_mine = myOptionId != null ? (opts.find(x => x.id === myOptionId)?.option_text ?? '') : null;
          const same = myOptionId != null ? myOptionId === otherOptionId : null;
          list.push({ question_text, option_text_other, option_text_mine, same });
        });

        setRows(list);
      } catch (e) {
        console.error(e);
        setError('加载失败');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [matchId, navigate]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-10 h-10 animate-spin text-[#2D5A27]" />
        <p className="mt-4 text-[#2D5A27] font-medium">加载答案详情中...</p>
      </div>
    );
  }

  if (error || rows.length === 0) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <Button variant="ghost" onClick={() => navigate(-1)} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          返回
        </Button>
        <Card className="border-0 shadow-lg">
          <CardContent className="py-12 text-center text-gray-500">
            {error || '暂无答案数据'}
          </CardContent>
        </Card>
      </div>
    );
  }

  const hasMyAnswers = rows.some(r => r.option_text_mine != null);
  const sameCount = rows.filter(r => r.same === true).length;
  const diffCount = rows.filter(r => r.same === false).length;

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between gap-4">
        <Button variant="ghost" onClick={() => navigate(-1)} className="gap-2 shrink-0">
          <ArrowLeft className="w-4 h-4" />
          返回
        </Button>
      </div>

      <Card className="glass-card border-0 overflow-hidden shadow-2xl">
        <div className="bg-gradient-to-br from-[#2D5A27]/15 to-[#234a1f]/10 p-6 border-b border-white/30">
          <div className="flex items-center gap-3 mb-1">
            <ClipboardList className="w-6 h-6 text-[#2D5A27]" />
            <h1 className="text-xl font-bold text-[#2C3E50]">
              TA 的完整答案{otherNickname ? ` · ${otherNickname}` : ''}
            </h1>
          </div>
          <p className="text-sm text-gray-500">{quizTitle}</p>
          {hasMyAnswers && (
            <p className="text-xs text-gray-500 mt-2">
              与你对比：<span className="text-green-600 font-medium">{sameCount} 题相同</span>
              {diffCount > 0 && (
                <>，<span className="text-amber-600 font-medium">{diffCount} 题不同</span></>
              )}
            </p>
          )}
        </div>
        <CardContent className="p-0">
          <div className="max-h-[70vh] overflow-y-auto overscroll-contain">
            <div className="divide-y divide-gray-100">
              {rows.map((row, index) => (
                <div
                  key={index}
                  className={`p-5 transition-colors ${
                    row.same === false
                      ? 'bg-amber-50/80 border-l-4 border-amber-400'
                      : row.same === true
                        ? 'bg-green-50/50'
                        : ''
                  }`}
                >
                  <p className="text-sm text-gray-500 mb-1">第 {index + 1} 题</p>
                  <p className="text-[#2C3E50] font-medium mb-3">{row.question_text}</p>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-gray-500 shrink-0">TA 的选择：</span>
                      <span className="text-[#2D5A27] font-medium">{row.option_text_other}</span>
                    </div>

                    {row.option_text_mine != null && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-gray-500 shrink-0">你的选择：</span>
                        <span className={row.same ? 'text-gray-700' : 'text-amber-800 font-semibold'}>
                          {row.option_text_mine}
                        </span>
                        {row.same !== null && (
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                              row.same
                                ? 'bg-green-100 text-green-800'
                                : 'bg-amber-200 text-amber-900'
                            }`}
                          >
                            {row.same ? (
                              <>
                                <Check className="w-3 h-3" />
                                相同
                              </>
                            ) : (
                              <>
                                <XCircle className="w-3 h-3" />
                                不同
                              </>
                            )}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
