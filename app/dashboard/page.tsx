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
  class_ids: string[]
}

interface CurriculumItem {
  id: string
  month: number
  target_group: string
  title: string
}

interface ProgressAlertStudent {
  id: string
  name: string
  class_name: string
  session_count: number
  work_title: string
}

interface CompletedSketchbookStudent {
  id: string
  name: string
  class_name: string
  book_number: number
  completed_at: string
}

interface ClassStat {
  id: string
  name: string
  total_students: number
  avg_sessions: number
  completion_rate: number
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

// ── 헬퍼 ────────────────────────────────────────────────
function sessionBadge(sessions: number) {
  if (sessions >= 4) return { bg: '#fef2f2', border: '#fecaca', color: '#dc2626', dot: '#ef4444', label: '관리 필요' }
  return { bg: '#fffbeb', border: '#fde68a', color: '#d97706', dot: '#f59e0b', label: '주의' }
}

function completionColor(rate: number) {
  if (rate >= 80) return '#16a34a'
  if (rate >= 60) return '#d97706'
  return '#dc2626'
}

export default function DashboardPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [userRole, setUserRole] = useState('')

  const [user, setUser] = useState<UserProfile | null>(null)
  const [activeStudents, setActiveStudents] = useState(0)
  const [pendingReports, setPendingReports] = useState(0)
  const [randomCurriculum, setRandomCurriculum] = useState<CurriculumItem | null>(null)

  // 신규 섹션 상태
  const [classStats, setClassStats] = useState<ClassStat[]>([])
  const [progressAlerts, setProgressAlerts] = useState<ProgressAlertStudent[]>([])
  const [completedSketchbooks, setCompletedSketchbooks] = useState<CompletedSketchbookStudent[]>([])
  const [mgmtFilter, setMgmtFilter] = useState<'all' | 'attention' | 'critical' | 'completed'>('all')
  const [mgmtClassFilter, setMgmtClassFilter] = useState<string>('all')

  // 본사 admin용
  const [totalBranches, setTotalBranches] = useState(0)
  const [totalActiveStudents, setTotalActiveStudents] = useState(0)
  const [totalBilling, setTotalBilling] = useState(0)
  const [greenCount, setGreenCount] = useState(0)
  const [yellowCount, setYellowCount] = useState(0)
  const [redCount, setRedCount] = useState(0)
  const [branchStats, setBranchStats] = useState<BranchStats[]>([])
  const [billingByTier, setBillingByTier] = useState<BillingTier[]>([])

  useEffect(() => { loadData() }, [])

  function getBillingInfo(activeCount: number): { tier: string; amount: number } {
    if (activeCount <= 30) return { tier: '~30명', amount: 30000 }
    if (activeCount <= 50) return { tier: '31~50명', amount: 40000 }
    if (activeCount <= 80) return { tier: '51~80명', amount: 60000 }
    if (activeCount <= 120) return { tier: '81~120명', amount: 80000 }
    if (activeCount <= 150) return { tier: '121~150명', amount: 100000 }
    return { tier: '150명+', amount: 100000 + (activeCount - 150) * 500 }
  }

  function getStatusFromRates(messageRate: number, reportRate: number): { status: 'green' | 'yellow' | 'red'; reason: string } {
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

  const formatCurrency = (amount: number) => new Intl.NumberFormat('ko-KR').format(amount) + '원'

  async function loadData() {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) { router.push('/login'); return }

      const { data: profile } = await supabase
        .from('user_profiles').select('name, role, branch_id').eq('id', authUser.id).single()

      if (!profile) { router.push('/login'); return }
      setUserRole(profile.role)

      if (profile.role === 'staff') { router.push('/admin/curriculum'); return }

      if (profile.role === 'admin') {
        setUser({ name: profile.name, role: profile.role, branch_id: null, branch_name: null, class_names: [], class_ids: [] })
        await loadAdminData()
      } else {
        await loadBranchData(authUser.id, profile)
      }
    } catch (error) {
      console.error('Dashboard load error:', error)
      setLoading(false)
    } finally {
      // admin만 여기서 로딩 해제 (지점은 loadBranchData 내부에서 해제)
      if (userRole === 'admin' || !userRole) setLoading(false)
    }
  }

  // ===== 본사 데이터 (스냅샷 방식) =====
  async function loadAdminData() {
    // ★ 스냅샷 테이블에서 1회 조회 (기존: 지점 수 × 다수 쿼리)
    const { data: snapshots } = await supabase
      .from('dashboard_snapshots')
      .select('*')
      .eq('snapshot_date', new Date().toISOString().split('T')[0])

    if (!snapshots || snapshots.length === 0) {
      // 스냅샷이 없으면 생성 시도
      await supabase.rpc('generate_dashboard_snapshot')
      const { data: retrySnapshots } = await supabase
        .from('dashboard_snapshots')
        .select('*')
        .eq('snapshot_date', new Date().toISOString().split('T')[0])
      if (!retrySnapshots || retrySnapshots.length === 0) return
      return processSnapshots(retrySnapshots)
    }

    processSnapshots(snapshots)
  }

  function processSnapshots(snapshots: any[]) {
    const globalSnapshot = snapshots.find(s => s.branch_id === null)
    const branchSnapshots = snapshots.filter(s => s.branch_id !== null)

    // 지점 이름 조회
    supabase.from('branches').select('id, name').order('name').then(({ data: branches }) => {
      const branchMap = new Map(branches?.map(b => [b.id, b.name]) || [])

      setTotalBranches(branchSnapshots.length)
      setTotalActiveStudents(globalSnapshot?.active_students || 0)

      // 지점별 통계 구성
      const now = new Date()
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, now.getDate())

      const stats: BranchStats[] = branchSnapshots.map(snap => {
        const activeCount = snap.active_students || 0
        const billing = getBillingInfo(activeCount)
        const needReport = snap.need_report_students || 0
        const reportRate = activeCount > 0 ? Math.round(((activeCount - needReport) / activeCount) * 100) : 0
        const statusInfo = getStatusFromRates(100, reportRate) // 메시지율은 스냅샷에 없으므로 100으로

        return {
          id: snap.branch_id,
          name: branchMap.get(snap.branch_id) || '알 수 없음',
          active_count: activeCount,
          change_this_month: 0,
          billing_tier: billing.tier,
          billing_amount: billing.amount,
          last_message_days: null,
          last_report_days: null,
          message_rate: 100,
          report_rate: reportRate,
          status: statusInfo.status,
          status_reason: statusInfo.reason
        }
      })

      setBranchStats(stats)
      setTotalBilling(stats.reduce((sum, b) => sum + b.billing_amount, 0))
      setGreenCount(stats.filter(b => b.status === 'green').length)
      setYellowCount(stats.filter(b => b.status === 'yellow').length)
      setRedCount(stats.filter(b => b.status === 'red').length)

      const tierMap = new Map<string, { count: number; amount: number }>()
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
    })
  }

  // ===== 지점 계정 데이터 (2단계 로딩) =====
  async function loadBranchData(authUserId: string, profile: any) {
    const now = new Date()
    const currentMonth = now.getMonth() + 1
    const currentYear = now.getFullYear()
    const startOfMonth = new Date(currentYear, now.getMonth(), 1)

    // ★ 1단계: 기본 정보만 빠르게 로드 (화면 즉시 표시)
    try {
      let studentsQuery = supabase.from('students').select('id, name, class_id, last_report_at, status')
      if (profile.branch_id) studentsQuery = studentsQuery.eq('branch_id', profile.branch_id)

      let reportsQuery = supabase.from('reports').select('student_id').gte('created_at', startOfMonth.toISOString())
      if (profile.branch_id) reportsQuery = reportsQuery.eq('branch_id', profile.branch_id)

      const [branchesResult, classesResult, teacherClassesResult, studentsResult, reportsResult, curriculumResult] = await Promise.all([
        supabase.from('branches').select('id, name'),
        supabase.from('classes').select('id, name').eq('branch_id', profile.branch_id),
        profile.role === 'teacher'
          ? supabase.from('teacher_classes').select('class_id').eq('teacher_id', authUserId)
          : Promise.resolve({ data: null }),
        studentsQuery,
        reportsQuery,
        supabase.from('monthly_curriculum').select('id, month, target_group, title').eq('status', 'active').eq('year', currentYear).eq('month', currentMonth),
      ])

      const branchMap = new Map(branchesResult.data?.map(b => [b.id, b.name]) || [])
      const classMap = new Map(classesResult.data?.map((c: any) => [c.id, c.name]) || [])

      const branchName = profile.branch_id ? (branchMap.get(profile.branch_id) || null) : null
      let classIds: string[] = []
      let classNames: string[] = []
      if (profile.role === 'teacher' && teacherClassesResult.data) {
        classIds = teacherClassesResult.data.map((tc: any) => tc.class_id)
        classNames = classIds.map((id: string) => classMap.get(id)).filter((n: any): n is string => !!n)
      }
      setUser({ name: profile.name, role: profile.role, branch_id: profile.branch_id, branch_name: branchName, class_names: classNames, class_ids: classIds })

      const allStudents = studentsResult.data || []
      const activeStudentsList = allStudents.filter(s => s.status === 'active')
      setActiveStudents(activeStudentsList.length)

      const reportedIds = new Set(reportsResult.data?.map(r => r.student_id) || [])
      setPendingReports(activeStudentsList.filter(s => !reportedIds.has(s.id)).length)

      if (curriculumResult.data?.length) {
        setRandomCurriculum(curriculumResult.data[Math.floor(Math.random() * curriculumResult.data.length)])
      }

      // ★ 1단계 완료 → 로딩 해제 (화면 즉시 표시)
      setLoading(false)

      // ★ 2단계: 스케치북/반별 통계는 백그라운드에서 로드
      if (activeStudentsList.length === 0) return

      loadSketchbookData(activeStudentsList, classesResult.data || [], classMap, classIds, profile)

    } catch (error) {
      console.error('Dashboard load error:', error)
      // 에러 시에도 로딩 해제 (무한 로딩 방지)
      setLoading(false)
    }
  }

  // ★ 2단계: 스케치북/반별 통계 (백그라운드, 실패해도 화면에 영향 없음)
  async function loadSketchbookData(
    activeStudentsList: any[], 
    allClasses: any[], 
    classMap: Map<string, string>, 
    classIds: string[], 
    profile: any
  ) {
    try {
      const studentIds = activeStudentsList.map(s => s.id)
      const studentMap = new Map(activeStudentsList.map(s => [s.id, s]))

      const { data: sketchbooks } = await supabase
        .from('sketchbooks')
        .select('id, student_id, book_number, status, completed_at, followup_done')
        .in('student_id', studentIds)

      const activeSketchbookMap = new Map<string, string>()
      const completedSketchbookMap = new Map<string, { book_number: number; completed_at: string }>()
      const sbToStudent = new Map<string, string>()

      sketchbooks?.forEach((sk: any) => {
        sbToStudent.set(sk.id, sk.student_id)
        if (sk.status === 'active') {
          activeSketchbookMap.set(sk.student_id, sk.id)
        } else if (sk.status === 'completed' && sk.completed_at && !sk.followup_done) {
          const existing = completedSketchbookMap.get(sk.student_id)
          if (!existing || new Date(sk.completed_at) > new Date(existing.completed_at)) {
            completedSketchbookMap.set(sk.student_id, { book_number: sk.book_number, completed_at: sk.completed_at })
          }
        }
      })

      const activeSketchbookIds = [...activeSketchbookMap.values()]
      const allSketchbookIds = sketchbooks?.map((sk: any) => sk.id) || []

      const [inProgressWorksResult, completedWorksResult, allActiveWorksResult] = await Promise.all([
        activeSketchbookIds.length > 0
          ? supabase
              .from('sketchbook_works')
              .select('id, sketchbook_id, curriculum_id, custom_title, is_custom, session_count')
              .in('sketchbook_id', activeSketchbookIds)
              .eq('status', 'in_progress')
              .gte('session_count', 3)
          : Promise.resolve({ data: [] }),
        allSketchbookIds.length > 0
          ? supabase
              .from('sketchbook_works')
              .select('sketchbook_id, session_count')
              .in('sketchbook_id', allSketchbookIds)
              .eq('status', 'completed')
          : Promise.resolve({ data: [] }),
        activeSketchbookIds.length > 0
          ? supabase
              .from('sketchbook_works')
              .select('sketchbook_id, session_count')
              .in('sketchbook_id', activeSketchbookIds)
          : Promise.resolve({ data: [] }),
      ])

      const worksData = inProgressWorksResult.data || []
      const completedWorksData = completedWorksResult.data || []

      let curriculumTitleMap: Record<string, string> = {}
      const curriculumIds = [...new Set(
        worksData.filter(w => !w.is_custom && w.curriculum_id).map(w => w.curriculum_id)
      )]
      if (curriculumIds.length > 0) {
        const { data: currs } = await supabase
          .from('monthly_curriculum').select('id, title').in('id', curriculumIds)
        currs?.forEach((c: any) => { curriculumTitleMap[c.id] = c.title })
      }

      // 진도 경고 목록
      const progressAlertList: ProgressAlertStudent[] = []
      worksData.forEach(w => {
        const studentId = sbToStudent.get(w.sketchbook_id)
        if (!studentId) return
        const student = studentMap.get(studentId)
        if (!student) return
        if (profile.role === 'teacher' && classIds.length > 0 && !classIds.includes(student.class_id || '')) return
        progressAlertList.push({
          id: studentId,
          name: student.name,
          class_name: student.class_id ? (classMap.get(student.class_id) || '-') : '-',
          session_count: w.session_count,
          work_title: w.is_custom ? (w.custom_title || '') : (curriculumTitleMap[w.curriculum_id] || ''),
        })
      })
      progressAlertList.sort((a, b) => b.session_count - a.session_count)
      setProgressAlerts(progressAlertList)

      // 스케치북 완료 학생 목록
      const completedList: CompletedSketchbookStudent[] = []
      activeStudentsList.forEach(s => {
        const completed = completedSketchbookMap.get(s.id)
        if (!completed) return
        if (profile.role === 'teacher' && classIds.length > 0 && !classIds.includes(s.class_id || '')) return
        completedList.push({
          id: s.id,
          name: s.name,
          class_name: s.class_id ? (classMap.get(s.class_id) || '-') : '-',
          book_number: completed.book_number,
          completed_at: completed.completed_at.split('T')[0],
        })
      })
      setCompletedSketchbooks(completedList)

      // 반별 통계
      const completedWorksMap: Record<string, number> = {}
      const completedWorksAllMap: Record<string, number[]> = {}
      completedWorksData.forEach((w: any) => {
        const sid = sbToStudent.get(w.sketchbook_id)
        if (!sid) return
        if (completedWorksMap[sid] === undefined || w.session_count < completedWorksMap[sid]) {
          completedWorksMap[sid] = w.session_count
        }
        if (!completedWorksAllMap[sid]) completedWorksAllMap[sid] = []
        completedWorksAllMap[sid].push(w.session_count)
      })

      // ★ 평균 진도용: 활성 스케치북의 모든 작품 (in_progress + completed 모두 포함)
      const activeWorksAllMap: Record<string, number[]> = {}
      const allActiveWorksData = allActiveWorksResult.data || []
      allActiveWorksData.forEach((w: any) => {
        const sid = sbToStudent.get(w.sketchbook_id)
        if (!sid) return
        if (!activeWorksAllMap[sid]) activeWorksAllMap[sid] = []
        activeWorksAllMap[sid].push(w.session_count)
      })

      const targetClasses = profile.role === 'teacher' && classIds.length > 0
        ? allClasses.filter((c: any) => classIds.includes(c.id))
        : allClasses

      const statsArr: ClassStat[] = targetClasses.map((cls: any) => {
        const classStudents = activeStudentsList.filter(s => s.class_id === cls.id)
        const total = classStudents.length
        if (total === 0) return { id: cls.id, name: cls.name, total_students: 0, avg_sessions: 0, completion_rate: 0 }

        const allWorkSessions = classStudents.flatMap(s => activeWorksAllMap[s.id] || [])
        const avgSessions = allWorkSessions.length > 0
          ? Math.round((allWorkSessions.reduce((sum, v) => sum + v, 0) / allWorkSessions.length) * 10) / 10
          : 0

        const completedWithin5 = classStudents.filter(s => completedWorksMap[s.id] !== undefined && completedWorksMap[s.id] <= 5).length
        const completionRate = Math.round((completedWithin5 / total) * 100)

        return { id: cls.id, name: cls.name, total_students: total, avg_sessions: avgSessions, completion_rate: completionRate }
      })
      setClassStats(statsArr)

    } catch (error) {
      console.error('Sketchbook data load error (non-blocking):', error)
      // 2단계 실패해도 화면은 정상 (1단계 데이터로 이미 표시됨)
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

  // 관리 필요 원생 파생값
  const progressAttentionCount = progressAlerts.filter(s => s.session_count >= 3 && s.session_count < 4).length
  const progressCriticalCount = progressAlerts.filter(s => s.session_count >= 4).length
  const completedCount = completedSketchbooks.length
  const totalMgmt = progressAlerts.length + completedSketchbooks.length

  const classFilteredProgress = mgmtClassFilter === 'all'
    ? progressAlerts
    : progressAlerts.filter(s => s.class_name === mgmtClassFilter)

  const classFilteredCompleted = mgmtClassFilter === 'all'
    ? completedSketchbooks
    : completedSketchbooks.filter(s => s.class_name === mgmtClassFilter)

  const filteredProgress = mgmtFilter === 'attention'
    ? classFilteredProgress.filter(s => s.session_count >= 3 && s.session_count < 4)
    : mgmtFilter === 'critical'
    ? classFilteredProgress.filter(s => s.session_count >= 4)
    : mgmtFilter === 'completed' ? []
    : classFilteredProgress

  const showProgress = mgmtFilter === 'all' || mgmtFilter === 'attention' || mgmtFilter === 'critical'
  const showCompleted = mgmtFilter === 'all' || mgmtFilter === 'completed'

  // ===== 로딩 =====
  if (loading) {
    return userRole === 'admin' ? <DashboardAdminSkeleton /> : <DashboardBranchSkeleton />
  }

  // ===== 본사 관리자 (기존과 동일) =====
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
                    <span className={branch.message_rate < 50 ? 'text-red-500 font-semibold' : branch.message_rate < 80 ? 'text-amber-500 font-semibold' : 'text-slate-400'}>메시지 {branch.message_rate}%</span>
                    <span className={branch.report_rate < 50 ? 'text-red-500 font-semibold' : branch.report_rate < 80 ? 'text-amber-500 font-semibold' : 'text-slate-400'}>리포트 {branch.report_rate}%</span>
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
                    <p className="text-xs text-slate-400 mt-0.5 pl-1">{tierBranches.map(b => `${b.name}(${b.active_count}명)`).join(', ')}</p>
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
            {(user?.role === 'director' || user?.role === 'manager') && (
              <button onClick={() => router.push('/users/new')} className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex items-center gap-2.5 hover:bg-teal-50/50 transition text-left col-span-2">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center text-lg flex-shrink-0" style={{ background: '#F0FFF4' }}>👤</div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-800">강사 등록</div>
                  <div className="text-xs text-gray-400">새 강사 계정 직접 생성</div>
                </div>
              </button>
            )}
            {(user?.role === 'director' || user?.role === 'manager') && (
            <button onClick={() => router.push('/users')} className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex items-center gap-2.5 hover:bg-teal-50/50 transition text-left col-span-2">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center text-lg flex-shrink-0" style={{ background: '#EFF6FF' }}>👩‍🏫</div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-800">강사 관리</div>
              <div className="text-xs text-gray-400">담당반 수정 · 비활성화</div>
            </div>
          </button>
          )}
          </div>
        </div>

        {/* ④ 반별 진도 현황 [신규] */}
        {classStats.length > 0 && (
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                <span className="w-1 h-4 rounded-sm inline-block" style={{ background: 'linear-gradient(180deg, #5BB5C5 0%, #06b6d4 100%)' }}></span>
                반별 진도 현황
              </h3>
              {user?.role === 'teacher' && (
                <span className="text-xs font-semibold text-teal-600 bg-teal-50 px-2 py-0.5 rounded-md">내 반만 표시</span>
              )}
            </div>
            <div className="flex flex-col gap-2.5">
              {classStats.map(cls => (
                <div key={cls.id} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                  <div className="flex justify-between items-center mb-2.5">
                    <span className="text-sm font-bold text-gray-800">{cls.name}</span>
                    <span className="text-xs text-gray-400">재원 {cls.total_students}명</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {/* 평균 진도 회차 */}
                    <div className="bg-white rounded-lg p-2.5 border border-gray-100">
                      <div className="text-xs text-gray-400 mb-1">평균 진도 회차</div>
                      <div className="flex items-baseline gap-0.5">
                        <span className="text-xl font-extrabold" style={{ color: cls.avg_sessions >= 3.5 ? '#dc2626' : cls.avg_sessions >= 2.5 ? '#d97706' : '#0d9488' }}>
                          {cls.avg_sessions.toFixed(1)}
                        </span>
                        <span className="text-xs text-gray-400">회</span>
                      </div>
                    </div>
                    {/* 5회 이내 완료율 */}
                    <div className="bg-white rounded-lg p-2.5 border border-gray-100">
                      <div className="text-xs text-gray-400 mb-1">5회 이내 완료율</div>
                      <div className="flex items-baseline gap-0.5 mb-1.5">
                        <span className="text-xl font-extrabold" style={{ color: completionColor(cls.completion_rate) }}>
                          {cls.completion_rate}
                        </span>
                        <span className="text-xs text-gray-400">%</span>
                      </div>
                      <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${cls.completion_rate}%`, background: completionColor(cls.completion_rate) }} />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ⑤ 관리 필요 원생 [신규] */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
              <span className="w-1 h-4 rounded-sm inline-block" style={{ background: 'linear-gradient(180deg, #FF6B6B 0%, #FFB4B4 100%)' }}></span>
              관리 필요 원생
            </h3>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${totalMgmt > 0 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
              {totalMgmt}명
            </span>
          </div>

          {totalMgmt > 0 ? (
            <>
              {/* 반별 필터 */}
              {(() => {
                const allClassNames = [
                  ...new Set([
                    ...progressAlerts.map(s => s.class_name),
                    ...completedSketchbooks.map(s => s.class_name),
                  ])
                ].filter(Boolean).sort()
                return allClassNames.length > 1 ? (
                  <div className="flex gap-1.5 mb-2 overflow-x-auto pb-0.5">
                    <button
                      onClick={() => setMgmtClassFilter('all')}
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold transition whitespace-nowrap flex-shrink-0 ${
                        mgmtClassFilter === 'all'
                          ? 'bg-teal-500 text-white'
                          : 'bg-teal-50 text-teal-600 border border-teal-200 hover:bg-teal-100'
                      }`}
                    >
                      전체반
                    </button>
                    {allClassNames.map(cn => {
                      const count = progressAlerts.filter(s => s.class_name === cn).length
                        + completedSketchbooks.filter(s => s.class_name === cn).length
                      return (
                        <button
                          key={cn}
                          onClick={() => setMgmtClassFilter(cn)}
                          className={`px-2.5 py-1 rounded-full text-xs font-semibold transition whitespace-nowrap flex-shrink-0 ${
                            mgmtClassFilter === cn
                              ? 'bg-teal-500 text-white'
                              : 'bg-teal-50 text-teal-600 border border-teal-200 hover:bg-teal-100'
                          }`}
                        >
                          {cn} ({count})
                        </button>
                      )
                    })}
                  </div>
                ) : null
              })()}

              {/* 상태 필터 탭 */}
              <div className="flex gap-1.5 mb-3.5 overflow-x-auto pb-0.5">
                {[
                  { key: 'all', label: `전체 ${classFilteredProgress.length + classFilteredCompleted.length}` },
                  { key: 'attention', label: `⚠️ 주의 ${classFilteredProgress.filter(s => s.session_count >= 3 && s.session_count < 4).length}` },
                  { key: 'critical', label: `🚨 관리필요 ${classFilteredProgress.filter(s => s.session_count >= 4).length}` },
                  { key: 'completed', label: `📚 스케치북완료 ${classFilteredCompleted.length}` },
                ].map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setMgmtFilter(tab.key as any)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap flex-shrink-0 ${mgmtFilter === tab.key ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="space-y-1.5">
                {/* 진도 경고 */}
                {showProgress && (
                  <>
                    {mgmtFilter === 'all' && filteredProgress.length > 0 && (
                      <p className="text-xs font-semibold text-gray-400 pt-1 pb-0.5 px-1">진도 경고</p>
                    )}
                    {filteredProgress.map((s, idx) => {
                      const badge = sessionBadge(s.session_count)
                      return (
                        <div
                          key={`progress-${idx}`}
                          onClick={() => router.push(`/students/${s.id}`)}
                          className="flex items-center p-3.5 rounded-xl cursor-pointer transition"
                          style={{ background: '#f9fafb', border: `1.5px solid ${badge.border}` }}
                        >
                          <div className="w-2 h-2 rounded-full flex-shrink-0 mr-3" style={{ background: badge.dot, boxShadow: `0 0 5px ${badge.dot}99` }} />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-gray-800 mb-0.5">
                              {s.name}
                              <span className="text-xs font-normal text-gray-400 ml-1.5">{s.class_name}</span>
                            </div>
                            <div className="text-xs text-gray-500">{s.work_title}</div>
                          </div>
                          <div className="flex-shrink-0 ml-2 px-2.5 py-1 rounded-lg text-xs font-bold" style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}>
                            {s.session_count}회차 · {badge.label}
                          </div>
                        </div>
                      )
                    })}
                  </>
                )}

                {/* 스케치북 완료 */}
                {showCompleted && (
                  <>
                    {mgmtFilter === 'all' && completedSketchbooks.length > 0 && (
                      <p className="text-xs font-semibold text-gray-400 pt-1 pb-0.5 px-1">스케치북 완료 — 성장리포트 필요</p>
                    )}
                    {classFilteredCompleted.map((s, idx) => (
                      <div
                        key={`completed-${idx}`}
                        onClick={() => router.push(`/students/${s.id}`)}
                        className="flex items-center p-3.5 rounded-xl cursor-pointer transition"
                        style={{ background: '#f9fafb', border: '1.5px solid #e0e7ff' }}
                      >
                        <div className="w-2 h-2 rounded-full flex-shrink-0 mr-3" style={{ background: '#6366f1', boxShadow: '0 0 5px #6366f199' }} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-gray-800 mb-0.5">
                            {s.name}
                            <span className="text-xs font-normal text-gray-400 ml-1.5">{s.class_name}</span>
                          </div>
                          <div className="text-xs text-gray-500">스케치북 {s.book_number}권 · {s.completed_at} 완료</div>
                        </div>
                        <div className="flex-shrink-0 ml-2 px-2.5 py-1 rounded-lg text-xs font-bold" style={{ background: '#eef2ff', color: '#4f46e5', border: '1px solid #c7d2fe' }}>
                          리포트 필요
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="text-center py-8">
              <p className="text-3xl mb-2">🎉</p>
              <p className="font-semibold text-gray-700">모든 원생이 잘 관리되고 있어요!</p>
              <p className="text-xs text-gray-400 mt-1">진도 관리와 스케치북이 모두 정상입니다</p>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
