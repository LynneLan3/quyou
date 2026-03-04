import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase/client';
import { getCurrentUser } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { messageToast } from '@/components/MessageModal';
import { Loader2, Users, Heart, Check, Eye, Copy, ClipboardList, Award, XCircle } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface MatchWithDetails {
  id: string;
  requester_id: string;
  receiver_id: string;
  quiz_id: string;
  requester_agreed: boolean;
  receiver_agreed: boolean;
  status: 'pending' | 'matched' | 'rejected';
  created_at: string;
  otherUser: {
    id: string;
    nickname: string | null;
    avatar_url?: string | null;
    gender?: string | null;
    province?: string | null;
    bio?: string | null;
  };
  myResult: {
    tag: string;
    score: number;
    answers: any;
  } | null;
  otherResult: {
    tag: string;
    score: number;
    answers: any;
  } | null;
  quizTitle: string;
  matchScore: number; // 匹配度百分比
}

type MatchFilter = 'all' | 'matched' | 'rejected';

export default function MatchesPage() {
  const [matches, setMatches] = useState<MatchWithDetails[]>([]);
  const [filter, setFilter] = useState<MatchFilter>('all');
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [contactInfo, setContactInfo] = useState<{ 
    nickname: string; 
    contact_info: string;
    avatar_url?: string | null;
    gender?: string | null;
    province?: string | null;
    bio?: string | null;
  } | null>(null);
  const [loadingContact, setLoadingContact] = useState(false);
  const navigate = useNavigate();

  // 根据筛选条件过滤匹配记录
  const filteredMatches = matches.filter(match => {
    if (filter === 'all') return true;
    if (filter === 'matched') return match.status === 'matched';
    if (filter === 'rejected') return match.status === 'rejected';
    return true;
  });

  // 计算待处理匹配数量
  const pendingMatchesCount = matches.filter(match => {
    const isRequester = match.requester_id === currentUserId;
    const myAgreed = isRequester ? match.requester_agreed : match.receiver_agreed;
    const otherAgreed = isRequester ? match.receiver_agreed : match.requester_agreed;
    
    return match.status === 'pending' && !myAgreed && otherAgreed;
  }).length;

  // 计算匹配度：基于两人的答案相似度
  const calculateMatchScore = (myAnswers: any, otherAnswers: any): number => {
    if (!myAnswers || !otherAnswers) return 0;

    // 确保 answers 是对象
    const myAns = typeof myAnswers === 'string' ? JSON.parse(myAnswers) : myAnswers;
    const otherAns = typeof otherAnswers === 'string' ? JSON.parse(otherAnswers) : otherAnswers;

    // 获取所有问题代码
    const allQuestions = new Set([...Object.keys(myAns), ...Object.keys(otherAns)]);
    
    if (allQuestions.size === 0) return 0;

    // 计算相同答案的数量
    let sameAnswers = 0;
    allQuestions.forEach(question => {
      if (myAns[question] === otherAns[question]) {
        sameAnswers++;
      }
    });

    // 返回百分比
    return Math.round((sameAnswers / allQuestions.size) * 100);
  };

  useEffect(() => {
    const fetchMatches = async () => {
      try {
        const user = await getCurrentUser();
        if (!user) {
          messageToast.error('请先登录');
          return;
        }
        setCurrentUserId(user.id);

        // 获取匹配记录（包含全部状态：pending、matched、rejected）
        const { data: matchesData, error: matchesError } = await supabase
          .from('matches')
          .select('*')
          .or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`)
          .order('created_at', { ascending: false });

        if (matchesError) throw matchesError;

        // 获取详细信息
        const enrichedMatches = await Promise.all(
          (matchesData || []).map(async (match: any) => {
            const isRequester = match.requester_id === user.id;
            const otherUserId = isRequester ? match.receiver_id : match.requester_id;

            // 获取对方资料
            const { data: otherProfile } = await supabase
              .from('profiles')
              .select('nickname, avatar_url, gender, province, bio')
              .eq('id', otherUserId)
              .single();

            // 获取问卷信息
            const { data: quizData } = await supabase
              .from('quizzes')
              .select('title')
              .eq('id', match.quiz_id)
              .maybeSingle();

            // 获取双方答题结果（需要 score 和 answers 来计算匹配度）
            const { data: myResults } = await supabase
              .from('quiz_results')
              .select('tag, score, answers')
              .eq('user_id', user.id)
              .eq('quiz_id', match.quiz_id)
              .maybeSingle();

            const { data: otherResults } = await supabase
              .from('quiz_results')
              .select('tag, score, answers')
              .eq('user_id', otherUserId)
              .eq('quiz_id', match.quiz_id)
              .maybeSingle();

            // 计算匹配度
            const matchScore = calculateMatchScore(
              (myResults as any)?.answers,
              (otherResults as any)?.answers
            );

            return {
              ...match,
              otherUser: {
                id: otherUserId,
                nickname: (otherProfile as any)?.nickname || '未知用户',
                avatar_url: (otherProfile as any)?.avatar_url,
                gender: (otherProfile as any)?.gender,
                province: (otherProfile as any)?.province,
                bio: (otherProfile as any)?.bio,
              },
              myResult: myResults as any,
              otherResult: otherResults as any,
              quizTitle: (quizData as any)?.title || '未知问卷',
              matchScore,
            };
          })
        );

        setMatches(enrichedMatches);
      } catch (error) {
        console.error('Error fetching matches:', error);
        messageToast.error('加载匹配记录失败');
      } finally {
        setLoading(false);
      }
    };

    fetchMatches();
  }, []);

  const handleAgree = async (matchId: string) => {
    try {
      const match = matches.find(m => m.id === matchId);
      if (!match) return;

      const isRequester = match.requester_id === currentUserId;
      const updateData: Record<string, any> = isRequester
        ? { requester_agreed: true }
        : { receiver_agreed: true };

      // 检查双方是否都同意
      const willBeMatched = isRequester
        ? match.receiver_agreed
        : match.requester_agreed;

      if (willBeMatched) {
        updateData.status = 'matched';
      }

      const { data: updated, error } = await (supabase
        .from('matches') as any)
        .update(updateData)
        .eq('id', matchId)
        .select()
        .single();

      if (error) throw error;
      if (!updated) throw new Error('更新失败');

      messageToast.success(willBeMatched ? '匹配成功！' : '已发送同意请求');

      // 更新本地状态
      setMatches(matches.map(m => {
        if (m.id === matchId) {
          return {
            ...m,
            ...(isRequester ? { requester_agreed: true } : { receiver_agreed: true }),
            status: willBeMatched ? 'matched' : m.status,
          };
        }
        return m;
      }));
    } catch (error) {
      console.error('Error updating match:', error);
      messageToast.error('操作失败，请重试');
    }
  };

  const handleReject = async (matchId: string) => {
    try {
      const match = matches.find(m => m.id === matchId);
      if (!match) return;

      const { data: updated, error } = await (supabase
        .from('matches') as any)
        .update({ status: 'rejected' })
        .eq('id', matchId)
        .select()
        .single();

      if (error) throw error;
      if (!updated) throw new Error('更新失败');

      messageToast.success('已拒绝该匹配请求');

      // 更新本地状态，而不是移除
      setMatches(matches.map(m => {
        if (m.id === matchId) {
          return { ...m, status: 'rejected' };
        }
        return m;
      }));
    } catch (error) {
      console.error('Error rejecting match:', error);
      messageToast.error('拒绝失败，请重试');
    }
  };

  const fetchContactInfo = async (matchId: string) => {
    setLoadingContact(true);
    try {
      const match = matches.find(m => m.id === matchId);
      if (!match) return;

      const isRequester = match.requester_id === currentUserId;
      const otherUserId = isRequester ? match.receiver_id : match.requester_id;

      const { data, error } = await supabase
        .from('profiles')
        .select('nickname, contact_info, avatar_url, gender, province, bio')
        .eq('id', otherUserId)
        .single();

      if (error) throw error;
      setContactInfo(data);
    } catch (error) {
      console.error('Error fetching contact:', error);
      messageToast.error('获取联系方式失败');
    } finally {
      setLoadingContact(false);
    }
  };

  const getStatusBadge = (match: MatchWithDetails) => {
    const isRequester = match.requester_id === currentUserId;
    const myAgreed = isRequester ? match.requester_agreed : match.receiver_agreed;
    const otherAgreed = isRequester ? match.receiver_agreed : match.requester_agreed;

    if (match.status === 'rejected') {
      return <Badge className="bg-red-500 hover:bg-red-600">已拒绝</Badge>;
    }

    if (match.status === 'matched') {
      return <Badge className="bg-green-500 hover:bg-green-600">已匹配</Badge>;
    }

    if (myAgreed && !otherAgreed) {
      return <Badge variant="secondary">等待对方同意</Badge>;
    }

    if (!myAgreed && otherAgreed) {
      return <Badge className="bg-orange-500 hover:bg-orange-600">对方已同意</Badge>;
    }

    return <Badge variant="outline">待确认</Badge>;
  };

  const copyContact = () => {
    if (contactInfo?.contact_info) {
      navigator.clipboard.writeText(contactInfo.contact_info);
      messageToast.success('联系方式已复制');
    }
  };

  const goToMatchAnswers = (match: MatchWithDetails) => {
    if (!match.otherResult?.answers || !match.quiz_id) {
      messageToast.error('暂无对方答题数据');
      return;
    }
    navigate(`/match-answers/${match.id}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-[#2D5A27]" />
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <div className="text-center py-20">
        <Users className="w-16 h-16 text-gray-200 mx-auto mb-4" />
        <h2 className="text-xl text-[#2C3E50] mb-2">你还没有任何匹配记录</h2>
        <p className="text-gray-400 mb-6">快去答题并分享给朋友吧！</p>
        <Link to="/">
          <Button className="bg-[#2D5A27] hover:bg-[#234a1f] text-white">
            <ClipboardList className="w-4 h-4 mr-2" />
            开始答题
          </Button>
        </Link>
      </div>
    );
  }

  const filterEmptyMessage =
    filter === 'matched' ? '暂无已同意的匹配记录'
    : filter === 'rejected' ? '暂无已拒绝的匹配记录'
    : null;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="glass rounded-3xl p-6 shadow-2xl animate-scale-in">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-3xl font-bold text-[#2C3E50]">💕 我的匹配</h1>
            {pendingMatchesCount > 0 && (
              <Badge className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 animate-pulse shadow-lg text-base px-4 py-2">
                {pendingMatchesCount} 个待处理
              </Badge>
            )}
          </div>
          <span className="text-gray-700 font-medium">共 {matches.length} 条记录</span>
        </div>

        {/* 分类筛选标签 */}
        <Tabs value={filter} onValueChange={(v) => setFilter(v as MatchFilter)}>
          <TabsList className="mt-4 w-full grid grid-cols-3 bg-gray-100/80">
            <TabsTrigger value="all" className="data-[state=active]:bg-[#2D5A27] data-[state=active]:text-white">
              全部 ({matches.length})
            </TabsTrigger>
            <TabsTrigger value="matched" className="data-[state=active]:bg-green-600 data-[state=active]:text-white">
              已同意 ({matches.filter(m => m.status === 'matched').length})
            </TabsTrigger>
            <TabsTrigger value="rejected" className="data-[state=active]:bg-red-500 data-[state=active]:text-white">
              已拒绝 ({matches.filter(m => m.status === 'rejected').length})
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="space-y-4">
        {filteredMatches.length === 0 && filterEmptyMessage ? (
          <div className="text-center py-16 glass rounded-2xl">
            <XCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">{filterEmptyMessage}</p>
            <p className="text-sm text-gray-400 mt-1">试试切换其他分类查看</p>
          </div>
        ) : (
        filteredMatches.map((match) => {
          const isRequester = match.requester_id === currentUserId;
          const myAgreed = isRequester ? match.requester_agreed : match.receiver_agreed;
          const otherAgreed = isRequester ? match.receiver_agreed : match.requester_agreed;

          return (
            <Card key={match.id} className="glass-card border-0 shadow-2xl shine-effect animate-fade-in-up">
              <CardContent className="p-8">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-4 mb-4">
                    <div className="w-14 h-14 rounded-full bg-[#2D5A27]/20 flex items-center justify-center overflow-hidden shadow-lg ring-2 ring-white/50 transition-transform duration-300 hover:scale-110">
                      {match.otherUser.avatar_url ? (
                        <img 
                          src={match.otherUser.avatar_url} 
                          alt={match.otherUser.nickname || '用户头像'}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Heart className="w-6 h-6 text-[#2D5A27]" />
                      )}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-[#2C3E50] text-lg">
                        {match.otherUser.nickname}
                      </h3>
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        {match.otherUser.gender && (
                          <span className="px-2 py-1 bg-gray-100 rounded-full text-xs">
                            {match.otherUser.gender === 'male' ? '男' : '女'}
                          </span>
                        )}
                        {match.otherUser.province && (
                          <span>{match.otherUser.province}</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400">
                        {new Date(match.created_at).toLocaleDateString('zh-CN')}
                      </p>
                    </div>
                  </div>

                    {/* 问卷名称 */}
                    <div className="mb-3 flex items-center gap-2 text-sm">
                      <ClipboardList className="w-4 h-4 text-gray-400" />
                      <span className="text-gray-600">问卷：</span>
                      <span className="font-medium text-[#2C3E50]">{match.quizTitle}</span>
                    </div>

                    {/* 匹配度（点击可查看对方完整答案） */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => goToMatchAnswers(match)}
                      onKeyDown={(e) => e.key === 'Enter' && goToMatchAnswers(match)}
                      className="mb-4 p-4 glass rounded-2xl cursor-pointer hover:ring-2 hover:ring-[#2D5A27]/30 transition-all"
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <Award className="w-5 h-5 text-[#2D5A27]" />
                        <span className="text-sm text-gray-700 font-semibold">匹配度</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-2xl font-bold text-[#2D5A27]">{match.matchScore}%</span>
                        <div className="flex-1 h-3 bg-gray-200/50 rounded-full overflow-hidden shadow-inner" style={{ minWidth: '120px' }}>
                          <div 
                            className={`h-full transition-all duration-500 shadow-sm ${
                              match.matchScore >= 80 ? 'bg-gradient-to-r from-green-400 to-green-600' :
                              match.matchScore >= 60 ? 'bg-gradient-to-r from-[#2D5A27] to-[#234a1f]' :
                              match.matchScore >= 40 ? 'bg-gradient-to-r from-orange-400 to-orange-600' :
                              'bg-gradient-to-r from-red-400 to-red-600'
                            }`}
                            style={{ width: `${match.matchScore}%` }}
                          />
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 mt-2">点击可查看答案详情</p>
                    </div>

                    {/* 答题结果 */}
                    <div className="flex items-center gap-4 text-sm mb-4">
                      <span className="text-gray-500">
                        你: <span className="font-medium text-[#2D5A27]">{match.myResult?.tag || '未答题'}</span>
                      </span>
                      <span className="text-gray-300">|</span>
                      <span className="text-gray-500">
                        对方: <span className="font-medium text-[#2D5A27]">{match.otherResult?.tag || '未答题'}</span>
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      {getStatusBadge(match)}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    {match.status === 'rejected' && (
                      <span className="text-sm text-gray-500">已拒绝</span>
                    )}

                    {match.status !== 'rejected' && !myAgreed && otherAgreed && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => handleAgree(match.id)}
                          className="bg-gradient-to-r from-[#2D5A27] to-[#234a1f] hover:from-[#234a1f] hover:to-[#1a3515] text-white shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105"
                        >
                          <Check className="w-4 h-4 mr-1" />
                          同意交换
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleReject(match.id)}
                          className="text-red-600 border-red-300 hover:bg-red-50"
                        >
                          拒绝
                        </Button>
                      </>
                    )}

                    {match.status !== 'rejected' && !myAgreed && !otherAgreed && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => handleAgree(match.id)}
                          variant="outline"
                        >
                          <Check className="w-4 h-4 mr-1" />
                          同意
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleReject(match.id)}
                          className="text-red-600 border-red-300 hover:bg-red-50"
                        >
                          拒绝
                        </Button>
                      </>
                    )}

                    {match.status === 'matched' && (
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => fetchContactInfo(match.id)}
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            查看联系方式
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>联系方式</DialogTitle>
                          </DialogHeader>
                          {loadingContact ? (
                            <div className="flex justify-center py-8">
                              <Loader2 className="w-6 h-6 animate-spin text-[#2D5A27]" />
                            </div>
                          ) : contactInfo ? (
                            <div className="space-y-4 py-4">
                              <div className="flex items-center gap-3">
                                {contactInfo.avatar_url ? (
                                  <img 
                                    src={contactInfo.avatar_url} 
                                    alt={contactInfo.nickname}
                                    className="w-12 h-12 rounded-full object-cover"
                                  />
                                ) : (
                                  <div className="w-12 h-12 rounded-full bg-[#2D5A27]/10 flex items-center justify-center">
                                    <Heart className="w-6 h-6 text-[#2D5A27]" />
                                  </div>
                                )}
                                <div>
                                  <p className="text-lg font-medium">{contactInfo.nickname}</p>
                                  {contactInfo.gender && (
                                    <p className="text-sm text-gray-500">
                                      {contactInfo.gender === 'male' ? '男' : '女'}
                                      {contactInfo.province && ` · ${contactInfo.province}`}
                                    </p>
                                  )}
                                </div>
                              </div>
                              
                              <div>
                                <Label className="text-gray-500">联系方式</Label>
                                <div className="flex items-center gap-2">
                                  <p className="text-lg font-medium">{contactInfo.contact_info}</p>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={copyContact}
                                  >
                                    <Copy className="w-4 h-4" />
                                  </Button>
                                </div>
                              </div>

                              {contactInfo.bio && (
                                <div>
                                  <Label className="text-gray-500">个人简介</Label>
                                  <p className="text-gray-700">{contactInfo.bio}</p>
                                </div>
                              )}
                            </div>
                          ) : (
                            <p className="text-gray-500 text-center py-4">暂无联系方式</p>
                          )}
                        </DialogContent>
                      </Dialog>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })
        )}
      </div>
    </div>
  );
}
