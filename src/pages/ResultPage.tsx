import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase/client';
import { getCurrentUser } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { messageToast } from '@/components/MessageModal';
import { Loader2, Copy, Share2, Check, MapPin, Users, Award, ClipboardList } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import * as htmlToImage from 'html-to-image';
import { encodeFromParam, decodeFromParam } from '@/lib/shareLink';

interface QuizResult {
  id: string;
  score: number;
  tag: string;
  quiz_id: string;
  user_id: string;
  answers: Record<string, string>;
  quizzes: {
    title: string;
    scoring_rules: {
      rules: {
        min: number;
        max: number;
        tag: string;
        description: string;
      }[];
    };
  };
}

interface MatchInfo {
  otherResult?: {
    score: number;
    tag: string;
    answers: Record<string, string>;
  };
  otherUser?: {
    id: string;
    nickname: string;
    avatar_url?: string;
    gender?: string;
    province?: string;
  };
  matchId?: string;
  matchPercent?: number;
  answerMatchPercent?: number;
}

export default function ResultPage() {
  const { resultId } = useParams<{ resultId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [result, setResult] = useState<QuizResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState({
    nickname: '',
    bio: '',
    contact_info: '',
  });
  const [hasProfile, setHasProfile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [matchInfo, setMatchInfo] = useState<MatchInfo | null>(null);
  const [answerRecordList, setAnswerRecordList] = useState<{ question_text: string; option_text: string; display_order: number }[]>([]);
  const shareCardRef = useRef<HTMLDivElement | null>(null);
  const [downloadingCard, setDownloadingCard] = useState(false);
  const [backgroundImage, setBackgroundImage] = useState<string>('');

  const [userProfile, setUserProfile] = useState<{ nickname?: string; avatar_url?: string } | null>(null);

  useEffect(() => {
    const fetchResult = async () => {
      if (!resultId) return;

      try {
        const user = await getCurrentUser();
        if (!user) {
          messageToast.error('请先登录');
          navigate('/auth');
          return;
        }

        // 获取用户资料（用于分享卡片头像/昵称）
        const { data: profileBasic } = await supabase
          .from('profiles')
          .select('nickname, avatar_url')
          .eq('id', user.id)
          .single();
        setUserProfile(profileBasic);

        // 获取 from 参数（从 URL 或 sessionStorage），解码为真实用户 id
        const fromRaw = searchParams.get('from') || sessionStorage.getItem(`from_${resultId}`);
        const fromParam = decodeFromParam(fromRaw);
        if (fromRaw) {
          sessionStorage.setItem(`from_${resultId}`, fromRaw);
        }

        // 获取答题结果
        const { data, error } = await supabase
          .from('quiz_results')
          .select(`
            id,
            score,
            tag,
            quiz_id,
            user_id,
            answers,
            quizzes:quiz_id (
              title,
              scoring_rules
            )
          `)
          .eq('id', resultId)
          .single();

        if (error) throw error;
        setResult(data as QuizResult);

        // 设置背景图片
        if ((data as any)?.quizzes?.title) {
          // 优先使用本地背景图，如果没有再拉取 Unsplash
          setBackgroundImage('/share-card-bg.png');
        }

        // 加载完整答题记录（题目文案 + 选项文案，按题目顺序）
        const quizId = (data as any).quiz_id;
        const answers = (data as any).answers as Record<string, string>;
        if (quizId && answers && Object.keys(answers).length > 0) {
          const { data: qqData } = await supabase
            .from('quiz_questions')
            .select('question_code, display_order')
            .eq('quiz_id', quizId)
            .order('display_order', { ascending: true });
          const questionCodes = (qqData || []).map((r: any) => r.question_code);
          if (questionCodes.length > 0) {
            const { data: qData } = await supabase
              .from('questions')
              .select('question_code, question_text')
              .in('question_code', questionCodes);
            const { data: optData } = await supabase
              .from('options')
              .select('id, question_code, option_text')
              .in('question_code', questionCodes);
            const questionsMap = new Map((qData || []).map((r: any) => [r.question_code, r.question_text]));
            const optionsByCode = new Map<string, { id: string; option_text: string }[]>();
            (optData || []).forEach((o: any) => {
              if (!optionsByCode.has(o.question_code)) optionsByCode.set(o.question_code, []);
              optionsByCode.get(o.question_code)!.push({ id: o.id, option_text: o.option_text });
            });
            const list: { question_text: string; option_text: string; display_order: number }[] = [];
            (qqData || []).forEach((qq: any) => {
              const question_text = questionsMap.get(qq.question_code) || '';
              const optionId = answers[qq.question_code];
              const opts = optionsByCode.get(qq.question_code) || [];
              const option_text = opts.find(x => x.id === optionId)?.option_text ?? '';
              list.push({ question_text, option_text, display_order: qq.display_order });
            });
            setAnswerRecordList(list);
          }
        }

        // 检查是否已有资料
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();

        if (profileData) {
          setProfile({
            nickname: (profileData as any).nickname || '',
            bio: (profileData as any).bio || '',
            contact_info: (profileData as any).contact_info || '',
          });
          setHasProfile(true);
        }

        // 检查是否有匹配记录（双向匹配的情况）
        // 如果有fromParam，优先查找与该用户的匹配记录
        let matchData: any = null;
        
        if (fromParam) {
          console.log('🔍 [调试] 正在查找与分享人的匹配记录...');
          console.log('🔍 [调试] 当前用户ID:', user.id);
          console.log('🔍 [调试] 分享人ID:', fromParam);
          console.log('🔍 [调试] 问卷ID:', (data as any).quiz_id);
          
          // 优先查找与分享人的匹配记录 - 使用limit(1)避免多条记录错误
          const { data: specificMatches, error: matchError } = await supabase
            .from('matches')
            .select('*')
            .or(`and(requester_id.eq.${fromParam},receiver_id.eq.${user.id}),and(requester_id.eq.${user.id},receiver_id.eq.${fromParam})`)
            .eq('quiz_id', (data as any).quiz_id)
            .limit(1);
          
          console.log('🔍 [调试] 匹配记录查询结果:', specificMatches);
          console.log('🔍 [调试] 匹配记录查询错误:', matchError);
          matchData = specificMatches && specificMatches.length > 0 ? specificMatches[0] : null;
        }

        // 如果没有找到特定匹配，查找任意匹配记录
        if (!matchData) {
          console.log('🔍 [调试] 未找到特定匹配，查找任意匹配记录...');
          const { data: anyMatches, error: anyMatchError } = await supabase
            .from('matches')
            .select('*')
            .or(`receiver_id.eq.${user.id},requester_id.eq.${user.id}`)
            .eq('quiz_id', (data as any).quiz_id)
            .limit(1);
          
          console.log('🔍 [调试] 任意匹配记录查询结果:', anyMatches);
          console.log('🔍 [调试] 任意匹配记录查询错误:', anyMatchError);
          matchData = anyMatches && anyMatches.length > 0 ? anyMatches[0] : null;
        }

        if (matchData) {
          console.log('✅ [调试] 找到匹配记录！', matchData);
          
          // 获取对方的答题结果和用户信息
          const otherUserId = matchData.requester_id === user.id 
            ? matchData.receiver_id 
            : matchData.requester_id;
          
          console.log('🔍 [调试] 对方用户ID:', otherUserId);
          
          // 获取对方的答题结果（包含详细答案）
          const { data: otherResult, error: resultError } = await supabase
            .from('quiz_results')
            .select('score, tag, answers')
            .eq('user_id', otherUserId)
            .eq('quiz_id', (data as any).quiz_id)
            .maybeSingle();

          console.log('🔍 [调试] 对方答题结果:', otherResult);
          console.log('🔍 [调试] 对方答题结果错误:', resultError);

          // 获取对方的用户信息
          const { data: otherUser, error: userError } = await supabase
            .from('profiles')
            .select('id, nickname, avatar_url, gender, province')
            .eq('id', otherUserId)
            .maybeSingle();

          console.log('🔍 [调试] 对方用户信息:', otherUser);
          console.log('🔍 [调试] 对方用户信息错误:', userError);

          if (otherResult && otherUser) {
            console.log('✅ [调试] 开始计算匹配度...');
            
            // 计算答案匹配度（按百分制）
            const myAnswers = (data as any).answers as Record<string, string>;
            const theirAnswers = (otherResult as any).answers as Record<string, string>;
            const totalQuestions = Object.keys(myAnswers).length;
            const matchingAnswers = Object.keys(myAnswers).filter(
              key => myAnswers[key] === theirAnswers[key]
            ).length;
            const answerMatchPercent = totalQuestions > 0 
              ? Math.round((matchingAnswers / totalQuestions) * 100) 
              : 0;

            console.log('🔍 [调试] 我的答案:', myAnswers);
            console.log('🔍 [调试] 对方答案:', theirAnswers);
            console.log('🔍 [调试] 总题目数:', totalQuestions);
            console.log('🔍 [调试] 相同答案数:', matchingAnswers);
            console.log('🔍 [调试] 答案匹配度:', answerMatchPercent + '%');

            // 计算风格匹配度（基于分数差异）
            const scoreDiff = Math.abs((otherResult as any).score - (data as any).score);
            const matchPercent = Math.max(0, 100 - scoreDiff);

            console.log('🔍 [调试] 风格匹配度:', matchPercent + '%');

            const matchInfoData = {
              otherResult: otherResult as any,
              otherUser: otherUser as any,
              matchId: matchData.id,
              matchPercent,
              answerMatchPercent,
            };
            
            console.log('✅ [调试] 最终匹配信息:', matchInfoData);
            setMatchInfo(matchInfoData);
          } else {
            console.log('❌ [调试] 缺少对方信息，无法显示匹配度');
            console.log('🔍 [调试] otherResult存在?', !!otherResult);
            console.log('🔍 [调试] otherUser存在?', !!otherUser);
          }
        } else {
          console.log('❌ [调试] 没有找到任何匹配记录');
        }
      } catch (error) {
        console.error('❌ [调试] 发生错误:', error);
        messageToast.error('加载结果失败');
      } finally {
        setLoading(false);
      }
    };

    fetchResult();
  }, [resultId, navigate, searchParams]);

  // 调试信息显示组件（已隐藏，不再展示）
  const DebugInfo = () => null;

  const handleSaveProfile = async () => {
    if (!profile.nickname.trim()) {
      messageToast.error('请输入昵称');
      return;
    }

    setSaving(true);

    try {
      const user = await getCurrentUser();
      if (!user) {
        messageToast.error('请先登录');
        return;
      }

      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          nickname: profile.nickname,
          bio: profile.bio,
          contact_info: profile.contact_info,
        } as any);

      if (error) throw error;

      setHasProfile(true);
      messageToast.success('资料保存成功！');
    } catch (error) {
      console.error('Error saving profile:', error);
      messageToast.error('保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  const handleCopyLink = () => {
    if (!result) return;

    const userId = result.user_id;
    const quizId = result.quiz_id;
    const encodedFrom = encodeFromParam(userId);
    const shareUrl = `${window.location.origin}/quiz/${quizId}?from=${encodedFrom}`;
    const copyText = `好友邀请你来答题，点击进入：${shareUrl}`;

    console.log('🔗 [分享链接] 原始 userId:', userId);
    console.log('🔗 [分享链接] 编码后 from:', encodedFrom);
    console.log('🔗 [分享链接] 完整链接:', shareUrl);
    console.log('🔗 [分享链接] 复制文案:', copyText);

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
        pixelRatio: 3,
        quality: 1.0,
      });
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `${result.quizzes.title || '问卷'}-分享卡片.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      messageToast.success('分享卡片已保存，快去发给朋友吧');
    } catch (error) {
      console.error('生成分享卡片失败:', error);
      messageToast.error('生成分享卡片失败，请稍后重试');
    } finally {
      setDownloadingCard(false);
    }
  };

  const getTagDescription = () => {
    if (!result) return '';
    const rule = result.quizzes.scoring_rules.rules.find(
      r => r.tag === result.tag
    );
    return rule?.description || '';
  };

  const goToMatchAnswers = () => {
    if (!matchInfo?.matchId) {
      messageToast.error('暂无匹配信息');
      return;
    }
    navigate(`/match-answers/${matchInfo.matchId}`);
  };

  // 根据问卷主题获取吸引用户的文案
  const getAttractiveText = (quizTitle: string, tag: string, score: number) => {
    const keywords = quizTitle.toLowerCase();
    const resultText = `我的风格是【${tag}】，获得了 ${score} 分！`;
    
    if (keywords.includes('旅行') || keywords.includes('旅游')) {
      return {
        main: resultText,
        sub: '好友邀请你来答题，看看我们的旅行契合度有多高？',
        invite: '点击进入，开启你的旅行性格测试'
      };
    } else if (keywords.includes('爱情') || keywords.includes('恋爱') || keywords.includes('情感')) {
      return {
        main: resultText,
        sub: '想知道你是什么恋爱类型吗？快来和我匹配一下吧！',
        invite: '点击进入，测测你的心动指数'
      };
    } else if (keywords.includes('性格') || keywords.includes('心理')) {
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
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="glass rounded-3xl p-8 shadow-2xl animate-scale-in">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-12 h-12 animate-spin text-[#2D5A27]" />
            <p className="text-[#2D5A27] font-semibold text-lg">加载结果中...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">结果不存在</p>
      </div>
    );
  }

  const encodedFrom = encodeFromParam(result.user_id);
  const shareUrl = `${window.location.origin}/quiz/${result.quiz_id}?from=${encodedFrom}`;
  
  console.log('📱 [二维码生成]');
  console.log('  - window.location.origin:', window.location.origin);
  console.log('  - result.quiz_id:', result.quiz_id);
  console.log('  - result.user_id:', result.user_id);
  console.log('  - encodedFrom:', encodedFrom);
  console.log('  - shareUrl:', shareUrl);
  console.log('  - shareUrl.length:', shareUrl.length);

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in-up">
      {/* 调试信息面板 */}
      <DebugInfo />
      
      {/* 结果卡片 */}
      <Card className="glass-card border-0 overflow-hidden shadow-2xl animate-scale-in shine-effect">
        <div className="bg-gradient-to-br from-[#2D5A27] to-[#234a1f] p-10 text-white text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-white/5 backdrop-blur-sm"></div>
          <div className="relative z-10">
            <MapPin className="w-16 h-16 mx-auto mb-6 opacity-90 animate-float drop-shadow-2xl" />
            <h2 className="text-xl opacity-95 mb-3 font-semibold tracking-wide">你的风格是</h2>
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

      {/* 完整答题记录：进入结果页后可上下滚动查看全部题目与选项 */}
      {answerRecordList.length > 0 && (
        <Card className="glass-card border-0 overflow-hidden shadow-2xl animate-scale-in">
          <div className="bg-gradient-to-br from-[#2D5A27]/10 to-[#234a1f]/5 p-6 border-b border-white/30">
            <div className="flex items-center gap-3">
              <ClipboardList className="w-6 h-6 text-[#2D5A27]" />
              <h3 className="text-xl font-bold text-[#2C3E50]">完整答题记录</h3>
            </div>
            <p className="text-sm text-gray-500 mt-1">上下滑动查看全部题目与你的选择</p>
          </div>
          <CardContent className="p-0">
            <div className="max-h-[60vh] overflow-y-auto overscroll-contain">
              <div className="divide-y divide-gray-100">
                {answerRecordList.map((item, index) => (
                  <div key={index} className="p-5 hover:bg-gray-50/80 transition-colors">
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

      {/* 好友信息和匹配度显示（受邀答题时） */}
      {matchInfo && matchInfo.otherUser && (
        <Card className="glass-card border-0 overflow-hidden shadow-2xl animate-scale-in">
          <div className="bg-gradient-to-br from-[#2D5A27]/20 to-[#234a1f]/10 p-8 border-b border-white/30">
            <div className="flex items-center gap-4 mb-6">
              <Award className="w-8 h-8 text-[#2D5A27] animate-float" />
              <h3 className="text-2xl font-bold text-[#2C3E50]">💕 与好友的匹配结果</h3>
            </div>
            
            {/* 好友信息卡片 */}
            <div className="flex items-center gap-5 p-6 glass rounded-2xl shadow-lg hover:scale-105 transition-all duration-300">
              <Avatar className="w-20 h-20 border-4 border-white/50 shadow-xl ring-2 ring-[#2D5A27]/20">
                {matchInfo.otherUser.avatar_url ? (
                  <AvatarImage 
                    src={matchInfo.otherUser.avatar_url} 
                    alt={matchInfo.otherUser.nickname}
                  />
                ) : (
                  <AvatarFallback className="bg-gradient-to-br from-[#2D5A27] to-[#234a1f] text-white text-2xl font-bold">
                    {matchInfo.otherUser.nickname.charAt(0).toUpperCase()}
                  </AvatarFallback>
                )}
              </Avatar>
              <div className="flex-1">
                <h4 className="font-bold text-[#2C3E50] text-xl mb-1">{matchInfo.otherUser.nickname}</h4>
                <p className="text-sm text-gray-500 flex items-center gap-2 mt-1">
                  {matchInfo.otherUser.gender && (
                    <span>{matchInfo.otherUser.gender === 'male' ? '👨' : '👩'} {matchInfo.otherUser.gender === 'male' ? '男' : '女'}</span>
                  )}
                  {matchInfo.otherUser.province && (
                    <span>📍 {matchInfo.otherUser.province}</span>
                  )}
                </p>
                {matchInfo.otherResult && (
                  <div className="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-[#2D5A27]/20 rounded-full shadow-sm backdrop-blur-sm">
                    <MapPin className="w-4 h-4 text-[#2D5A27]" />
                    <span className="text-sm font-bold text-[#2D5A27]">{matchInfo.otherResult.tag}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <CardContent className="p-8">
            {/* 答案匹配度（点击可查看对方完整答案） */}
            <div className="mb-6">
              <div
                role="button"
                tabIndex={0}
                onClick={goToMatchAnswers}
                onKeyDown={(e) => e.key === 'Enter' && goToMatchAnswers()}
                className="text-center p-8 bg-gradient-to-br from-blue-100 to-blue-200 rounded-2xl border-2 border-blue-300/50 shadow-xl shine-effect hover:scale-105 hover:ring-2 hover:ring-blue-400/50 transition-all duration-300 cursor-pointer"
              >
                <div className="flex items-center justify-center gap-3 mb-4">
                  <Users className="w-7 h-7 text-blue-700" />
                  <p className="text-base text-blue-900 font-bold">答案匹配度</p>
                </div>
                <div className="text-6xl font-bold text-blue-700 mb-4">
                  {matchInfo.answerMatchPercent}
                  <span className="text-4xl">%</span>
                </div>
                <p className="text-base text-blue-800 font-medium">
                  你们有 <span className="font-bold text-lg">{matchInfo.answerMatchPercent}%</span> 的答案相同
                </p>
                <p className="text-xs text-blue-600/90 mt-2">点击可查看答案详情</p>
              </div>
            </div>

            {/* 风格相似度、对方的得分已隐藏 */}

            {/* 匹配度说明 */}
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs text-amber-800">
                💡 <span className="font-medium">匹配度说明：</span>
                答案匹配度根据相同答案的题目数量计算，百分比越高说明你们的选择越相似！
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 个人信息表单 */}
      {!hasProfile ? (
        <Card className="shadow-lg border-0">
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold text-[#2C3E50] mb-4">
              完善你的资料
            </h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nickname">昵称 *</Label>
                <Input
                  id="nickname"
                  placeholder="给自己起个名字"
                  value={profile.nickname}
                  onChange={(e) => setProfile({ ...profile, nickname: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bio">个人简介</Label>
                <Textarea
                  id="bio"
                  placeholder="简单介绍一下自己..."
                  value={profile.bio}
                  onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact">联系方式</Label>
                <Input
                  id="contact"
                  placeholder="微信号 / 手机号（匹配后可见）"
                  value={profile.contact_info}
                  onChange={(e) => setProfile({ ...profile, contact_info: e.target.value })}
                />
              </div>
              <Button
                onClick={handleSaveProfile}
                disabled={saving}
                className="w-full bg-[#2D5A27] hover:bg-[#234a1f] text-white"
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : '保存并生成分享链接'}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        /* 分享功能 */
        <Card className="shadow-lg border-0">
          <CardContent className="p-6 space-y-4">
            <h3 className="text-lg font-semibold text-[#2C3E50] flex items-center gap-2">
              <Share2 className="w-5 h-5" />
              分享给朋友
            </h3>
            <p className="text-gray-500 text-sm">
              你可以直接复制链接发给朋友，或者生成一张带二维码的分享卡片，让朋友扫码进入问卷页面答题。
            </p>

            {/* 分享方式按钮 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Button
                onClick={handleCopyLink}
                variant="outline"
                className="h-12 border-[#2D5A27] text-[#2D5A27] hover:bg-[#2D5A27]/10"
              >
                {copied ? (
                  <>
                    <Check className="w-5 h-5 mr-2" />
                    已复制分享链接
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
                    正在生成分享卡片...
                  </>
                ) : (
                  <>
                    <Share2 className="w-5 h-5 mr-2" />
                    生成并保存分享卡片
                  </>
                )}
              </Button>
            </div>

            {/* 分享卡片预览（用于生成图片） */}
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

                      {(() => {
                        const attractiveText = getAttractiveText(result.quizzes.title, result.tag, result.score);
                        return (
                          <div className="space-y-3">
                            <p className="text-sm text-white/90 font-medium leading-relaxed drop-shadow-md">
                              {attractiveText.sub}
                            </p>
                          </div>
                        );
                      })()}
                    </div>

                    {/* 底部：二维码（方形带圆角） */}
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
                        <div className="w-28 h-28 bg-white rounded-xl p-2 shadow-2xl flex items-center justify-center relative z-10 border-2 border-white/20">
                          <QRCodeSVG 
                            value={shareUrl} 
                            size={104}
                            bgColor="#FFFFFF"
                            fgColor="#000000"
                            level="H"
                            includeMargin={true}
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
      )}

      {/* 操作按钮 */}
      <div className="flex gap-4">
        <Button
          onClick={() => navigate('/matches')}
          variant="outline"
          className="flex-1 h-12"
        >
          查看我的匹配
        </Button>
        <Button
          onClick={() => navigate('/')}
          className="flex-1 h-12 bg-[#2D5A27] hover:bg-[#234a1f] text-white"
        >
          返回首页
        </Button>
      </div>

    </div>
  );
}
