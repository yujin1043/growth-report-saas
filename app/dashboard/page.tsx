'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { DashboardBranchSkeleton, DashboardAdminSkeleton } from '@/components/Skeleton'

interface UserProfile {
  name: string
  role: string
  branch_id: string | null
  branch_name: string | null
  class_names: string[]
}

interface CurriculumItem {
  id: string
  month: number
  target_group: string
  title: string
}

interface AttentionStudent {
  id: string
  name: string
  class_name: string
  no_message_days: number | null
  need_report: boolean
  report_months: number
}

interface BranchStats {
  id: string
  name: string
  active_count: number
  change_this_month: number
  billing_tier: string
  billing_amount: number
  last_message_days: number | null
  last_report_days: number | null
  message_rate: number
  report_rate: number
  status: 'green' | 'yellow' | 'red'
  status_reason: string
}

interface BillingTier {
  tier: string
  count: number
  amount: number
}

export default function DashboardPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [userRole, setUserRole] = useState('')

  const [user, setUser] = useState<UserProfile | null>(null)
  // 지점 계정용
  const [activeStudents, setActiveStudents] = useState(0)
  const [pendingReports, setPendingReports] = useState(0)
  const [randomCurriculum, setRandomCurriculum] = useState<CurriculumItem | null>(null)
  const [attentionStudents, setAttentionStudents] = useState<AttentionStudent[]>([])
  const [attentionFilter, setAttentionFilter] = useState('all')

  // 본사 admin용
  const [totalBranches, setTotalBranches] = useState(0)
  const [totalActiveStudents, setTotalActiveStudents] = useState(0)
  const [totalBilling, setTotalBilling] = useState(0)
  const [greenCount, setGreenCount] = useState(0)
  const [yellowCount, setYellowCount] = useState(0)
  const [redCount, setRedCount] = useState(0)
  const [branchStats, setBranchStats] = useState<BranchStats[]>([])
  const [billingByTier, setBillingByTier] = useState<BillingTier[]>([])

  useEffect(() => {
    loadData()
  }, [])

  function getBillingInfo(activeCount: number): { tier: string, amount: number } {
    if (activeCount <= 30) return { tier: '~30명', amount: 30000 }
    if (activeCount <= 50) return { tier: '31~50명', amount: 40000 }
    if (activeCount <= 80) return { tier: '51~80명', amount: 60000 }
    if (activeCount <= 120) return { tier: '81~120명', amount: 80000 }
    if (activeCount <= 150) return { tier: '121~150명', amount: 100000 }
    const extra = (activeCount - 150) * 500
    return { tier: '150명+', amount: 100000 + extra }
  }

  function getStatusFromRates(messageRate: number, reportRate: number): { status: 'green' | 'yellow' | 'red', reason: string } {
    if (messageRate < 50 || reportRate < 50) {
      const reasons: string[] = []
      if (messageRate < 50) reasons.push('메시지')
      if (reportRate < 50) reasons.push('리포트')
      return { status: 'red', reason: `${reasons.join('·')} 부족` }
    }
    if (messageRate < 80 || reportRate < 80) {
      if (messageRate < 80 && reportRate < 80) return { status: 'yellow', reason: '메시지·리포트 저조' }
      if (messageRate < 80) return { status: 'yellow', reason: '메시지 작성률 저조' }
      return { status: 'yellow', reason: '리포트 작성률 저조' }
    }
    return { status: 'green', reason: '양호' }
  }

  function getStatus(
    lastMessageDays: number | null, 
    lastReportDays: number | null
  ): { status: 'green' | 'yellow' | 'red', reason: string } {
    if (lastMessageDays === null || lastMessageDays > 7) {
      return { 
        status: 'red', 
        reason: lastMessageDays === null ? '메시지 없음' : `메시지 ${lastMessageDays}일 전` 
      }
    }
    if (lastReportDays !== null && lastReportDays > 90) {
      return { status: 'red', reason: `리포트 ${lastReportDays}일 전` }
    }
    if (lastMessageDays >= 4) {
      return { status: 'yellow', reason: `메시지 ${lastMessageDays}일 전` }
    }
    return { status: 'green', reason: '정상' }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ko-KR').format(amount) + '원'
  }

  async function loadData() {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) { router.push('/login'); return }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('name, role, branch_id')
      .eq('id', authUser.id)
      .single()

    if (!profile) { router.push('/login'); return }

    setUserRole(profile.role)

    if (profile.role === 'staff') {
      router.push('/admin/curriculum')
      return
    }

    if (profile.role === 'admin') {
      setUser({ name: profile.name, role: profile.role, branch_id: null, branch_name: null, class_names: [] })
      await loadAdminData()
    } else {
      await loadBranchData(authUser.id, profile)
    }
    setLoading(false)
  }

  // ===== 본사 데이터 =====
  async function loadAdminData() {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, now.getDate())

    // 이번 달 수업일 수 계산 (월~금)
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    let businessDaysSoFar = 0
    for (let d = 1; d <= Math.min(now.getDate(), daysInMonth); d++) {
      const day = new Date(now.getFullYear(), now.getMonth(), d).getDay()
      if (day !== 0 && day !== 6) businessDaysSoFar++
    }

    const [branchesResult, studentsResult, activityResult, messagesResult, reportsResult] = await Promise.all([
      supabase.from('branches').select('id, name').order('name'),
      supabase.from('students').select('id, branch_id, status, enrolled_at, last_report_at'),
      supabase.rpc('get_branch_last_activity'),
      supabase.from('daily_messages').select('id, branch_id, created_at').gte('created_at', startOfMonth.toISOString()),
      supabase.from('reports').select('id, branch_id, created_at')
    ])

    const branches = branchesResult.data || []
    const students = studentsResult.data || []
    const messages = messagesResult.data || []

    const activityMap = new Map<string, any>(
      activityResult.data?.map((a: any) => [a.branch_id, a]) || []
    )

    setTotalBranches(branches.length)

    const stats: BranchStats[] = branches.map(branch => {
      const branchStudents = students.filter(s => s.branch_id === branch.id)
      const activeStudentsList = branchStudents.filter(s => s.status === 'active')
      const activeCount = activeStudentsList.length

      const newThisMonth = branchStudents.filter(s => {
        if (!s.enrolled_at) return false
        return new Date(s.enrolled_at) >= startOfMonth && s.status === 'active'
      }).length

      const billing = getBillingInfo(activeCount)

      const activity = activityMap.get(branch.id)
      const lastMessageDays = activity?.last_message_at
        ? Math.floor((now.getTime() - new Date(activity.last_message_at).getTime()) / (1000 * 60 * 60 * 24))
        : null
      const lastReportDays = activity?.last_report_at
        ? Math.floor((now.getTime() - new Date(activity.last_report_at).getTime()) / (1000 * 60 * 60 * 24))
        : null

      // 메시지 작성률: 이번 달 작성 날짜 수 / 수업일 수
      const branchMessageDates = new Set(
        messages
          .filter(m => m.branch_id === branch.id)
          .map(m => new Date(m.created_at).toDateString())
      )
      const messageRate = businessDaysSoFar > 0
        ? Math.round((branchMessageDates.size / businessDaysSoFar) * 100)
        : 0

      // 리포트 작성률: 최근 2개월 내 리포트가 있는 학생 비율
      const studentsWithReport = activeStudentsList.filter(s => {
        const student = s as any
        if (!student.last_report_at) return false
        return new Date(student.last_report_at) >= twoMonthsAgo
      }).length
      const reportRate = activeCount > 0
        ? Math.round((studentsWithReport / activeCount) * 100)
        : 0

      const statusInfo = getStatusFromRates(messageRate, reportRate)

      return {
        id: branch.id,
        name: branch.name,
        active_count: activeCount,
        change_this_month: newThisMonth,
        billing_tier: billing.tier,
        billing_amount: billing.amount,
        last_message_days: lastMessageDays,
        last_report_days: lastReportDays,
        message_rate: messageRate,
        report_rate: reportRate,
        status: statusInfo.status,
        status_reason: statusInfo.reason
      }
    })

    setBranchStats(stats)
    setTotalActiveStudents(stats.reduce((sum, b) => sum + b.active_count, 0))
    setTotalBilling(stats.reduce((sum, b) => sum + b.billing_amount, 0))
    setGreenCount(stats.filter(b => b.status === 'green').length)
    setYellowCount(stats.filter(b => b.status === 'yellow').length)
    setRedCount(stats.filter(b => b.status === 'red').length)

    const tierMap = new Map<string, { count: number, amount: number }>()
    stats.forEach(b => {
      const existing = tierMap.get(b.billing_tier) || { count: 0, amount: 0 }
      tierMap.set(b.billing_tier, { count: existing.count + 1, amount: existing.amount + b.billing_amount })
    })
    const tiers: BillingTier[] = []
    ;['~30명', '31~50명', '51~80명', '81~120명', '121~150명', '150명+'].forEach(tier => {
      const data = tierMap.get(tier)
      if (data) tiers.push({ tier, count: data.count, amount: data.amount })
    })
    setBillingByTier(tiers)
  }

  // ===== 지점 계정 데이터 =====
  async function loadBranchData(authUserId: string, profile: any) {
    const now = new Date()
    const currentMonth = now.getMonth() + 1
    const currentYear = now.getFullYear()
    const twoMonthsAgo = new Date(currentYear, now.getMonth() - 2, now.getDate())

    const [branchesResult, classesResult] = await Promise.all([
      supabase.from('branches').select('id, name'),
      supabase.from('classes').select('id, name')
    ])
    const branchMap = new Map(branchesResult.data?.map(b => [b.id, b.name]) || [])
    const classMap = new Map(classesResult.data?.map(c => [c.id, c.name]) || [])

    let branchName = profile.branch_id ? (branchMap.get(profile.branch_id) || null) : null
    let classNames: string[] = []

    if (profile.role === 'teacher') {
      const { data: teacherClasses } = await supabase.from('teacher_classes').select('class_id').eq('teacher_id', authUserId)
      if (teacherClasses && teacherClasses.length > 0) {
        classNames = teacherClasses.map(tc => classMap.get(tc.class_id)).filter((name): name is string => !!name)
      }
    }

    setUser({ name: profile.name, role: profile.role, branch_id: profile.branch_id, branch_name: branchName, class_names: classNames })

    // 재원학생 + 리포트 미작성
    let activeQuery = supabase.from('students').select('id').eq('status', 'active')
    let reportsStudentQuery = supabase.from('reports').select('student_id').gte('created_at', new Date(currentYear, now.getMonth(), 1).toISOString())

    if (profile.branch_id) {
      activeQuery = activeQuery.eq('branch_id', profile.branch_id)
      reportsStudentQuery = reportsStudentQuery.eq('branch_id', profile.branch_id)
    }

    const [activeResult, reportsStudentResult] = await Promise.all([activeQuery, reportsStudentQuery])
    const activeCount = activeResult.data?.length || 0
    setActiveStudents(activeCount)

    const reportedIds = new Set(reportsStudentResult.data?.map(r => r.student_id) || [])
    setPendingReports((activeResult.data || []).filter(s => !reportedIds.has(s.id)).length)

    // 커리큘럼 랜덤 1개
    const { data: curriculumData } = await supabase
      .from('monthly_curriculum')
      .select('id, month, target_group, title')
      .eq('status', 'active')
      .eq('year', currentYear)
      .eq('month', currentMonth)

    if (curriculumData && curriculumData.length > 0) {
      setRandomCurriculum(curriculumData[Math.floor(Math.random() * curriculumData.length)])
    }

    // 관리 필요 원생
    let studentsQuery = supabase.from('students').select('id, name, class_id, last_report_at').eq('status', 'active')
    if (profile.branch_id) studentsQuery = studentsQuery.eq('branch_id', profile.branch_id)

    const { data: allStudents } = await studentsQuery

    if (allStudents && allStudents.length > 0) {
      const studentIds = allStudents.map(s => s.id)
      const { data: messagesData } = await supabase
        .from('daily_messages')
        .select('student_id, created_at')
        .in('student_id', studentIds)
        .order('created_at', { ascending: false })

      const lastMessageMap = new Map<string, string>()
      messagesData?.forEach(m => {
        if (!lastMessageMap.has(m.student_id)) lastMessageMap.set(m.student_id, m.created_at)
      })

      const attentionList: AttentionStudent[] = []

      for (const student of allStudents) {
        const lastMsgDate = lastMessageMap.get(student.id)
        const noMessageDays = lastMsgDate
          ? Math.floor((now.getTime() - new Date(lastMsgDate).getTime()) / (1000 * 60 * 60 * 24))
          : null

        const needReport = !student.last_report_at || new Date(student.last_report_at) < twoMonthsAgo
        const reportMonths = student.last_report_at
          ? Math.floor((now.getTime() - new Date(student.last_report_at).getTime()) / (1000 * 60 * 60 * 24 * 30))
          : 0

        const isMessageAlert = noMessageDays === null || noMessageDays >= 7
        const isReportAlert = needReport

        if (isMessageAlert || isReportAlert) {
          attentionList.push({
            id: student.id, name: student.name,
            class_name: student.class_id ? (classMap.get(student.class_id) || '-') : '-',
            no_message_days: noMessageDays, need_report: isReportAlert, report_months: reportMonths
          })
        }
      }

      attentionList.sort((a, b) => {
        const score = (s: AttentionStudent) => ((s.no_message_days === null || s.no_message_days >= 7) ? 2 : 0) + (s.need_report ? 1 : 0)
        return score(b) - score(a)
      })

      setAttentionStudents(attentionList)
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const getRoleText = (role: string) => {
    switch (role) { case 'admin': return '본사'; case 'director': return '원장'; case 'manager': return '실장'; case 'teacher': return '강사'; default: return role }
  }

  const getRoleBadgeColor = (role: string) => {
    switch (role) { case 'admin': return 'bg-purple-100 text-purple-700'; case 'director': return 'bg-indigo-100 text-indigo-700'; case 'manager': return 'bg-blue-100 text-blue-700'; case 'teacher': return 'bg-green-100 text-green-700'; default: return 'bg-gray-100 text-gray-700' }
  }

  const getClassDisplay = () => {
    if (!user || user.role === 'director' || user.role === 'manager') return ''
    if (user.class_names.length === 0) return ''
    if (user.class_names.length <= 2) return user.class_names.join(', ')
    return `${user.class_names.slice(0, 2).join(', ')} 외 ${user.class_names.length - 2}개`
  }

  const filteredAttention = attentionFilter === 'all' ? attentionStudents
    : attentionFilter === 'message' ? attentionStudents.filter(s => s.no_message_days === null || s.no_message_days >= 7)
    : attentionStudents.filter(s => s.need_report)

  const messageAlertCount = attentionStudents.filter(s => s.no_message_days === null || s.no_message_days >= 7).length
  const reportAlertCount = attentionStudents.filter(s => s.need_report).length

  // ===== 로딩 =====
  if (loading) {
    return userRole === 'admin' ? <DashboardAdminSkeleton /> : <DashboardBranchSkeleton />
  }

  // ===== 본사 관리자 =====
  if (userRole === 'admin') {
    const sortedStats = [...branchStats].sort((a, b) => {
      const order = { red: 0, yellow: 1, green: 2 }
      return order[a.status] - order[b.status]
    })

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <header className="bg-white shadow-sm border-b border-slate-200">
          <div className="max-w-5xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <h1 className="text-lg font-bold text-slate-800">🎛 HQ 통합 대시보드</h1>
              <div className="w-20"></div>
            </div>
          </div>
        </header>

        <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
          <p className="text-center text-sm text-slate-400">&quot;이 화면의 목적은 지점을 평가하는 것이 아니라, 문제를 놓치지 않는 것이다.&quot;</p>

          <div className="grid grid-cols-3 gap-2 md:gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-3 md:p-5 text-center">
              <p className="text-slate-500 text-xs md:text-sm mb-1">총 지점 수</p>
              <p className="text-2xl md:text-3xl font-bold text-slate-800">{totalBranches}<span className="text-xs md:text-base font-normal text-slate-400 ml-0.5">개</span></p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-3 md:p-5 text-center">
              <p className="text-slate-500 text-xs md:text-sm mb-1">총 원생 수</p>
              <p className="text-2xl md:text-3xl font-bold text-slate-800">{totalActiveStudents}<span className="text-xs md:text-base font-normal text-slate-400 ml-0.5">명</span></p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-3 md:p-5 text-center">
              <p className="text-slate-500 text-xs md:text-sm mb-1">예상 과금</p>
              <p className="text-lg md:text-2xl font-bold text-teal-600">{formatCurrency(totalBilling)}</p>
            </div>
          </div>

          <div className="flex justify-center gap-6">
            {[{ color: 'bg-green-500', label: '양호', count: greenCount }, { color: 'bg-yellow-500', label: '유의', count: yellowCount }, { color: 'bg-red-500', label: '관리 필요', count: redCount }].map(s => (
              <div key={s.label} className="flex items-center gap-2">
                <span className={`w-4 h-4 rounded-full ${s.color}`}></span>
                <span className="text-slate-600">{s.label} <strong>{s.count}</strong></span>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <h2 className="font-bold text-slate-800 mb-4">📊 지점별 현황</h2>
            <div className="space-y-2">
              {sortedStats.map(branch => (
                <div key={branch.id} onClick={() => router.push(`/branches/${branch.id}`)} className="p-3 md:p-4 rounded-xl hover:bg-slate-50 cursor-pointer transition border border-slate-100">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`w-3 h-3 rounded-full flex-shrink-0 ${branch.status === 'green' ? 'bg-emerald-500' : branch.status === 'yellow' ? 'bg-amber-500' : 'bg-red-500'}`}></span>
                      <span className="font-semibold text-slate-800">{branch.name}</span>
                      {branch.status !== 'green' && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${branch.status === 'yellow' ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'}`}>{branch.status_reason}</span>
                      )}
                    </div>
                    <span className="text-sm text-slate-500">원생 <strong className="text-slate-800">{branch.active_count}</strong>명</span>
                  </div>
                  <div className="flex gap-4 ml-5 text-xs">
                    <span className={branch.message_rate < 50 ? 'text-red-500 font-semibold' : branch.message_rate < 80 ? 'text-amber-500 font-semibold' : 'text-slate-400'}>
                      메시지 {branch.message_rate}%
                    </span>
                    <span className={branch.report_rate < 50 ? 'text-red-500 font-semibold' : branch.report_rate < 80 ? 'text-amber-500 font-semibold' : 'text-slate-400'}>
                      리포트 {branch.report_rate}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <h2 className="font-bold text-slate-800 mb-4">💰 과금 요약</h2>
            <div className="space-y-3 mb-4">
              {billingByTier.map(tier => {
                const tierBranches = branchStats.filter(b => b.billing_tier === tier.tier)
                return (
                  <div key={tier.tier}>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">[{tier.tier}] {tier.count}개 지점</span>
                      <span className="text-slate-800">{formatCurrency(tier.amount)}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 pl-1">
                      {tierBranches.map(b => `${b.name}(${b.active_count}명)`).join(', ')}
                    </p>
                  </div>
                )
              })}
            </div>
            <div className="border-t border-slate-200 pt-3 flex justify-between font-bold">
              <span className="text-slate-800">총 예상 SaaS 이용료</span>
              <span className="text-teal-600">{formatCurrency(totalBilling)}</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ===== 지점 계정 대시보드 =====
  return (
    <div className="min-h-screen" style={{ background: '#F8FAFB' }}>

      <div className="max-w-3xl mx-auto px-4 py-5 md:py-7 space-y-5">

        {/* ① 인사 헤더 */}
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center text-white text-xl md:text-2xl font-bold shadow-lg shadow-teal-500/30">
            {user?.name?.charAt(0) || '?'}
          </div>
          <div>
            <h2 className="text-lg md:text-xl font-bold text-gray-800 mb-0.5">👋 {user?.name || '사용자'}님, 안녕하세요!</h2>
            <p className="text-sm text-gray-400">
              {user?.branch_name || ''}{getClassDisplay() ? ` · ${getClassDisplay()}` : ''}
              {user?.role && <span className={`inline-block ml-1.5 px-1.5 py-0.5 rounded text-xs font-medium ${getRoleBadgeColor(user.role)}`}>{getRoleText(user.role)}</span>}
            </p>
          </div>
        </div>

        {/* ② 당월 커리큘럼 배너 */}
        {randomCurriculum && (
          <div onClick={() => router.push('/curriculum')} className="rounded-2xl p-6 cursor-pointer relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #5BB5C5 0%, #4BA3B3 100%)', boxShadow: '0 8px 24px rgba(91,181,197,0.2)' }}>
            <div className="absolute -top-8 -right-8 w-28 h-28 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}></div>
            <div className="absolute -bottom-5 right-16 w-20 h-20 rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }}></div>
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold text-white" style={{ background: 'rgba(255,255,255,0.2)' }}>📚 {randomCurriculum.month}월 커리큘럼</span>
                <span className="px-2.5 py-0.5 rounded-full text-xs text-white/80" style={{ background: 'rgba(255,255,255,0.15)' }}>{randomCurriculum.target_group}</span>
              </div>
              <h2 className="text-lg md:text-xl font-bold text-white mb-1">{randomCurriculum.title}</h2>
              <p className="text-xs text-white/60">탭하여 상세 커리큘럼 확인 →</p>
            </div>
          </div>
        )}

        {/* ③ 오늘의 할 일 */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-1 h-4 rounded-sm inline-block" style={{ background: 'linear-gradient(180deg, #F7D85C 0%, #E8A0B4 100%)' }}></span>
            오늘의 할 일
          </h3>

          <button onClick={() => router.push('/daily-message')} className="w-full rounded-xl p-4 md:p-5 mb-3 flex items-center gap-3.5 text-left transition active:scale-[0.98]" style={{ background: 'linear-gradient(135deg, #F7D85C 0%, #F5C842 100%)', boxShadow: '0 4px 16px rgba(247,216,92,0.25)' }}>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0" style={{ background: 'rgba(255,255,255,0.4)' }}>💬</div>
            <div className="flex-1">
              <div className="text-base font-bold mb-0.5" style={{ color: '#5D4E00' }}>일일 메시지 발송</div>
              <div className="text-xs" style={{ color: '#8B7300' }}>수업 후 학부모 알림</div>
            </div>
            <span className="text-xl" style={{ color: '#5D4E00' }}>→</span>
          </button>

          <div className="grid grid-cols-2 gap-2.5">
            <button onClick={() => router.push('/reports')} className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex items-center gap-2.5 hover:bg-teal-50/50 transition text-left">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center text-lg flex-shrink-0" style={{ background: '#E8F8F5' }}>📝</div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-800 whitespace-nowrap">리포트 작성</div>
                <div className="text-xs text-gray-400 whitespace-nowrap">미작성 {pendingReports}명</div>
              </div>
            </button>
            <button onClick={() => router.push('/students')} className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex items-center gap-2.5 hover:bg-teal-50/50 transition text-left">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center text-lg flex-shrink-0" style={{ background: '#FFF0F5' }}>👨‍🎓</div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-800 whitespace-nowrap">학생 관리</div>
                <div className="text-xs text-gray-400 whitespace-nowrap">재원 {activeStudents}명</div>
              </div>
            </button>
          </div>
        </div>

        {/* ④ 관리 필요 원생 */}
        {(
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                <span className="w-1 h-4 rounded-sm inline-block" style={{ background: 'linear-gradient(180deg, #FF6B6B 0%, #FFB4B4 100%)' }}></span>
                관리 필요 원생
              </h3>
              <span className="bg-red-100 text-red-600 text-xs font-bold px-2.5 py-1 rounded-full">{attentionStudents.length}명</span>
            </div>

            <div className="flex gap-1.5 mb-3.5">
              {[
                { id: 'all', label: '전체', count: attentionStudents.length },
                { id: 'message', label: '메시지 미발송', count: messageAlertCount },
                { id: 'report', label: '리포트 필요', count: reportAlertCount },
              ].map(tab => (
                <button key={tab.id} onClick={() => setAttentionFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${attentionFilter === tab.id ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                  {tab.label} {tab.count}
                </button>
              ))}
            </div>

            <div className="space-y-1.5">
              {filteredAttention.map(student => {
                const isMsgAlert = student.no_message_days === null || student.no_message_days >= 7
                return (
                  <div key={student.id} onClick={() => router.push(`/students/${student.id}`)} className="flex items-center p-3.5 rounded-xl bg-gray-50 border border-gray-100 cursor-pointer hover:bg-teal-50/30 transition">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-800 mb-1">
                        {student.name}
                        <span className="text-xs font-normal text-gray-400 ml-1.5">{student.class_name}</span>
                      </div>
                      <div className="flex gap-1.5 flex-wrap">
                        {isMsgAlert && <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-gray-100 text-gray-500">메시지 {student.no_message_days === null ? '없음' : `${student.no_message_days}일 전`}</span>}
                        {student.need_report && <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-gray-100 text-gray-500">리포트 {student.report_months > 0 ? `${student.report_months}개월 경과` : '없음'}</span>}
                      </div>
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0 ml-2">
                      {isMsgAlert && (
                        <button onClick={(e) => { e.stopPropagation(); router.push('/daily-message') }}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold border-2 transition hover:bg-amber-50"
                          style={{ background: '#FFFBEB', borderColor: '#F5D565', color: '#92400E' }}>메시지</button>
                      )}
                      {student.need_report && (
                        <button onClick={(e) => { e.stopPropagation(); router.push(`/students/${student.id}`) }}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold border-2 transition hover:bg-teal-50"
                          style={{ background: '#F0FDFA', borderColor: '#5BB5C5', color: '#0F766E' }}>리포트</button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {attentionStudents.length === 0 && (
              <div className="text-center py-8">
                <p className="text-3xl mb-2">🎉</p>
                <p className="font-semibold text-gray-700">모든 원생이 잘 관리되고 있어요!</p>
                <p className="text-xs text-gray-400 mt-1">메시지 발송과 리포트 작성이 모두 정상입니다</p>
              </div>
            )}
            
          </div>
        )}

      </div>
    </div>
  )
}
