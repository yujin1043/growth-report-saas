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

interface RecentReport {
  id: string
  period_start: string
  period_end: string
  created_at: string
  student_name: string
  student_code: string
  branch_name: string
}

interface NeedReportStudent {
  id: string
  name: string
  student_code: string
  branch_name: string
  class_name: string
  last_report_at: string | null
  days_since_report: number
}

interface BranchSummary {
  id: string
  name: string
  active_count: number
  billing_amount: number
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
  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [showTooltip, setShowTooltip] = useState(false)
  const [userRole, setUserRole] = useState('')
  
  // 일반 사용자
  const [totalStudents, setTotalStudents] = useState(0)
  const [activeStudents, setActiveStudents] = useState(0)
  const [monthlyReports, setMonthlyReports] = useState(0)
  const [pendingStudents, setPendingStudents] = useState(0)
  const [recentReports, setRecentReports] = useState<RecentReport[]>([])
  const [needReportStudents, setNeedReportStudents] = useState<NeedReportStudent[]>([])

  // 관리자 요약
  const [totalBranches, setTotalBranches] = useState(0)
  const [totalActiveStudents, setTotalActiveStudents] = useState(0)
  const [totalBilling, setTotalBilling] = useState(0)
  const [greenCount, setGreenCount] = useState(0)
  const [yellowCount, setYellowCount] = useState(0)
  const [redCount, setRedCount] = useState(0)
  const [branchSummary, setBranchSummary] = useState<BranchSummary[]>([])
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

  // 새 상태 판정 기준: 메시지 작성률 + 리포트 작성률
  function getStatusFromRates(
    messageRate: number,
    reportRate: number
  ): { status: 'green' | 'yellow' | 'red', reason: string } {
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
    const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, now.getDate())

    // 수업일 수 계산
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    let businessDaysSoFar = 0
    for (let d = 1; d <= Math.min(now.getDate(), daysInMonth); d++) {
      const day = new Date(now.getFullYear(), now.getMonth(), d).getDay()
      if (day !== 0 && day !== 6) businessDaysSoFar++
    }

    const [branchesResult, studentsResult, messagesResult, reportsResult] = await Promise.all([
      supabase.from('branches').select('id, name').order('name'),
      supabase.from('students').select('id, branch_id, status, last_report_at, enrolled_at'),
      supabase.from('daily_messages').select('id, branch_id, created_at').gte('created_at', startOfMonth.toISOString()),
      supabase.from('reports').select('id, branch_id, created_at')
    ])

    const branches = branchesResult.data || []
    const students = studentsResult.data || []
    const messages = messagesResult.data || []
    const reports = reportsResult.data || []

    setTotalBranches(branches.length)

    const stats: BranchSummary[] = branches.map(branch => {
      const activeStudentsList = students.filter(s => s.branch_id === branch.id && s.status === 'active')
      const activeCount = activeStudentsList.length
      const billing = getBillingInfo(activeCount)

      // 메시지 작성률
      const branchMessageDates = new Set(
        messages
          .filter(m => m.branch_id === branch.id)
          .map(m => new Date(m.created_at).toDateString())
      )
      const messageRate = businessDaysSoFar > 0
        ? Math.round((branchMessageDates.size / businessDaysSoFar) * 100)
        : 0

      // 리포트 작성률
      const withReport = activeStudentsList.filter(s =>
        s.last_report_at && new Date(s.last_report_at) >= twoMonthsAgo
      ).length
      const reportRate = activeCount > 0
        ? Math.round((withReport / activeCount) * 100)
        : 0

      const statusInfo = getStatusFromRates(messageRate, reportRate)

      return {
        id: branch.id,
        name: branch.name,
        active_count: activeCount,
        billing_amount: billing.amount,
        status: statusInfo.status,
        status_reason: statusInfo.reason
      }
    })

    setBranchSummary(stats)
    setTotalActiveStudents(stats.reduce((sum, b) => sum + b.active_count, 0))
    setTotalBilling(stats.reduce((sum, b) => sum + b.billing_amount, 0))
    setGreenCount(stats.filter(b => b.status === 'green').length)
    setYellowCount(stats.filter(b => b.status === 'yellow').length)
    setRedCount(stats.filter(b => b.status === 'red').length)

    // 과금 요약
    const tierMap = new Map<string, { count: number, amount: number }>()
    stats.forEach(b => {
      const billing = getBillingInfo(b.active_count)
      const existing = tierMap.get(billing.tier) || { count: 0, amount: 0 }
      tierMap.set(billing.tier, {
        count: existing.count + 1,
        amount: existing.amount + billing.amount
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
    const userBranchId = profile.branch_id

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
    const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, now.getDate())

    let totalQuery = supabase.from('students').select('*', { count: 'exact', head: true })
    let activeStudentsQuery = supabase.from('students').select('id').eq('status', 'active')
    let reportsQuery = supabase.from('reports').select('*', { count: 'exact', head: true }).gte('created_at', startOfMonth.toISOString())
    let reportsStudentQuery = supabase.from('reports').select('student_id').gte('created_at', startOfMonth.toISOString())

    if (profile.role !== 'admin' && userBranchId) {
      totalQuery = totalQuery.eq('branch_id', userBranchId)
      activeStudentsQuery = activeStudentsQuery.eq('branch_id', userBranchId)
      reportsQuery = reportsQuery.eq('branch_id', userBranchId)
      reportsStudentQuery = reportsStudentQuery.eq('branch_id', userBranchId)
    }

    const { count: total } = await totalQuery
    setTotalStudents(total || 0)

    const { data: activeStudentsData } = await activeStudentsQuery
    const activeCount = activeStudentsData?.length || 0
    setActiveStudents(activeCount)

    const { count: reports } = await reportsQuery
    setMonthlyReports(reports || 0)

    const { data: studentsWithReports } = await reportsStudentQuery
    const reportedStudentIds = new Set(studentsWithReports?.map(r => r.student_id) || [])
    const pendingCount = activeStudentsData?.filter(s => !reportedStudentIds.has(s.id)).length || 0
    setPendingStudents(pendingCount)

    // 리포트 필요 학생
    let needReportQuery = supabase
      .from('students')
      .select('id, name, student_code, branch_id, class_id, last_report_at')
      .eq('status', 'active')
      .or(`last_report_at.is.null,last_report_at.lt.${twoMonthsAgo.toISOString()}`)
      .order('last_report_at', { ascending: true, nullsFirst: true })
      .limit(10)

    if (profile.role !== 'admin' && userBranchId) {
      needReportQuery = needReportQuery.eq('branch_id', userBranchId)
    }

    const { data: needReportData } = await needReportQuery

    if (needReportData) {
      const needReportList: NeedReportStudent[] = needReportData.map(student => {
        const daysSince = student.last_report_at
          ? Math.floor((now.getTime() - new Date(student.last_report_at).getTime()) / (1000 * 60 * 60 * 24))
          : 999

        return {
          id: student.id,
          name: student.name,
          student_code: student.student_code || '-',
          branch_name: branchMap.get(student.branch_id) || '-',
          class_name: student.class_id ? (classMap.get(student.class_id) || '-') : '-',
          last_report_at: student.last_report_at,
          days_since_report: daysSince
        }
      })
      setNeedReportStudents(needReportList)
    }

    // 최근 리포트
    let recentQuery = supabase
      .from('reports')
      .select('id, period_start, period_end, created_at, student_id, branch_id')
      .order('created_at', { ascending: false })
      .limit(5)

    if (profile.role !== 'admin' && userBranchId) {
      recentQuery = recentQuery.eq('branch_id', userBranchId)
    }

    const { data: recentData } = await recentQuery

    if (recentData) {
      const studentIds = recentData.map(r => r.student_id).filter(Boolean)
      const { data: studentsData } = await supabase
        .from('students')
        .select('id, name, student_code')
        .in('id', studentIds)

      const studentMap = new Map(studentsData?.map(s => [s.id, s]) || [])

      const reportsWithDetails: RecentReport[] = recentData.map(report => {
        const student = studentMap.get(report.student_id)
        return {
          id: report.id,
          period_start: report.period_start,
          period_end: report.period_end,
          created_at: report.created_at,
          student_name: student?.name || '-',
          student_code: student?.student_code || '-',
          branch_name: branchMap.get(report.branch_id) || '-'
        }
      })
      setRecentReports(reportsWithDetails)
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const formatCurrency = (amount: number) => new Intl.NumberFormat('ko-KR').format(amount) + '원'

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-'
    const d = new Date(dateString)
    return `${d.getMonth() + 1}/${d.getDate()}`
  }

  const getRoleText = (role: string) => {
    switch (role) {
      case 'admin': return '본사'
      case 'director': return '원장'
      case 'manager': return '실장'
      case 'teacher': return '강사'
      default: return role
    }
  }

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-purple-100 text-purple-700'
      case 'director': return 'bg-indigo-100 text-indigo-700'
      case 'manager': return 'bg-blue-100 text-blue-700'
      case 'teacher': return 'bg-green-100 text-green-700'
      default: return 'bg-gray-100 text-gray-700'
    }
  }

  const getClassDisplay = () => {
    if (!user) return '전체 반'
    if (user.role === 'admin') return '전체 반'
    if (user.role === 'director' || user.role === 'manager') return '전체 반'
    if (user.class_names.length === 0) return '전체 반'
    if (user.class_names.length <= 3) return user.class_names.join(', ')
    return `${user.class_names.slice(0, 3).join(', ')} 외 ${user.class_names.length - 3}개`
  }

  const getUrgencyBadge = (days: number) => {
    if (days === 999) return <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700">리포트 없음</span>
    if (days > 120) return <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700">긴급</span>
    if (days > 90) return <span className="px-2 py-0.5 rounded-full text-xs bg-orange-100 text-orange-700">주의</span>
    return <span className="px-2 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-700">{days}일</span>
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

  // ═══════════════════════════════════
  // 관리자(admin) 대시보드 - 간소화
  // ═══════════════════════════════════
  if (userRole === 'admin') {
    const redBranches = branchSummary.filter(b => b.status === 'red')
    const yellowBranches = branchSummary.filter(b => b.status === 'yellow')

    return (
      <div className="min-h-screen">
        <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
          
          <p className="text-center text-sm text-slate-400">
            본사 대시보드
          </p>

          {/* 요약 카드 */}
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

          {/* 상태 요약 */}
          <div className="flex justify-center gap-6">
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-emerald-500"></span>
              <span className="text-slate-600">정상 <strong>{greenCount}</strong></span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-amber-500"></span>
              <span className="text-slate-600">유의 <strong>{yellowCount}</strong></span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-red-500"></span>
              <span className="text-slate-600">관리 필요 <strong>{redCount}</strong></span>
            </div>
          </div>

          {/* 경고 알림 */}
          {(redBranches.length > 0 || yellowBranches.length > 0) && (
            <div className="space-y-3">
              {redBranches.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
                  <h3 className="font-bold text-red-800 mb-2">🔴 관리 필요</h3>
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
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                  <h3 className="font-bold text-amber-800 mb-2">🟡 유의</h3>
                  <ul className="space-y-1">
                    {yellowBranches.map(b => (
                      <li key={b.id} className="text-sm text-amber-700">
                        <strong>{b.name}</strong>: {b.status_reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* 지점 관리 바로가기 */}
          <button
            onClick={() => router.push('/branches')}
            className="w-full bg-gradient-to-r from-teal-500 to-cyan-500 text-white py-5 rounded-2xl font-semibold text-lg hover:from-teal-600 hover:to-cyan-600 transition shadow-lg shadow-teal-500/25 flex items-center justify-center gap-3"
          >
            <span className="text-2xl">🏢</span>
            지점 관리 바로가기
          </button>

          {/* 과금 요약 */}
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

  // ═══════════════════════════════════
  // 일반 사용자 대시보드 (기존과 동일)
  // ═══════════════════════════════════
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <header className="bg-white shadow-sm border-b border-gray-100 sticky top-0 z-50 md:hidden">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold flex items-center gap-2">
              <span>🎨</span>
              <span className="bg-gradient-to-r from-teal-500 to-cyan-500 bg-clip-text text-transparent">
                그리마노트
              </span>
            </h1>

            <div className="hidden md:flex items-center gap-4">
              <button 
                onClick={() => router.push('/settings')}
                className="text-gray-500 hover:text-gray-700 text-sm transition"
              >
                설정
              </button>
              <button 
                onClick={handleLogout}
                className="text-gray-500 hover:text-red-500 text-sm transition"
              >
                로그아웃
              </button>
            </div>

            <button 
              onClick={() => setMenuOpen(!menuOpen)}
              className="md:hidden text-gray-600 text-2xl"
            >
              ☰
            </button>
          </div>

          {menuOpen && (
            <div className="md:hidden mt-3 pt-3 border-t space-y-2">
              <button 
                onClick={() => { router.push('/settings'); setMenuOpen(false); }}
                className="block w-full text-left px-2 py-2 text-gray-600 hover:bg-gray-100 rounded"
              >
                설정
              </button>
              <button 
                onClick={handleLogout}
                className="block w-full text-left px-2 py-2 text-gray-600 hover:bg-gray-100 rounded"
              >
                로그아웃
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-4 md:py-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 md:p-6 mb-5 md:mb-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 md:w-14 md:h-14 bg-gradient-to-br from-teal-400 to-cyan-500 rounded-full flex items-center justify-center text-white text-xl md:text-2xl font-bold shadow-lg shadow-teal-500/30">
              {user?.name?.charAt(0) || '?'}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-lg md:text-xl font-bold text-gray-800">{user?.name || '사용자'}님</h2>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getRoleBadgeColor(user?.role || '')}`}>
                  {getRoleText(user?.role || '')}
                </span>
              </div>
              <p className="text-sm text-gray-500">
                {user?.branch_name || '전체 지점'} / {getClassDisplay()}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-5 md:mb-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-5">
            <p className="text-gray-500 text-xs md:text-sm font-medium mb-2">재원 학생</p>
            <p className="text-3xl md:text-4xl font-bold text-gray-800">{activeStudents}<span className="text-lg text-gray-400 ml-1">명</span></p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-5">
            <p className="text-gray-500 text-xs md:text-sm font-medium mb-2">이번 달 리포트</p>
            <p className="text-3xl md:text-4xl font-bold text-gray-800">{monthlyReports}<span className="text-lg text-gray-400 ml-1">건</span></p>
          </div>

          <div 
            className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-5 cursor-pointer hover:bg-rose-50 transition"
            onClick={() => router.push('/students?filter=pending')}
          >
            <p className="text-gray-500 text-xs md:text-sm font-medium mb-2">미작성 학생</p>
            <p className="text-3xl md:text-4xl font-bold text-rose-400">{pendingStudents}<span className="text-lg text-rose-300 ml-1">명</span></p>
          </div>

          <div 
            className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-5 cursor-pointer hover:bg-gray-50 transition"
            onClick={() => router.push('/students')}
          >
            <p className="text-gray-500 text-xs md:text-sm font-medium mb-2">전체 학생</p>
            <p className="text-3xl md:text-4xl font-bold text-gray-800">{totalStudents}<span className="text-lg text-gray-400 ml-1">명</span></p>
          </div>
        </div>

        <button
          onClick={() => router.push('/daily-message')}
          className="w-full bg-gradient-to-r from-teal-500 to-cyan-500 text-white py-5 rounded-2xl font-semibold text-lg hover:from-teal-600 hover:to-cyan-600 transition shadow-lg shadow-teal-500/25 mb-3 flex items-center justify-center gap-3"
        >
          <span className="text-2xl">💬</span>
          일일 메시지 발송
        </button>

        <div className="grid grid-cols-2 gap-3 mb-6">
          <button
            onClick={() => router.push('/students')}
            className="bg-white text-slate-700 py-4 rounded-2xl text-sm font-medium border border-slate-200 hover:bg-slate-50 transition flex items-center justify-center gap-2"
          >
            <span>👨‍🎓</span> 학생 관리
          </button>
          <button
            onClick={() => router.push('/reports')}
            className="bg-white text-slate-700 py-4 rounded-2xl text-sm font-medium border border-slate-200 hover:bg-slate-50 transition flex items-center justify-center gap-2"
          >
            <span>📝</span> 리포트
          </button>
        </div>

        {/* 리포트 필요 학생 */}
        {needReportStudents.length > 0 && (
          <div className="bg-orange-50 border border-orange-200 rounded-2xl overflow-hidden mb-5">
            <div className="px-5 md:px-6 py-4 border-b border-orange-200 flex items-center justify-between">
              <h3 className="font-bold text-orange-800 flex items-center gap-2">
                <span className="text-lg">⚠️</span>
                리포트 작성 필요
              </h3>
              <span className="text-sm text-orange-600">2개월 이상 경과</span>
            </div>
            
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-orange-100/50 border-b border-orange-200">
                  <tr>
                    <th className="px-5 py-3 text-left text-sm font-medium text-orange-700">상태</th>
                    <th className="px-5 py-3 text-left text-sm font-medium text-orange-700">지점</th>
                    <th className="px-5 py-3 text-left text-sm font-medium text-orange-700">반</th>
                    <th className="px-5 py-3 text-left text-sm font-medium text-orange-700">이름</th>
                    <th className="px-5 py-3 text-left text-sm font-medium text-orange-700">마지막 리포트</th>
                    <th className="px-5 py-3 text-left text-sm font-medium text-orange-700">경과일</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-orange-100">
                  {needReportStudents.map(student => (
                    <tr 
                      key={student.id}
                      onClick={() => router.push(`/students/${student.id}`)}
                      className="hover:bg-orange-100/50 cursor-pointer transition"
                    >
                      <td className="px-5 py-3">{getUrgencyBadge(student.days_since_report)}</td>
                      <td className="px-5 py-3 text-sm text-orange-700">{student.branch_name}</td>
                      <td className="px-5 py-3 text-sm text-orange-700">{student.class_name}</td>
                      <td className="px-5 py-3 text-sm font-medium text-orange-900">{student.name}</td>
                      <td className="px-5 py-3 text-sm text-orange-600">
                        {student.last_report_at ? formatDate(student.last_report_at) : '없음'}
                      </td>
                      <td className="px-5 py-3 text-sm font-medium text-orange-700">
                        {student.days_since_report === 999 ? '-' : `${student.days_since_report}일`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="md:hidden divide-y divide-orange-100">
              {needReportStudents.map(student => (
                <div 
                  key={student.id}
                  onClick={() => router.push(`/students/${student.id}`)}
                  className="px-5 py-4 hover:bg-orange-100/50 cursor-pointer transition"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-orange-900">{student.name}</span>
                    {getUrgencyBadge(student.days_since_report)}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-orange-600">
                    <span>{student.branch_name}</span>
                    <span>•</span>
                    <span>{student.class_name}</span>
                    <span>•</span>
                    <span>{student.days_since_report === 999 ? '리포트 없음' : `${student.days_since_report}일 경과`}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 최근 리포트 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 md:px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
              <span className="text-lg">📋</span>
              최근 작성 리포트
            </h3>
            <button 
              onClick={() => router.push('/reports')}
              className="text-teal-600 text-sm hover:text-teal-700 font-medium transition"
            >
              전체보기
            </button>
          </div>
          
          {recentReports.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {recentReports.map(report => (
                <div 
                  key={report.id}
                  onClick={() => router.push(`/reports/${report.id}`)}
                  className="px-5 md:px-6 py-4 hover:bg-gray-50 cursor-pointer transition"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium text-gray-800">{report.student_name}</span>
                      <span className="text-xs text-gray-400 ml-2">{report.student_code}</span>
                    </div>
                    <span className="text-xs text-gray-400">{formatDate(report.created_at)}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {report.branch_name} · {formatDate(report.period_start)} ~ {formatDate(report.period_end)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-5 py-10 text-center text-gray-400 text-sm">
              아직 작성된 리포트가 없습니다
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
