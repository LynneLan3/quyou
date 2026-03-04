import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase/client';
import { getCurrentUser } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { messageToast } from '@/components/MessageModal';
import {
  Loader2,
  ArrowLeft,
  MapPin,
  ClipboardList,
  Share2,
  Copy,
  Check,
  Users,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import * as htmlToImage from 'html-to-image';
import { encodeFromParam } from '@/lib/shareLink';

interface QuizResult {
  id: string;
  score: number;
  tag: string;
  quiz_id: string;
  user_id: string;
  answers: Record<string, string>;
  created_at: string;
  quizzes: {
    title: string;
    description: string | null;
    scoring_rules: {
      rules: { min: number; max: number; tag: string; description: string }[];
    };
  };
}

function getInviteCopy(quizTitle: string, tag: string, score: number): { main: string; sub: string; invite: string } {
  const k = quizTitle.toLowerCase();
  const resultText = `我的风格是【${tag}】，获得了 ${score} 分！`;
  
  if (k.includes('旅行') || k.includes('旅游')) {
    return {
      main: resultText,
      sub: '好友邀请你来答题，看看我们的旅行契合度有多高？',
      invite: '点击进入，开启你的旅行性格测试'
    };
  } else if (k.includes('爱情') || k.includes('恋爱') || k.includes('情感')) {
    return {
      main: resultText,
      sub: '想知道你是什么恋爱类型吗？快来和我匹配一下吧！',
      invite: '点击进入，测测你的心动指数'
    };
  } else if (k.includes('性格') || k.includes('心理')) {
    return {
      main: resultText,
      sub: '我发现了一个超准的性格测试，快来看看我们是不是同类人？',
      invite: '点击进入，探索你的内心世界'
    };
  }
  
  return {
    main: resultText,
    sub: '好友邀请你参加这个有趣的问卷，快来测测你的得分吧！',
    invite: '点击进入，看看我们有多默契'
  };
}

export default function CompletedQuizDetailPage() {
  const { resultId } = useParams<{ resultId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [answerRecordList, setAnswerRecordList] = useState<
    { question_text: string; option_text: string; display_order: number }[]
  >([]);
  const [backgroundImage, setBackgroundImage] = useState('');
  const [copied, setCopied] = useState(false);
  const [downloadingCard, setDownloadingCard] = useState(false);
  const [userProfile, setUserProfile] = useState<{ nickname?: string; avatar_url?: string } | null>(null);
  const shareCardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!resultId) return;
      try {
        const user = await getCurrentUser();
        if (!user) {
          messageToast.error('请先登录');
          navigate('/auth');
          return;
        }

        // 获取用户资料
        const { data: profileData } = await supabase
          .from('profiles')
          .select('nickname, avatar_url')
          .eq('id', user.id)
          .single();
        setUserProfile(profileData);

        const { data, error } = await supabase
          .from('quiz_results')
          .select(
            `
            id, score, tag, quiz_id, user_id, answers, created_at,
            quizzes:quiz_id ( title, description, scoring_rules )
          `
          )
          .eq('id', resultId)
          .single();

        if (error || !data) {
          messageToast.error('结果不存在');
          navigate('/my-quizzes');
          return;
        }

        if ((data as any).user_id !== user.id) {
          messageToast.error('无权查看');
          navigate('/my-quizzes');
          return;
        }

        setResult(data as QuizResult);
        setBackgroundImage('/share-card-bg.png');

        const quizId = (data as any).quiz_id;
        const answers = (data as any).answers as Record<string, string>;
        if (quizId && answers && Object.keys(answers).length > 0) {
          const { data: qqData } = await supabase
            .from('quiz_questions')
            .select('question_code, display_order')
            .eq('quiz_id', quizId)
            .order('display_order', { ascending: true });
          const codes = (qqData || []).map((r: any) => r.question_code);
          if (codes.length > 0) {
            const { data: qData } = await supabase
              .from('questions')
              .select('question_code, question_text')
              .in('question_code', codes);
            const { data: optData } = await supabase
              .from('options')
              .select('id, question_code, option_text')
              .in('question_code', codes);
            const qMap = new Map((qData || []).map((r: any) => [r.question_code, r.question_text]));
            const optByCode = new Map<string, { id: string; option_text: string }[]>();
            (optData || []).forEach((o: any) => {
              if (!optByCode.has(o.question_code)) optByCode.set(o.question_code, []);
              optByCode.get(o.question_code)!.push({ id: o.id, option_text: o.option_text });
            });
            const list: { question_text: string; option_text: string; display_order: number }[] = [];
            (qqData || []).forEach((qq: any) => {
              const question_text = qMap.get(qq.question_code) || '';
              const optId = answers[qq.question_code];
              const opts = optByCode.get(qq.question_code) || [];
              const option_text = opts.find((x) => x.id === optId)?.option_text ?? '';
              list.push({ question_text, option_text, display_order: qq.display_order });
            });
            setAnswerRecordList(list);
          }
        }
      } catch (e) {
        console.error(e);
        messageToast.error('加载失败');
        navigate('/my-quizzes');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [resultId, navigate]);

  const getTagDescription = () => {
    if (!result) return '';
    const rules = result.quizzes?.scoring_rules?.rules || [];
    const rule = rules.find((r) => r.tag === result.tag);
    return rule?.description || '';
  };

  const shareUrl = result
    ? `${window.location.origin}/quiz/${result.quiz_id}?from=${encodeFromParam(result.user_id)}`
    : '';
  
  if (result) {
    console.log('📱 [CompletedQuizDetail二维码] shareUrl:', shareUrl);
    console.log('📱 [CompletedQuizDetail二维码] window.location.origin:', window.location.origin);
    console.log('📱 [CompletedQuizDetail二维码] result.quiz_id:', result.quiz_id);
    console.log('📱 [CompletedQuizDetail二维码] result.user_id:', result.user_id);
    console.log('📱 [CompletedQuizDetail二维码] encodeFromParam(result.user_id):', encodeFromParam(result.user_id));
  }

  const handleCopyLink = () => {
    if (!result) return;
    const copyText = `好友邀请你来答题，点击进入：${shareUrl}`;
    navigator.clipboard.writeText(copyText);
    setCopied(true);
    messageToast.success('链接已复制到剪贴板');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadShareCard = async () => {
    if (!shareCardRef.current || !result) return;
    try {
      setDownloadingCard(true);
      const dataUrl = await htmlToImage.toPng(shareCardRef.current, {
        cacheBust: true,
        pixelRatio: window.devicePixelRatio || 2,
      });
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `${result.quizzes.title || '问卷'}-分享卡片.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      messageToast.success('分享卡片已保存');
    } catch (err) {
      console.error(err);
      messageToast.error('生成分享卡片失败');
    } finally {
      setDownloadingCard(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-10 h-10 animate-spin text-[#2D5A27]" />
        <p className="mt-4 text-[#2D5A27] font-medium">加载中...</p>
      </div>
    );
  }

  if (!result) return null;

  const inviteCopy = getInviteCopy(result.quizzes.title, result.tag, result.score);

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in-up pb-20">
      {/* 返回按钮 */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          onClick={() => navigate('/my-quizzes')}
          className="gap-2 text-[#2C3E50] hover:bg-[#2D5A27]/10"
        >
          <ArrowLeft className="w-4 h-4" />
          返回已完成列表
        </Button>
      </div>

      {/* 结果卡片 */}
      <Card className="glass-card border-0 overflow-hidden shadow-2xl">
        <div className="bg-gradient-to-br from-[#2D5A27] to-[#234a1f] p-10 text-white text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-white/5 backdrop-blur-sm" />
          <div className="relative z-10">
            <MapPin className="w-16 h-16 mx-auto mb-6 opacity-90" />
            <h2 className="text-xl opacity-95 mb-3 font-semibold">你的答题结果</h2>
            <h1 className="text-5xl font-bold mb-4 drop-shadow-2xl">{result.tag}</h1>
            <p className="text-white/90 text-lg font-medium">总分: {result.score}/100</p>
          </div>
        </div>
        <CardContent className="p-8">
          <p className="text-gray-700 text-center leading-relaxed text-lg">
            {getTagDescription()}
          </p>
        </CardContent>
      </Card>

      {/* 完整答题记录 */}
      {answerRecordList.length > 0 && (
        <Card className="glass-card border-0 overflow-hidden shadow-2xl">
          <div className="bg-gradient-to-br from-[#2D5A27]/10 to-[#234a1f]/5 p-6 border-b border-white/30">
            <div className="flex items-center gap-3">
              <ClipboardList className="w-6 h-6 text-[#2D5A27]" />
              <h3 className="text-xl font-bold text-[#2C3E50]">完整答题记录</h3>
            </div>
            <p className="text-sm text-gray-500 mt-1">上下滑动查看全部题目与你的选择</p>
          </div>
          <CardContent className="p-0">
            <div className="max-h-[50vh] overflow-y-auto overscroll-contain">
              <div className="divide-y divide-gray-100">
                {answerRecordList.map((item, index) => (
                  <div key={index} className="p-5 hover:bg-gray-50/80">
                    <p className="text-sm text-gray-500 mb-1.5">第 {index + 1} 题</p>
                    <p className="text-[#2C3E50] font-medium mb-2">{item.question_text}</p>
                    <div className="flex items-center gap-2 pl-3 py-2 rounded-lg bg-[#2D5A27]/10 border border-[#2D5A27]/20">
                      <Check className="w-4 h-4 text-[#2D5A27] shrink-0" />
                      <span className="text-[#2D5A27] font-medium">{item.option_text}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 分享：复制链接 + 生成分享卡片 */}
      <Card className="shadow-lg border-0">
        <CardContent className="p-6 space-y-4">
          <h3 className="text-lg font-semibold text-[#2C3E50] flex items-center gap-2">
            <Share2 className="w-5 h-5" />
            分享给朋友
          </h3>
          <p className="text-gray-500 text-sm">
            复制链接或生成分享卡片，邀请朋友扫码答题，一起看看是否同路人。
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Button
              onClick={handleCopyLink}
              variant="outline"
              className="h-12 border-[#2D5A27] text-[#2D5A27] hover:bg-[#2D5A27]/10"
            >
              {copied ? (
                <>
                  <Check className="w-5 h-5 mr-2" />
                  已复制
                </>
              ) : (
                <>
                  <Copy className="w-5 h-5 mr-2" />
                  复制分享链接
                </>
              )}
            </Button>
            <Button
              onClick={handleDownloadShareCard}
              disabled={downloadingCard}
              className="h-12 bg-[#2D5A27] hover:bg-[#234a1f] text-white"
            >
              {downloadingCard ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <Share2 className="w-5 h-5 mr-2" />
                  生成并保存分享卡片
                </>
              )}
            </Button>
          </div>

          {/* 分享卡片：精美风景背景 + 自己的结果 + 吸引朋友 */}
          <div className="mt-4">
            <p className="text-xs text-gray-400 mb-2">分享卡片预览（精美风景背景，右下角圆形二维码）</p>
            <div className="flex justify-center">
              <div
                ref={shareCardRef}
                className="relative w-full max-w-xs aspect-[9/16] rounded-[40px] overflow-hidden shadow-2xl"
              >
                {/* 背景：第一张图 + 虚化，无图时用 Unsplash 风景 */}
                <div 
                  className="absolute inset-0 bg-cover bg-center scale-110"
                  style={{
                    backgroundImage: `url(${backgroundImage || '/share-card-bg.png'})`,
                    filter: 'blur(4px)',
                  }}
                />
                
                {/* 渐变遮罩层 - 确保文字可读性 */}
                <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/80" />
                
                <div className="relative z-10 h-full flex flex-col justify-between p-8">
                  {/* 顶部：问卷主题和标签 */}
                  <div className="space-y-4">
                    <div className="inline-flex items-center px-3 py-1 bg-white/20 backdrop-blur-md rounded-full border border-white/30">
                      <span className="text-[10px] font-bold text-white tracking-widest uppercase">
                        {result.quizzes.title}
                      </span>
                    </div>
                    
                    <div className="space-y-1">
                      <h2 className="text-3xl font-black text-white leading-tight drop-shadow-2xl">
                        {result.tag}
                      </h2>
                      <div className="h-1 w-12 bg-white/60 rounded-full" />
                    </div>
                  </div>

                  {/* 中间：用户信息和吸引文案 */}
                  <div className="space-y-6">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full border-2 border-white/80 shadow-xl overflow-hidden bg-white/10 backdrop-blur-sm">
                        {userProfile?.avatar_url ? (
                          <img src={userProfile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Users className="w-6 h-6 text-white/80" />
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white drop-shadow-md">
                          {userProfile?.nickname || '我的好友'}
                        </p>
                        <p className="text-[10px] text-white/70">邀请你参加问卷</p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <p className="text-sm text-white/90 font-medium leading-relaxed drop-shadow-md">
                        {inviteCopy.sub}
                      </p>
                    </div>
                  </div>

                  {/* 底部：二维码（完美圆形） */}
                  <div className="flex items-end justify-between">
                    <div className="space-y-1 pb-2">
                      <p className="text-[10px] font-bold text-white/60 tracking-tight">
                        SCAN TO JOIN
                      </p>
                      <p className="text-[9px] text-white/40">
                        扫码查看我们的匹配度
                      </p>
                    </div>
                    
                    <div className="relative group">
                      <div className="absolute inset-0 bg-white/20 rounded-xl blur-xl animate-pulse" />
                      <div className="w-24 h-24 bg-white rounded-xl p-2 shadow-2xl flex items-center justify-center relative z-10 border-2 border-white/20">
                        <QRCodeSVG 
                          value={shareUrl} 
                          size={80}
                          bgColor="#FFFFFF"
                          fgColor="#000000"
                          level="M"
                          includeMargin={false}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
