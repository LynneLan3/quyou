import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase/client';
import { getCurrentUser } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { messageToast } from '@/components/MessageModal';
import { Loader2, Plus, Trash2, Save, ArrowLeft, Globe, Lock } from 'lucide-react';

interface QuestionData {
  id: string;           // 本地唯一 ID（用于 React key 和 UI 逻辑）
  question_code: string; // 数据库中的 question_code
  question_text: string;
  options: OptionData[];
  isNew?: boolean;      // 标记是否是新增的题目
}

interface OptionData {
  id: string;           // 本地唯一 ID
  db_id?: string;       // 数据库中的 option id
  option_text: string;
  score: number;
  display_order: number;
  isNew?: boolean;
}

export default function EditQuizPage() {
  const { quizId } = useParams<{ quizId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [quizTitle, setQuizTitle] = useState('');
  const [quizDescription, setQuizDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [questions, setQuestions] = useState<QuestionData[]>([]);

  useEffect(() => {
    loadQuiz();
  }, [quizId]);

  const loadQuiz = async () => {
    if (!quizId) return;
    setLoading(true);
    try {
      const user = await getCurrentUser();
      if (!user) {
        navigate('/auth');
        return;
      }

      // 加载问卷基本信息
      const { data: quizData, error: quizError } = await supabase
        .from('quizzes')
        .select('*')
        .eq('id', quizId)
        .single();

      if (quizError) throw quizError;
      if ((quizData as any).creator_id !== user.id) {
        messageToast.error('无权编辑此问卷');
        navigate('/my-quizzes');
        return;
      }

      setQuizTitle((quizData as any).title);
      setQuizDescription((quizData as any).description || '');
      setIsPublic((quizData as any).is_public ?? false);

      // 加载题目列表
      const { data: qqData, error: qqError } = await supabase
        .from('quiz_questions')
        .select('question_code, display_order')
        .eq('quiz_id', quizId)
        .order('display_order', { ascending: true });

      if (qqError) throw qqError;

      // 加载每道题及选项
      const loadedQuestions: QuestionData[] = await Promise.all(
        (qqData || []).map(async (qq: any, idx: number) => {
          const { data: qData } = await supabase
            .from('questions')
            .select('question_text')
            .eq('question_code', qq.question_code)
            .single();

          const { data: optsData } = await supabase
            .from('options')
            .select('id, option_text, score, display_order')
            .eq('question_code', qq.question_code)
            .order('display_order', { ascending: true });

          return {
            id: `q-${idx}`,
            question_code: qq.question_code,
            question_text: (qData as any)?.question_text || '',
            options: (optsData || []).map((o: any, oi: number) => ({
              id: `q-${idx}-o-${oi}`,
              db_id: o.id,
              option_text: o.option_text,
              score: o.score,
              display_order: o.display_order,
            })),
          };
        })
      );

      setQuestions(loadedQuestions);
    } catch (err: any) {
      console.error('加载问卷失败:', err);
      messageToast.error('加载失败');
    } finally {
      setLoading(false);
    }
  };

  // ---- 题目操作 ----
  const addQuestion = () => {
    if (questions.length >= 10) {
      messageToast.error('最多只能有10道题目');
      return;
    }
    const newId = `new-${Date.now()}`;
    setQuestions([
      ...questions,
      {
        id: newId,
        question_code: '',
        question_text: '',
        options: [
          { id: `${newId}-o1`, option_text: '', score: 1, display_order: 1, isNew: true },
          { id: `${newId}-o2`, option_text: '', score: 2, display_order: 2, isNew: true },
        ],
        isNew: true,
      },
    ]);
  };

  const removeQuestion = (questionId: string) => {
    if (questions.length <= 1) {
      messageToast.error('至少保留1道题目');
      return;
    }
    setQuestions(questions.filter((q) => q.id !== questionId));
  };

  const updateQuestion = (questionId: string, text: string) => {
    setQuestions(questions.map((q) => (q.id === questionId ? { ...q, question_text: text } : q)));
  };

  const addOption = (questionId: string) => {
    setQuestions(
      questions.map((q) => {
        if (q.id !== questionId) return q;
        if (q.options.length >= 6) {
          messageToast.error('每道题最多6个选项');
          return q;
        }
        const newOId = `${questionId}-o-${Date.now()}`;
        return {
          ...q,
          options: [
            ...q.options,
            {
              id: newOId,
              option_text: '',
              score: q.options.length + 1,
              display_order: q.options.length + 1,
              isNew: true,
            },
          ],
        };
      })
    );
  };

  const removeOption = (questionId: string, optionId: string) => {
    setQuestions(
      questions.map((q) => {
        if (q.id !== questionId) return q;
        if (q.options.length <= 2) {
          messageToast.error('每道题至少2个选项');
          return q;
        }
        return { ...q, options: q.options.filter((o) => o.id !== optionId) };
      })
    );
  };

  const updateOption = (questionId: string, optionId: string, text: string) => {
    setQuestions(
      questions.map((q) =>
        q.id === questionId
          ? { ...q, options: q.options.map((o) => (o.id === optionId ? { ...o, option_text: text } : o)) }
          : q
      )
    );
  };

  const updateOptionScore = (questionId: string, optionId: string, score: number) => {
    setQuestions(
      questions.map((q) =>
        q.id === questionId
          ? { ...q, options: q.options.map((o) => (o.id === optionId ? { ...o, score } : o)) }
          : q
      )
    );
  };

  // ---- 校验 ----
  const validateForm = () => {
    if (!quizTitle.trim()) { messageToast.error('请输入问卷名称'); return false; }
    if (!quizDescription.trim()) { messageToast.error('请输入问卷简介'); return false; }
    for (const q of questions) {
      if (!q.question_text.trim()) { messageToast.error('请填写所有题目内容'); return false; }
      if (q.options.length < 2) { messageToast.error('每道题至少2个选项'); return false; }
      for (const o of q.options) {
        if (!o.option_text.trim()) { messageToast.error('请填写所有选项内容'); return false; }
      }
    }
    return true;
  };

  // ---- 保存 ----
  const handleSave = async () => {
    if (!validateForm() || !quizId) return;
    setSaving(true);
    try {
      // 1. 更新问卷基本信息和 is_public
      const maxScore = questions.reduce((sum, q) => {
        return sum + Math.max(...q.options.map((o) => o.score));
      }, 0);
      const scoringRules = {
        rules: [
          { min: 0, max: Math.floor(maxScore * 0.3), tag: '初级型', description: '刚开始探索这个领域' },
          { min: Math.floor(maxScore * 0.3) + 1, max: Math.floor(maxScore * 0.7), tag: '进阶型', description: '对该领域有一定了解' },
          { min: Math.floor(maxScore * 0.7) + 1, max: maxScore, tag: '专家型', description: '在该领域经验丰富' },
        ],
      };

      const { error: updateQuizError } = await (supabase.from('quizzes') as any)
        .update({
          title: quizTitle,
          description: quizDescription,
          scoring_rules: scoringRules,
          is_public: isPublic,
        })
        .eq('id', quizId);

      if (updateQuizError) throw updateQuizError;

      // 2. 处理每道题
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];

        if (q.isNew) {
          // 全新题目：创建 question + options + quiz_questions
          const questionCode = `custom_${quizId}_q${Date.now()}_${i}`;

          await (supabase.from('questions') as any).insert({
            question_code: questionCode,
            question_text: q.question_text,
            category: 'custom',
          });

          await (supabase.from('options') as any).insert(
            q.options.map((o, oi) => ({
              question_code: questionCode,
              option_text: o.option_text,
              score: o.score,
              display_order: oi + 1,
            }))
          );

          await (supabase.from('quiz_questions') as any).insert({
            quiz_id: quizId,
            question_code: questionCode,
            display_order: i + 1,
          });
        } else {
          // 已有题目：更新 question_text 和 display_order
          await (supabase.from('questions') as any)
            .update({ question_text: q.question_text })
            .eq('question_code', q.question_code);

          await (supabase.from('quiz_questions') as any)
            .update({ display_order: i + 1 })
            .eq('quiz_id', quizId)
            .eq('question_code', q.question_code);

          // 处理选项：删除旧选项，重新插入
          await supabase.from('options').delete().eq('question_code', q.question_code);
          await (supabase.from('options') as any).insert(
            q.options.map((o, oi) => ({
              question_code: q.question_code,
              option_text: o.option_text,
              score: o.score,
              display_order: oi + 1,
            }))
          );
        }
      }

      messageToast.success('问卷保存成功！');
      navigate('/my-quizzes');
    } catch (err: any) {
      console.error('保存失败:', err);
      messageToast.error(err.message || '保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-[#2D5A27]" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      {/* 标题栏 */}
      <div className="flex items-center justify-between glass rounded-2xl p-6 shadow-xl">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/my-quizzes', { state: { tab: 'created' } })}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            返回
          </Button>
          <h1 className="text-3xl font-bold text-[#2C3E50]">✏️ 编辑问卷</h1>
        </div>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-[#2D5A27] hover:bg-[#234a1f] text-white"
        >
          {saving ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              保存修改
            </>
          )}
        </Button>
      </div>

      {/* 基本信息 */}
      <Card className="glass-card border-0 shadow-xl">
        <CardHeader>
          <CardTitle>基本信息</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="title">问卷名称 *</Label>
            <Input
              id="title"
              placeholder="例如：兴趣匹配问卷"
              value={quizTitle}
              onChange={(e) => setQuizTitle(e.target.value)}
              maxLength={50}
            />
          </div>
          <div>
            <Label htmlFor="description">问卷简介 *</Label>
            <Textarea
              id="description"
              placeholder="简单介绍这个问卷的用途..."
              value={quizDescription}
              onChange={(e) => setQuizDescription(e.target.value)}
              rows={3}
              maxLength={200}
            />
          </div>
          {/* 隐私/公开切换 */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-white/50 border border-white/40">
            <div className="flex items-center gap-3">
              {isPublic ? (
                <Globe className="w-5 h-5 text-[#2D5A27]" />
              ) : (
                <Lock className="w-5 h-5 text-gray-500" />
              )}
              <div>
                <p className="font-medium text-[#2C3E50]">{isPublic ? '公开问卷' : '私密问卷'}</p>
                <p className="text-sm text-gray-500">
                  {isPublic ? '所有人可在首页看到并参与' : '仅通过链接邀请才能参与'}
                </p>
              </div>
            </div>
            <Switch checked={isPublic} onCheckedChange={setIsPublic} />
          </div>
        </CardContent>
      </Card>

      {/* 题目列表 */}
      {questions.map((question, qIndex) => (
        <Card key={question.id} className="glass-card border-0 shadow-xl">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>
              题目 {qIndex + 1}
              {question.isNew && (
                <span className="ml-2 text-xs font-normal text-green-600 bg-green-50 px-2 py-0.5 rounded-full">新增</span>
              )}
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => removeQuestion(question.id)}
              className="text-red-500 hover:text-red-700"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>题目内容 *</Label>
              <Textarea
                placeholder="请输入题目..."
                value={question.question_text}
                onChange={(e) => updateQuestion(question.id, e.target.value)}
                rows={2}
                maxLength={200}
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>选项（{question.options.length}/6）</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addOption(question.id)}
                  disabled={question.options.length >= 6}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  添加选项
                </Button>
              </div>

              {question.options.map((option, oIndex) => (
                <div key={option.id} className="flex items-center gap-2">
                  <span className="text-sm text-gray-500 w-6">{String.fromCharCode(65 + oIndex)}.</span>
                  <Input
                    placeholder="选项内容"
                    value={option.option_text}
                    onChange={(e) => updateOption(question.id, option.id, e.target.value)}
                    maxLength={100}
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    placeholder="分数"
                    value={option.score}
                    onChange={(e) => updateOptionScore(question.id, option.id, parseInt(e.target.value) || 1)}
                    min={1}
                    max={10}
                    className="w-20"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeOption(question.id, option.id)}
                    disabled={question.options.length <= 2}
                    className="text-red-500"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      {/* 添加题目 */}
      <Button
        variant="outline"
        onClick={addQuestion}
        disabled={questions.length >= 10}
        className="w-full h-16 border-dashed border-2"
      >
        <Plus className="w-5 h-5 mr-2" />
        添加题目（{questions.length}/10）
      </Button>
    </div>
  );
}
