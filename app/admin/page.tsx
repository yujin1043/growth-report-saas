'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface BranchStats {
  id: string
  name: string
  active_count: number
  teacher_count: number
  monthly_reports: number
  need_report_count: number
  completion_rate: number
}

interface MonthlyStats {
  month: string
  count: number
}

export default function AdminPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  
  const [totalBranches, setTotalBranches] = useState(0)
  const [totalActiveStudents, setTotalActiveStudents] = useState(0)
  const [totalMonthlyReports, setTotalMonthlyReports] = useState(0)
  const [totalNeedReport, setTotalNeedReport] = useState(0)
  
  const [branchStats, setBranchStats] = useState<BranchStats[]>([])
  const [monthlyStats, setMonthlyStats] = useState<MonthlyStats[]>([])
  const [sortBy, setSortBy] = useState<'name' | 'completion'>('completion')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      router.push('/login')
      return
    }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'admin') {
      router.push('/dashboard')
      return
    }

    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, now.getDate())

    // 모든 기본 데이터를 병렬로 가져오기 (성능 최적화)
    const [branchesResult, studentsResult, usersResult, reportsResult] = await Promise.all([
      supabase.from('branches').select('id, name').order('name'),
      supabase.from('students').select('id, branch_id, status, last_report_at'),
      supabase.from('user_profiles').select('id, branch_id, role'),
      supabase.from('reports').select('id, branch_id, created_at')
    ])

    const branches = branchesResult.data || []
    const students = studentsResult.data || []
    const users = usersResult.data || []
    const reports = reportsResult.data || []

    setTotalBranches(branches.length)

    // 메모리에서 통계 계산 (DB 호출 없음!)
    const stats: BranchStats[] = branches.map(branch => {
      const branchStudents = students.filter(s => s.branch_id === branch.id)
      const activeStudents = branchStudents.filter(s => s.status === 'active')
      const teacherCount = users.filter(u => u.branch_id === branch.id && ['teacher', 'manager'].includes(u.role)).length
      const monthlyReportCount = reports.filter(r => r.branch_id === branch.id && new Date(r.created_at) >= startOfMonth).length
      const needReportCount = activeStudents.filter(s => 
        !s.last_report_at || new Date(s.last_report_at) < twoMonthsAgo
      ).length

      const active = activeStudents.length
      const completionRate = active > 0 ? Math.round(((active - needReportCount) / active) * 100) : 100

      return {
        id: branch.id,
        name: branch.name,
        active_count: active,
        teacher_count: teacherCount,
        monthly_reports: monthlyReportCount,
        need_report_count: needReportCount,
        completion_rate: completionRate
      }
    })

    setBranchStats(stats)
    setTotalActiveStudents(stats.reduce((sum, b) => sum + b.active_count, 0))
    setTotalMonthlyReports(stats.reduce((sum, b) => sum + b.monthly_reports, 0))
    setTotalNeedReport(stats.reduce((sum, b) => sum + b.need_report_count, 0))

    // 월별 통계도 메모리에서 계산 (DB 호출 없음!)
    const monthlyData: MonthlyStats[] = []
    for (let i = 5; i >= 0; i--) {
      const targetDate = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const nextMonth = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
      
      const count = reports.filter(r => {
        const createdAt = new Date(r.created_at)
        return createdAt >= targetDate && createdAt < nextMonth
      }).length

      monthlyData.push({
        month: `${targetDate.getMonth() + 1}월`,
        count
      })
    }
    setMonthlyStats(monthlyData)

    setLoading(false)
  }

  const sortedBranchStats = [...branchStats].sort((a, b) => {
    if (sortBy === 'completion') {
      return a.completion_rate - b.completion_rate
    }
    return a.name.localeCompare(b.name)
  })

  const urgentBranches = branchStats
    .filter(b => b.need_report_count > 0)
    .sort((a, b) => b.need_report_count - a.need_report_count)
    .slice(0, 3)

  const getMaxCount = () => Math.max(...monthlyStats.map(m => m.count), 1)

  const prevMonthDiff = monthlyStats.length >= 2 
    ? monthlyStats[monthlyStats.length - 1].count - monthlyStats[monthlyStats.length - 2].count
    : 0

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-800 mx-auto mb-4"></div>
          <p className="text-gray-500">통계 로딩 중...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <button onClick={() => router.push('/dashboard')} className="text-gray-500 hover:text-gray-700 transition">
              ← 대시보드
            </button>
            <h1 className="text-lg font-bold text-gray-900">본사 관리</h1>
            <div className="w-16"></div>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6">
        
        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-gray-500 text-sm mb-1">전체 지점</p>
            <p className="text-3xl font-bold text-gray-900">{totalBranches}<span className="text-base font-normal text-gray-400 ml-1">개</span></p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-gray-500 text-sm mb-1">재원 학생</p>
            <p className="text-3xl font-bold text-gray-900">{totalActiveStudents}<span className="text-base font-normal text-gray-400 ml-1">명</span></p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-gray-500 text-sm mb-1">이번 달 리포트</p>
            <p className="text-3xl font-bold text-gray-900">{totalMonthlyReports}<span className="text-base font-normal text-gray-400 ml-1">건</span></p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-gray-500 text-sm mb-1">리포트 필요</p>
            <p className={`text-3xl font-bold ${totalNeedReport > 0 ? 'text-red-600' : 'text-gray-900'}`}>
              {totalNeedReport}<span className="text-base font-normal text-gray-400 ml-1">명</span>
            </p>
          </div>
        </div>

        {urgentBranches.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-5 mb-8">
            <h2 className="font-bold text-red-800 mb-3 flex items-center gap-2">
              <span>⚠️</span> 긴급 관리 필요 지점
            </h2>
            <div className="grid grid-cols-3 gap-4">
              {urgentBranches.map((branch, index) => (
                <div 
                  key={branch.id}
                  onClick={() => router.push(`/students?branch=${branch.id}`)}
                  className="bg-white rounded-lg p-4 cursor-pointer hover:shadow-md transition border border-red-100"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-gray-900">{branch.name}</span>
                    <span className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded-full font-medium">
                      {index + 1}위
                    </span>
                  </div>
                  <p className="text-2xl font-bold text-red-600">{branch.need_report_count}명</p>
                  <p className="text-xs text-gray-500">리포트 미작성</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 mb-8">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-bold text-gray-900">지점별 현황</h2>
            <div className="flex gap-2">
              <button
                onClick={() => setSortBy('completion')}
                className={`px-3 py-1.5 rounded-lg text-sm transition ${
                  sortBy === 'completion' 
                    ? 'bg-gray-900 text-white' 
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                작성률 순
              </button>
              <button
                onClick={() => setSortBy('name')}
                className={`px-3 py-1.5 rounded-lg text-sm transition ${
                  sortBy === 'name' 
                    ? 'bg-gray-900 text-white' 
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                이름 순
              </button>
            </div>
          </div>

          <div className="hidden md:block">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-5 py-3 text-left text-sm font-semibold text-gray-700">지점</th>
                  <th className="px-5 py-3 text-center text-sm font-semibold text-gray-700">재원</th>
                  <th className="px-5 py-3 text-center text-sm font-semibold text-gray-700">강사</th>
                  <th className="px-5 py-3 text-center text-sm font-semibold text-gray-700">이번 달</th>
                  <th className="px-5 py-3 text-center text-sm font-semibold text-gray-700">미작성</th>
                  <th className="px-5 py-3 text-center text-sm font-semibold text-gray-700">작성률</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedBranchStats.map(branch => (
                  <tr 
                    key={branch.id} 
                    onClick={() => router.push(`/students?branch=${branch.id}`)}
                    className="hover:bg-gray-50 cursor-pointer transition"
                  >
                    <td className="px-5 py-4 text-sm font-medium text-gray-900">{branch.name}</td>
                    <td className="px-5 py-4 text-sm text-center text-gray-600">{branch.active_count}명</td>
                    <td className="px-5 py-4 text-sm text-center text-gray-600">{branch.teacher_count}명</td>
                    <td className="px-5 py-4 text-sm text-center text-gray-600">{branch.monthly_reports}건</td>
                    <td className="px-5 py-4 text-center">
                      {branch.need_report_count > 0 ? (
                        <span className="text-sm font-medium text-red-600">{branch.need_report_count}명</span>
                      ) : (
                        <span className="text-sm text-green-600">-</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-center gap-3">
                        <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full ${
                              branch.completion_rate >= 80 ? 'bg-green-500' :
                              branch.completion_rate >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${branch.completion_rate}%` }}
                          />
                        </div>
                        <span className={`text-sm font-medium w-12 ${
                          branch.completion_rate >= 80 ? 'text-green-600' :
                          branch.completion_rate >= 50 ? 'text-yellow-600' : 'text-red-600'
                        }`}>
                          {branch.completion_rate}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden divide-y divide-gray-100">
            {sortedBranchStats.map(branch => (
              <div 
                key={branch.id}
                onClick={() => router.push(`/students?branch=${branch.id}`)}
                className="p-4 hover:bg-gray-50 cursor-pointer transition"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="font-medium text-gray-900">{branch.name}</span>
                  <span className={`text-sm font-medium ${
                    branch.completion_rate >= 80 ? 'text-green-600' :
                    branch.completion_rate >= 50 ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {branch.completion_rate}%
                  </span>
                </div>
                <div className="flex gap-4 text-xs text-gray-500 mb-2">
                  <span>재원 {branch.active_count}명</span>
                  <span>강사 {branch.teacher_count}명</span>
                  <span>리포트 {branch.monthly_reports}건</span>
                  {branch.need_report_count > 0 && (
                    <span className="text-red-600">미작성 {branch.need_report_count}명</span>
                  )}
                </div>
                <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full ${
                      branch.completion_rate >= 80 ? 'bg-green-500' :
                      branch.completion_rate >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${branch.completion_rate}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-bold text-gray-900">월별 리포트 추이</h2>
            <div className="flex items-center gap-4 text-sm">
              <div className="text-gray-500">
                6개월 총 <span className="font-bold text-gray-900">{monthlyStats.reduce((sum, m) => sum + m.count, 0)}건</span>
              </div>
              <div className="text-gray-500">
                전월 대비 <span className={`font-bold ${prevMonthDiff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {prevMonthDiff >= 0 ? '+' : ''}{prevMonthDiff}건
                </span>
              </div>
            </div>
          </div>
          
          <div className="flex items-end justify-between gap-3 h-40">
            {monthlyStats.map((stat, index) => (
              <div key={index} className="flex-1 flex flex-col items-center">
                <span className="text-sm font-medium text-gray-700 mb-2">{stat.count}</span>
                <div 
                  className="w-full bg-gray-800 rounded-t transition-all duration-500"
                  style={{ 
                    height: `${Math.max((stat.count / getMaxCount()) * 100, 4)}%`
                  }}
                />
                <span className="text-xs text-gray-500 mt-2">{stat.month}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}