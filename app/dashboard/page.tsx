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

export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [showTooltip, setShowTooltip] = useState(false)
  
  const [totalStudents, setTotalStudents] = useState(0)
  const [activeStudents, setActiveStudents] = useState(0)
  const [monthlyReports, setMonthlyReports] = useState(0)
  const [pendingStudents, setPendingStudents] = useState(0)
  const [recentReports, setRecentReports] = useState<RecentReport[]>([])
  const [needReportStudents, setNeedReportStudents] = useState<NeedReportStudent[]>([])

  useEffect(() => {
    loadData()
  }, [])

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

    let userBranchId: string | null = null
    let userRole = ''

    if (profile) {
      userBranchId = profile.branch_id
      userRole = profile.role

      let branchName = null
      let classNames: string[] = []

      if (profile.branch_id) {
        const { data: branch } = await supabase
          .from('branches')
          .select('name')
          .eq('id', profile.branch_id)
          .single()
        branchName = branch?.name || null
      }

      if (profile.role === 'teacher') {
        const { data: teacherClasses } = await supabase
          .from('teacher_classes')
          .select('class_id')
          .eq('teacher_id', authUser.id)

        if (teacherClasses && teacherClasses.length > 0) {
          const classIds = teacherClasses.map(tc => tc.class_id)
          const { data: classesData } = await supabase
            .from('classes')
            .select('name')
            .in('id', classIds)
          
          if (classesData) {
            classNames = classesData.map(c => c.name)
          }
        }
      }

      setUser({
        name: profile.name,
        role: profile.role,
        branch_id: profile.branch_id,
        branch_name: branchName,
        class_names: classNames
      })
    }

    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, now.getDate())

    let totalQuery = supabase.from('students').select('*', { count: 'exact', head: true })
    let activeStudentsQuery = supabase.from('students').select('id').eq('status', 'active')
    let reportsQuery = supabase.from('reports').select('*', { count: 'exact', head: true }).gte('created_at', startOfMonth.toISOString())
    let reportsStudentQuery = supabase.from('reports').select('student_id').gte('created_at', startOfMonth.toISOString())

    if (userRole !== 'admin' && userBranchId) {
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

    let needReportQuery = supabase
      .from('students')
      .select('id, name, student_code, branch_id, class_id, last_report_at')
      .eq('status', 'active')
      .or(`last_report_at.is.null,last_report_at.lt.${twoMonthsAgo.toISOString()}`)
      .order('last_report_at', { ascending: true, nullsFirst: true })
      .limit(10)

    if (userRole !== 'admin' && userBranchId) {
      needReportQuery = needReportQuery.eq('branch_id', userBranchId)
    }

    const { data: needReportData } = await needReportQuery

    if (needReportData) {
      const { data: branchesData } = await supabase.from('branches').select('id, name')
      const { data: classesData } = await supabase.from('classes').select('id, name')
      
      const branchMap = new Map(branchesData?.map(b => [b.id, b.name]) || [])
      const classMap = new Map(classesData?.map(c => [c.id, c.name]) || [])

      const needReportList: NeedReportStudent[] = needReportData.map(student => {
        const daysSince = student.last_report_at 
          ? Math.floor((now.getTime() - new Date(student.last_report_at).getTime()) / (1000 * 60 * 60 * 24))
          : 999
        
        return {
          id: student.id,
          name: student.name,
          student_code: student.student_code,
          branch_name: branchMap.get(student.branch_id) || '-',
          class_name: classMap.get(student.class_id) || '-',
          last_report_at: student.last_report_at,
          days_since_report: daysSince
        }
      })

      setNeedReportStudents(needReportList)
    }

    let recentQuery = supabase
      .from('reports')
      .select('id, period_start, period_end, created_at, student_id')
      .order('created_at', { ascending: false })
      .limit(10)

    if (userRole !== 'admin' && userBranchId) {
      recentQuery = recentQuery.eq('branch_id', userBranchId)
    }

    const { data: reportsData } = await recentQuery

    if (reportsData) {
      const reportsWithDetails: RecentReport[] = []

      for (const report of reportsData) {
        const { data: student } = await supabase
          .from('students')
          .select('name, student_code, branch_id')
          .eq('id', report.student_id)
          .single()

        let branchName = '-'
        if (student?.branch_id) {
          const { data: branch } = await supabase
            .from('branches')
            .select('name')
            .eq('id', student.branch_id)
            .single()
          branchName = branch?.name || '-'
        }

        reportsWithDetails.push({
          id: report.id,
          period_start: report.period_start,
          period_end: report.period_end,
          created_at: report.created_at,
          student_name: student?.name || '-',
          student_code: student?.student_code || '-',
          branch_name: branchName
        })
      }

      setRecentReports(reportsWithDetails)
    }

    setLoading(false)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ko-KR')
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
    if (days >= 90) return <span className="px-2 py-0.5 bg-red-100 text-red-600 rounded-full text-xs font-medium">긴급</span>
    if (days >= 60) return <span className="px-2 py-0.5 bg-orange-100 text-orange-600 rounded-full text-xs font-medium">주의</span>
    return <span className="px-2 py-0.5 bg-yellow-100 text-yellow-600 rounded-full text-xs font-medium">예정</span>
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-500 mx-auto mb-4"></div>
          <p className="text-gray-500">로딩 중...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <header className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-40 border-b border-gray-200/50">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <h1 className="text-lg md:text-xl font-bold bg-gradient-to-r from-teal-600 to-cyan-600 bg-clip-text text-transparent">
              그리마 성장리포트
            </h1>
            
            <div className="hidden md:flex items-center gap-4">
              <button 
                onClick={() => router.push('/settings')}
                className="text-gray-500 hover:text-teal-600 text-sm transition"
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
            className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-5 cursor-pointer hover:bg-orange-50 transition relative"
            onClick={() => router.push('/students?filter=needReport')}
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
          >
            <div className="flex items-center gap-1 mb-2">
              <p className="text-gray-500 text-xs md:text-sm font-medium">리포트 필요</p>
              <span className="text-gray-400 text-xs">ⓘ</span>
            </div>
            <p className="text-3xl md:text-4xl font-bold text-orange-400">{needReportStudents.length}<span className="text-lg text-orange-300 ml-1">명</span></p>
            
            {showTooltip && (
              <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 bg-gray-800 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap z-50 shadow-lg">
                마지막 리포트 후 2개월 이상 경과<br/>또는 리포트가 없는 학생
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-b-gray-800"></div>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:gap-4 mb-5 md:mb-6">
          <button
            onClick={() => router.push('/students')}
            className="bg-gradient-to-r from-teal-500 to-cyan-500 text-white py-4 md:py-5 rounded-2xl font-medium hover:from-teal-600 hover:to-cyan-600 transition shadow-lg shadow-teal-500/30 flex items-center justify-center gap-2 text-sm md:text-base"
          >
            <span className="text-xl">📝</span>
            리포트 작성
          </button>
          <button
            onClick={() => router.push('/students')}
            className="bg-white text-gray-700 py-4 md:py-5 rounded-2xl font-medium hover:bg-gray-50 transition border border-gray-200 flex items-center justify-center gap-2 text-sm md:text-base"
          >
            <span className="text-xl">👨‍🎓</span>
            학생 관리
          </button>
          {user?.role === 'admin' && (
            <>
              <button
                onClick={() => router.push('/users')}
                className="bg-white text-gray-700 py-4 md:py-5 rounded-2xl font-medium hover:bg-gray-50 transition border border-gray-200 flex items-center justify-center gap-2 text-sm md:text-base"
              >
                <span className="text-xl">👥</span>
                사용자 관리
              </button>
              <button
                onClick={() => router.push('/branches')}
                className="bg-white text-gray-700 py-4 md:py-5 rounded-2xl font-medium hover:bg-gray-50 transition border border-gray-200 flex items-center justify-center gap-2 text-sm md:text-base"
              >
                <span className="text-xl">🏢</span>
                지점 관리
              </button>
              <button
                onClick={() => router.push('/admin')}
                className="col-span-2 bg-gradient-to-r from-purple-500 to-indigo-500 text-white py-4 md:py-5 rounded-2xl font-medium hover:from-purple-600 hover:to-indigo-600 transition shadow-lg shadow-purple-500/30 flex items-center justify-center gap-2 text-sm md:text-base"
              >
                <span className="text-xl">📊</span>
                본사 관리
              </button>
            </>
          )}
        </div>

        {needReportStudents.length > 0 && (
          <div className="bg-orange-50 rounded-2xl shadow-sm border border-orange-200 overflow-hidden mb-5 md:mb-6">
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
            <>
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="px-5 py-3 text-left text-sm font-medium text-gray-600">지점</th>
                      <th className="px-5 py-3 text-left text-sm font-medium text-gray-600">학생ID</th>
                      <th className="px-5 py-3 text-left text-sm font-medium text-gray-600">이름</th>
                      <th className="px-5 py-3 text-left text-sm font-medium text-gray-600">지도기간</th>
                      <th className="px-5 py-3 text-left text-sm font-medium text-gray-600">생성일</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {recentReports.map(report => (
                      <tr 
                        key={report.id} 
                        onClick={() => router.push(`/reports/${report.id}`)}
                        className="hover:bg-teal-50/50 cursor-pointer transition"
                      >
                        <td className="px-5 py-4 text-sm text-gray-600">{report.branch_name}</td>
                        <td className="px-5 py-4 text-sm text-gray-500">{report.student_code}</td>
                        <td className="px-5 py-4 text-sm font-medium text-gray-900">{report.student_name}</td>
                        <td className="px-5 py-4 text-sm text-gray-600">{report.period_start} ~ {report.period_end}</td>
                        <td className="px-5 py-4 text-sm text-gray-500">{formatDate(report.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="md:hidden divide-y divide-gray-100">
                {recentReports.map(report => (
                  <div 
                    key={report.id} 
                    onClick={() => router.push(`/reports/${report.id}`)}
                    className="px-5 py-4 hover:bg-teal-50/50 cursor-pointer transition"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-gray-900">{report.student_name}</span>
                      <span className="text-xs text-gray-500">{formatDate(report.created_at)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span className="bg-gray-100 px-2 py-0.5 rounded">{report.branch_name}</span>
                      <span>{report.student_code}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="px-6 py-12 text-center text-gray-500">
              <span className="text-4xl mb-3 block">📝</span>
              <p>작성된 리포트가 없습니다</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
