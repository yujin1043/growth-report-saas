'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface UserProfile {
  name: string
  role: string
  branch_id: string | null
  branch_name: string | null
  class_names: string[]
}

interface NeedReportStudent {
  id: string
  name: string
  branch_name: string
  days_since_report: number
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
  const [activeStudents, setActiveStudents] = useState(0)
  const [monthlyReports, setMonthlyReports] = useState(0)
  const [needReportStudents, setNeedReportStudents] = useState<NeedReportStudent[]>([])

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

  async function loadData() {
    const { data: { user: authUser } } = await supabase.auth.getUser()

    if (!authUser) {
      router.push('/login')
      return
    }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('name, role, branch_id')
      .eq('id', authUser.id)
      .single()

    if (!profile) {
      router.push('/login')
      return
    }

    setUserRole(profile.role)

    if (profile.role === 'admin') {
      await loadAdminData()
    } else {
      await loadNormalData(authUser.id, profile)
    }

    setLoading(false)
  }

  async function loadAdminData() {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    const [branchesResult, studentsResult, messagesResult, reportsResult] = await Promise.all([
      supabase.from('branches').select('id, name').order('name'),
      supabase.from('students').select('id, branch_id, status, enrolled_at'),
      supabase.from('daily_messages').select('id, branch_id, created_at').order('created_at', { ascending: false }),
      supabase.from('reports').select('id, branch_id, created_at').order('created_at', { ascending: false })
    ])

    const branches = branchesResult.data || []
    const students = studentsResult.data || []
    const messages = messagesResult.data || []
    const reports = reportsResult.data || []

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

      const lastMessage = messages.find(m => m.branch_id === branch.id)
      const lastMessageDays = lastMessage 
        ? Math.floor((now.getTime() - new Date(lastMessage.created_at).getTime()) / (1000 * 60 * 60 * 24))
        : null

      const lastReport = reports.find(r => r.branch_id === branch.id)
      const lastReportDays = lastReport
        ? Math.floor((now.getTime() - new Date(lastReport.created_at).getTime()) / (1000 * 60 * 60 * 24))
        : null

      const statusInfo = getStatus(lastMessageDays, lastReportDays)

      return {
        id: branch.id,
        name: branch.name,
        active_count: activeCount,
        change_this_month: newThisMonth,
        billing_tier: billing.tier,
        billing_amount: billing.amount,
        last_message_days: lastMessageDays,
        last_report_days: lastReportDays,
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
      tierMap.set(b.billing_tier, {
        count: existing.count + 1,
        amount: existing.amount + b.billing_amount
      })
    })
    
    const tiers: BillingTier[] = []
    const tierOrder = ['~30명', '31~50명', '51~80명', '81~120명', '121~150명', '150명+']
    tierOrder.forEach(tier => {
      const data = tierMap.get(tier)
      if (data) {
        tiers.push({ tier, count: data.count, amount: data.amount })
      }
    })
    setBillingByTier(tiers)
  }

  async function loadNormalData(authUserId: string, profile: any) {
    const [branchesResult, classesResult] = await Promise.all([
      supabase.from('branches').select('id, name'),
      supabase.from('classes').select('id, name')
    ])

    const branchMap = new Map(branchesResult.data?.map(b => [b.id, b.name]) || [])
    const classMap = new Map(classesResult.data?.map(c => [c.id, c.name]) || [])

    let branchName = null
    let classNames: string[] = []

    if (profile.branch_id) {
      branchName = branchMap.get(profile.branch_id) || null
    }

    if (profile.role === 'teacher') {
      const { data: teacherClasses } = await supabase
        .from('teacher_classes')
        .select('class_id')
        .eq('teacher_id', authUserId)

      if (teacherClasses && teacherClasses.length > 0) {
        classNames = teacherClasses
          .map(tc => classMap.get(tc.class_id))
          .filter((name): name is string => !!name)
      }
    }

    setUser({
      name: profile.name,
      role: profile.role,
      branch_id: profile.branch_id,
      branch_name: branchName,
      class_names: classNames
    })

    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    // 활성 학생 조회
    let activeQuery = supabase.from('students').select('id').eq('status', 'active')
    let reportsQuery = supabase.from('reports').select('*', { count: 'exact', head: true }).gte('created_at', startOfMonth.toISOString())

    if (profile.role !== 'admin' && profile.branch_id) {
      activeQuery = activeQuery.eq('branch_id', profile.branch_id)
      reportsQuery = reportsQuery.eq('branch_id', profile.branch_id)
    }

    const [activeResult, reportsCountResult] = await Promise.all([
      activeQuery,
      reportsQuery
    ])

    setActiveStudents(activeResult.data?.length || 0)
    setMonthlyReports(reportsCountResult.count || 0)

    // 리포트 필요 학생 조회 - reports 테이블에서 직접 계산
    let studentsQuery = supabase
      .from('students')
      .select('id, name, branch_id')
      .eq('status', 'active')

    if (profile.role !== 'admin' && profile.branch_id) {
      studentsQuery = studentsQuery.eq('branch_id', profile.branch_id)
    }

    const { data: studentsData } = await studentsQuery

    // 모든 리포트에서 학생별 마지막 리포트 날짜 가져오기
    const { data: allReports } = await supabase
      .from('reports')
      .select('student_id, created_at')
      .order('created_at', { ascending: false })

    // 학생별 마지막 리포트 날짜 맵 생성
    const lastReportMap = new Map<string, string>()
    if (allReports) {
      allReports.forEach(r => {
        if (!lastReportMap.has(r.student_id)) {
          lastReportMap.set(r.student_id, r.created_at)
        }
      })
    }

    // 리포트 필요한 학생 필터링
    const needReportList: NeedReportStudent[] = []
    if (studentsData) {
      studentsData.forEach(student => {
        const lastReport = lastReportMap.get(student.id)
        const daysSince = lastReport
          ? Math.floor((now.getTime() - new Date(lastReport).getTime()) / (1000 * 60 * 60 * 24))
          : 999

        // 2개월(60일) 이상 경과 또는 리포트 없음
        if (daysSince >= 60) {
          needReportList.push({
            id: student.id,
            name: student.name,
            branch_name: branchMap.get(student.branch_id) || '-',
            days_since_report: daysSince
          })
        }
      })

      // 오래된 순 정렬, 최대 5명
      needReportList.sort((a, b) => b.days_since_report - a.days_since_report)
      setNeedReportStudents(needReportList.slice(0, 5))
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ko-KR').format(amount) + '원'
  }

  const formatDays = (days: number | null) => {
    if (days === null) return '-'
    if (days === 0) return '오늘'
    return `${days}일 전`
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-500 mx-auto mb-4"></div>
          <p className="text-slate-500">로딩 중...</p>
        </div>
      </div>
    )
  }

  // ========== 본사 관리자 대시보드 ==========
  if (userRole === 'admin') {
    const sortedStats = [...branchStats].sort((a, b) => {
      const statusOrder = { red: 0, yellow: 1, green: 2 }
      return statusOrder[a.status] - statusOrder[b.status]
    })

    const redBranches = branchStats.filter(b => b.status === 'red')
    const yellowBranches = branchStats.filter(b => b.status === 'yellow')

    return (
      <div className="min-h-screen">
        <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
          
          <p className="text-center text-sm text-slate-400">
            본사 대시보드 - 지점 현황을 한눈에
          </p>

          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 text-center">
              <p className="text-slate-500 text-sm mb-1">총 지점 수</p>
              <p className="text-3xl font-bold text-slate-800">{totalBranches}<span className="text-base font-normal text-slate-400 ml-1">개</span></p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-5 text-center">
              <p className="text-slate-500 text-sm mb-1">총 원생 수</p>
              <p className="text-3xl font-bold text-slate-800">{totalActiveStudents}<span className="text-base font-normal text-slate-400 ml-1">명</span></p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-5 text-center">
              <p className="text-slate-500 text-sm mb-1">이번달 예상 과금</p>
              <p className="text-2xl font-bold text-teal-600">{formatCurrency(totalBilling)}</p>
            </div>
          </div>

          <div className="flex justify-center gap-6">
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-green-500"></span>
              <span className="text-slate-600">정상 <strong>{greenCount}</strong></span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-yellow-500"></span>
              <span className="text-slate-600">주의 <strong>{yellowCount}</strong></span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-red-500"></span>
              <span className="text-slate-600">점검 필요 <strong>{redCount}</strong></span>
            </div>
          </div>

          {(redBranches.length > 0 || yellowBranches.length > 0) && (
            <div className="space-y-3">
              {redBranches.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
                  <h3 className="font-bold text-red-800 mb-2">🔴 즉시 점검 필요</h3>
                  <ul className="space-y-1">
                    {redBranches.map(b => (
                      <li key={b.id} className="text-sm text-red-700">
                        <strong>{b.name}</strong>: {b.status_reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              {yellowBranches.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4">
                  <h3 className="font-bold text-yellow-800 mb-2">🟡 주의 필요</h3>
                  <ul className="space-y-1">
                    {yellowBranches.map(b => (
                      <li key={b.id} className="text-sm text-yellow-700">
                        <strong>{b.name}</strong>: {b.status_reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-800">📊 지점별 현황</h2>
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">상태</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">지점명</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-slate-700">원생 수</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-slate-700">증감</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-slate-700">과금구간</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-slate-700">예상요금</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-slate-700">최근 메시지</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-slate-700">최근 리포트</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedStats.map(branch => (
                    <tr 
                      key={branch.id} 
                      onClick={() => router.push(`/dashboard/branches/${branch.id}`)}
                      className="hover:bg-slate-50 cursor-pointer transition"
                    >
                      <td className="px-4 py-3">
                        <span className={`w-3 h-3 rounded-full inline-block ${
                          branch.status === 'green' ? 'bg-green-500' :
                          branch.status === 'yellow' ? 'bg-yellow-500' : 'bg-red-500'
                        }`}></span>
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-800">{branch.name}</td>
                      <td className="px-4 py-3 text-sm text-center font-bold text-slate-800">{branch.active_count}</td>
                      <td className="px-4 py-3 text-sm text-center">
                        {branch.change_this_month > 0 ? (
                          <span className="text-teal-600">+{branch.change_this_month}</span>
                        ) : branch.change_this_month < 0 ? (
                          <span className="text-red-600">{branch.change_this_month}</span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-center text-slate-600">{branch.billing_tier}</td>
                      <td className="px-4 py-3 text-sm text-center text-slate-800">{formatCurrency(branch.billing_amount)}</td>
                      <td className="px-4 py-3 text-sm text-center">
                        <span className={
                          branch.last_message_days === null ? 'text-red-600' :
                          branch.last_message_days > 7 ? 'text-red-600' :
                          branch.last_message_days >= 4 ? 'text-yellow-600' : 'text-slate-600'
                        }>
                          {formatDays(branch.last_message_days)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-center">
                        <span className={
                          branch.last_report_days === null ? 'text-slate-400' :
                          branch.last_report_days > 90 ? 'text-red-600' : 'text-slate-600'
                        }>
                          {formatDays(branch.last_report_days)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="md:hidden divide-y divide-slate-100">
              {sortedStats.map(branch => (
                <div 
                  key={branch.id}
                  onClick={() => router.push(`/dashboard/branches/${branch.id}`)}
                  className="p-4 hover:bg-slate-50 cursor-pointer transition"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`w-3 h-3 rounded-full ${
                        branch.status === 'green' ? 'bg-green-500' :
                        branch.status === 'yellow' ? 'bg-yellow-500' : 'bg-red-500'
                      }`}></span>
                      <span className="font-medium text-slate-800">{branch.name}</span>
                    </div>
                    <span className="font-bold text-slate-800">{branch.active_count}명</span>
                  </div>
                  <div className="flex gap-3 text-xs text-slate-500">
                    <span>메시지 {formatDays(branch.last_message_days)}</span>
                    <span>리포트 {formatDays(branch.last_report_days)}</span>
                    <span>{formatCurrency(branch.billing_amount)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <h2 className="font-bold text-slate-800 mb-4">💰 과금 요약</h2>
            
            <div className="space-y-2 mb-4">
              {billingByTier.map(tier => (
                <div key={tier.tier} className="flex justify-between text-sm">
                  <span className="text-slate-600">[{tier.tier}] {tier.count}개 지점</span>
                  <span className="text-slate-800">{formatCurrency(tier.amount)}</span>
                </div>
              ))}
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

  // ========== 지점 계정 대시보드 (새 디자인) ==========
  return (
    <>
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Header */}
        <header className="mb-7">
          <h1 className="text-2xl font-bold text-slate-800 mb-1">
            👋 {user?.name || '선생님'}님, 안녕하세요!
          </h1>
          <p className="text-slate-500">{user?.branch_name || ''}</p>
        </header>

        {/* Today's Curriculum */}
        <div 
          onClick={() => router.push('/curriculum')}
          className="bg-gradient-to-r from-teal-500 to-cyan-500 rounded-2xl p-6 mb-6 cursor-pointer hover:shadow-lg transition relative overflow-hidden"
        >
          <div className="absolute -top-8 -right-8 w-32 h-32 bg-white/10 rounded-full" />
          <div className="absolute -bottom-10 right-16 w-24 h-24 bg-white/5 rounded-full" />
          
          <div className="relative z-10">
            <div className="inline-flex items-center bg-white/20 rounded-full px-3 py-1 mb-3">
              <span className="text-sm text-white font-medium">📚 정규 커리큘럼</span>
            </div>
            <h2 className="text-xl font-bold text-white mb-1">
              1월 유치부 - 겨울 풍경화
            </h2>
            <p className="text-white/80 text-sm">
              지도 포인트 확인 →
            </p>
          </div>
        </div>

        {/* Today's Tasks */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
          <h3 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
            <span className="w-1 h-4 bg-gradient-to-b from-amber-400 to-pink-400 rounded-full" />
            오늘 할 일
          </h3>
          
          {/* Daily Message - Main Button */}
          <button
            onClick={() => router.push('/daily-message')}
            className="w-full bg-gradient-to-r from-amber-400 to-yellow-400 rounded-2xl p-5 mb-4 flex items-center gap-4 hover:shadow-md transition text-left"
          >
            <div className="w-14 h-14 bg-white/40 rounded-xl flex items-center justify-center text-2xl">
              💬
            </div>
            <div className="flex-1">
              <p className="font-bold text-amber-900 mb-0.5">일일 메시지 발송</p>
              <p className="text-sm text-amber-700">수업 후 학부모 알림</p>
            </div>
            <span className="text-amber-900 text-xl">→</span>
          </button>

          {/* Secondary Buttons */}
          <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => router.push('/reports/select')}
            className="bg-slate-50 rounded-xl p-4 flex items-center gap-3 hover:bg-slate-100 transition"
          >
              <div className="w-11 h-11 bg-teal-50 rounded-xl flex items-center justify-center text-xl">
                📝
              </div>
              <span className="font-semibold text-slate-700">리포트 작성</span>
            </button>
            
            <button
              onClick={() => router.push('/students')}
              className="bg-slate-50 rounded-xl p-4 flex items-center gap-3 hover:bg-slate-100 transition"
            >
              <div className="w-11 h-11 bg-pink-50 rounded-xl flex items-center justify-center text-xl">
                👨‍🎓
              </div>
              <span className="font-semibold text-slate-700">학생 관리</span>
            </button>
          </div>
        </div>

        {/* Report Alert */}
        {needReportStudents.length > 0 && (
          <div className="bg-white rounded-2xl border-2 border-red-100 p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="bg-red-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                ⚠️ 리포트 필요
              </span>
              <span className="bg-red-50 text-red-500 text-sm font-bold px-3 py-1 rounded-full">
                {needReportStudents.length}명
              </span>
            </div>

            <div className="space-y-2 mb-4">
              {needReportStudents.map((student) => (
                <div 
                  key={student.id}
                  className="flex items-center p-3 bg-slate-50 rounded-xl"
                >
                  <div className="w-10 h-10 bg-gradient-to-br from-pink-100 to-teal-100 rounded-lg flex items-center justify-center text-lg mr-3">
                    🎨
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-slate-800">{student.name}</p>
                    <p className="text-sm text-red-500">
                      {student.days_since_report === 999 ? '리포트 없음' : `${Math.floor(student.days_since_report / 30)}개월 경과`}
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      router.push(`/reports/new?studentId=${student.id}`)
                    }}
                    className="bg-gradient-to-r from-teal-500 to-cyan-500 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:shadow-md transition"
                  >
                    작성하기
                  </button>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-dashed border-slate-200 flex items-center gap-2">
              <span className="text-lg">📊</span>
              <span className="text-sm text-slate-500">이번달 리포트</span>
              <span className="text-sm font-bold text-teal-500">{monthlyReports}건</span>
              <span className="text-sm text-slate-500">작성</span>
            </div>
          </div>
        )}
      </div>
    </>
  )
}