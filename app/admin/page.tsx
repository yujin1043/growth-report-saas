'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import * as XLSX from 'xlsx'

interface BranchStat {
  id: string
  name: string
  activeStudents: number
  pausedStudents: number
  inactiveStudents: number
  monthlyReports: number
  reportRate: number
}

interface RecentChange {
  id: string
  name: string
  student_code: string
  status: string
  branch_name: string
  updated_at: string
}

interface LongPendingStudent {
  id: string
  name: string
  student_code: string
  branch_name: string
  last_report_date: string | null
  days_since_report: number
}

export default function AdminDashboardPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })

  const [branchStats, setBranchStats] = useState<BranchStat[]>([])
  const [totalReports, setTotalReports] = useState(0)
  const [totalActiveStudents, setTotalActiveStudents] = useState(0)
  const [recentChanges, setRecentChanges] = useState<RecentChange[]>([])
  const [longPendingStudents, setLongPendingStudents] = useState<LongPendingStudent[]>([])
  const [branchFilter, setBranchFilter] = useState('all')

  useEffect(() => {
    checkAuth()
  }, [])

  useEffect(() => {
    if (!loading) loadData()
  }, [selectedMonth])

  async function checkAuth() {
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

    if (profile?.role !== 'admin') {
      alert('본사 관리자만 접근할 수 있습니다.')
      router.push('/dashboard')
      return
    }

    await loadData()
    setLoading(false)
  }

  async function loadData() {
    const [year, month] = selectedMonth.split('-').map(Number)
    const startDate = new Date(year, month - 1, 1)
    const endDate = new Date(year, month, 0, 23, 59, 59)

    const { data: branches } = await supabase
      .from('branches')
      .select('id, name')
      .order('name')

    if (!branches) return

    const stats: BranchStat[] = []
    let totalActive = 0
    let totalMonthly = 0

    for (const branch of branches) {
      const { count: active } = await supabase
        .from('students')
        .select('*', { count: 'exact', head: true })
        .eq('branch_id', branch.id)
        .eq('status', 'active')

      const { count: paused } = await supabase
        .from('students')
        .select('*', { count: 'exact', head: true })
        .eq('branch_id', branch.id)
        .eq('status', 'paused')

      const { count: inactive } = await supabase
        .from('students')
        .select('*', { count: 'exact', head: true })
        .eq('branch_id', branch.id)
        .eq('status', 'inactive')

      const { count: reports } = await supabase
        .from('reports')
        .select('*', { count: 'exact', head: true })
        .eq('branch_id', branch.id)
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString())

      const activeCount = active || 0
      const reportCount = reports || 0
      const rate = activeCount > 0 ? Math.round((reportCount / activeCount) * 100) : 0

      stats.push({
        id: branch.id,
        name: branch.name,
        activeStudents: activeCount,
        pausedStudents: paused || 0,
        inactiveStudents: inactive || 0,
        monthlyReports: reportCount,
        reportRate: rate
      })

      totalActive += activeCount
      totalMonthly += reportCount
    }

    stats.sort((a, b) => b.reportRate - a.reportRate)

    setBranchStats(stats)
    setTotalActiveStudents(totalActive)
    setTotalReports(totalMonthly)

    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const { data: changes } = await supabase
      .from('students')
      .select('id, name, student_code, status, updated_at, branches(name)')
      .in('status', ['paused', 'inactive'])
      .gte('updated_at', thirtyDaysAgo.toISOString())
      .order('updated_at', { ascending: false })
      .limit(10)

    if (changes) {
      setRecentChanges(changes.map(c => ({
        ...c,
        branch_name: c.branches?.name || '-'
      })))
    }

    const { data: activeStudents } = await supabase
      .from('students')
      .select('id, name, student_code, branch_id, branches(name)')
      .eq('status', 'active')

    if (activeStudents) {
      const pending: LongPendingStudent[] = []

      for (const student of activeStudents) {
        const { data: lastReport } = await supabase
          .from('reports')
          .select('created_at')
          .eq('student_id', student.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        let daysSince = 999
        let lastDate: string | null = null

        if (lastReport) {
          lastDate = lastReport.created_at.split('T')[0]
          const diff = Date.now() - new Date(lastReport.created_at).getTime()
          daysSince = Math.floor(diff / (1000 * 60 * 60 * 24))
        }

        if (daysSince >= 60) {
          pending.push({
            id: student.id,
            name: student.name,
            student_code: student.student_code,
            branch_name: student.branches?.name || '-',
            last_report_date: lastDate,
            days_since_report: daysSince === 999 ? -1 : daysSince
          })
        }
      }

      pending.sort((a, b) => b.days_since_report - a.days_since_report)
      setLongPendingStudents(pending.slice(0, 20))
    }
  }

  function downloadExcel() {
    const data = branchStats.map(stat => ({
      '지점명': stat.name,
      '재원 학생': stat.activeStudents,
      '휴원 학생': stat.pausedStudents,
      '퇴원 학생': stat.inactiveStudents,
      '리포트 건수': stat.monthlyReports,
      '작성률(%)': stat.reportRate
    }))

    data.push({
      '지점명': '합계',
      '재원 학생': totalActiveStudents,
      '휴원 학생': branchStats.reduce((sum, s) => sum + s.pausedStudents, 0),
      '퇴원 학생': branchStats.reduce((sum, s) => sum + s.inactiveStudents, 0),
      '리포트 건수': totalReports,
      '작성률(%)': totalActiveStudents > 0 ? Math.round((totalReports / totalActiveStudents) * 100) : 0
    })

    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '지점별 현황')
    XLSX.writeFile(wb, `지점별_리포트_현황_${selectedMonth}.xlsx`)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ko-KR')
  }

  const monthOptions = []
  for (let i = 0; i < 12; i++) {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = `${d.getFullYear()}년 ${d.getMonth() + 1}월`
    monthOptions.push({ value, label })
  }

  const lowRateBranches = branchStats.filter(s => s.reportRate < 50 && s.activeStudents > 0)

  const filteredBranchStats = branchStats.filter(stat => {
    if (branchFilter === 'all') return true
    if (branchFilter === 'warning') return stat.reportRate < 50 && stat.activeStudents > 0
    if (branchFilter === 'normal') return stat.reportRate >= 50 || stat.activeStudents === 0
    return true
  })

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
        <div className="max-w-7xl mx-auto px-4 py-3 md:py-4">
          <div className="flex items-center justify-between">
            <button onClick={() => router.push('/dashboard')} className="text-gray-500 hover:text-gray-700 transition text-sm md:text-base">
              ← 대시보드
            </button>
            <h1 className="text-base md:text-lg font-bold text-gray-800">본사 관리</h1>
            <div className="w-20"></div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-4 md:py-6">
        {/* 월 선택 + 다운로드 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-5 mb-4 md:mb-6">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm">📅</span>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full sm:w-48 pl-10 pr-10 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm text-gray-700 appearance-none cursor-pointer hover:bg-gray-100 transition"
              >
                {monthOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">▼</span>
            </div>
            <button
              onClick={downloadExcel}
              className="px-5 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl font-medium hover:from-green-600 hover:to-emerald-600 transition shadow-sm text-sm"
            >
              📥 엑셀 다운로드
            </button>
          </div>
        </div>

        {/* 전체 통계 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-4 md:mb-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-5">
            <p className="text-gray-500 text-xs md:text-sm font-medium mb-2">전체 지점</p>
            <p className="text-3xl md:text-4xl font-bold text-gray-800">{branchStats.length}<span className="text-lg text-gray-400 ml-1">개</span></p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-5">
            <p className="text-gray-500 text-xs md:text-sm font-medium mb-2">재원 학생</p>
            <p className="text-3xl md:text-4xl font-bold text-gray-800">{totalActiveStudents}<span className="text-lg text-gray-400 ml-1">명</span></p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-5">
            <p className="text-gray-500 text-xs md:text-sm font-medium mb-2">월간 리포트</p>
            <p className="text-3xl md:text-4xl font-bold text-gray-800">{totalReports}<span className="text-lg text-gray-400 ml-1">건</span></p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-5">
            <p className="text-gray-500 text-xs md:text-sm font-medium mb-2">평균 작성률</p>
            <p className="text-3xl md:text-4xl font-bold text-gray-800">
              {totalActiveStudents > 0 ? Math.round((totalReports / totalActiveStudents) * 100) : 0}
              <span className="text-lg text-gray-400 ml-1">%</span>
            </p>
          </div>
        </div>

        {/* 저조 지점 경고 */}
        {lowRateBranches.length > 0 && (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 md:p-5 mb-4 md:mb-6">
            <h3 className="font-semibold text-rose-700 mb-3 text-sm md:text-base">⚠️ 작성률 저조 지점 ({lowRateBranches.length}개)</h3>
            <div className="flex flex-wrap gap-2">
              {lowRateBranches.map(branch => (
                <span key={branch.id} className="px-3 py-1.5 bg-white text-rose-600 rounded-full text-xs font-medium border border-rose-200">
                  {branch.name} ({branch.reportRate}%)
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 지점별 현황 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-4 md:mb-6">
          <div className="px-5 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h3 className="font-semibold text-gray-800">🏢 지점별 현황</h3>
            <div className="flex gap-2">
              {[
                { key: 'all', label: '전체' },
                { key: 'warning', label: '주의 필요' },
                { key: 'normal', label: '정상' }
              ].map((filter) => (
                <button
                  key={filter.key}
                  onClick={() => setBranchFilter(filter.key)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
                    branchFilter === filter.key
                      ? filter.key === 'warning' 
                        ? 'bg-rose-500 text-white'
                        : 'bg-teal-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {filter.label}
                  {filter.key === 'warning' && lowRateBranches.length > 0 && (
                    <span className="ml-1.5 px-1.5 py-0.5 bg-white/20 rounded-full text-xs">
                      {lowRateBranches.length}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
          
          {/* 데스크톱 테이블 */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full table-fixed">
              <thead className="border-b border-gray-200">
                <tr>
                  <th className="px-5 py-3 text-left text-sm font-semibold text-gray-900 bg-gray-50" style={{width: '8%'}}>순위</th>
                  <th className="px-5 py-3 text-left text-sm font-semibold text-gray-900 bg-gray-50" style={{width: '20%'}}>지점</th>
                  <th className="px-5 py-3 text-center text-sm font-semibold text-gray-900 bg-gray-50" style={{width: '14%'}}>재원</th>
                  <th className="px-5 py-3 text-center text-sm font-semibold text-gray-900 bg-gray-50" style={{width: '14%'}}>휴원</th>
                  <th className="px-5 py-3 text-center text-sm font-semibold text-gray-900 bg-gray-50" style={{width: '14%'}}>퇴원</th>
                  <th className="px-5 py-3 text-center text-sm font-semibold text-gray-900 bg-gray-50" style={{width: '14%'}}>리포트</th>
                  <th className="px-5 py-3 text-center text-sm font-semibold text-gray-900 bg-gray-50" style={{width: '16%'}}>작성률</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredBranchStats.map((stat, index) => (
                  <tr key={stat.id} className={`hover:bg-gray-50 transition ${stat.reportRate < 50 && stat.activeStudents > 0 ? 'bg-rose-50/50' : ''}`}>
                    <td className="px-5 py-4 text-sm text-center">
                      {index === 0 && stat.reportRate > 0 ? '🥇' : 
                       index === 1 && stat.reportRate > 0 ? '🥈' : 
                       index === 2 && stat.reportRate > 0 ? '🥉' : 
                       <span className="text-gray-400">{index + 1}</span>}
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-600">{stat.name}</td>
                    <td className="px-5 py-4 text-sm text-gray-600 text-center">{stat.activeStudents}</td>
                    <td className="px-5 py-4 text-sm text-amber-600 text-center">{stat.pausedStudents}</td>
                    <td className="px-5 py-4 text-sm text-gray-400 text-center">{stat.inactiveStudents}</td>
                    <td className="px-5 py-4 text-sm text-gray-600 text-center">{stat.monthlyReports}</td>
                    <td className="px-5 py-4 text-center">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        stat.reportRate >= 100 ? 'bg-teal-50 text-teal-600' :
                        stat.reportRate >= 50 ? 'bg-amber-50 text-amber-600' :
                        stat.activeStudents === 0 ? 'bg-gray-100 text-gray-500' :
                        'bg-rose-50 text-rose-600'
                      }`}>
                        {stat.reportRate}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {filteredBranchStats.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                <p className="text-3xl mb-2">✅</p>
                <p className="text-sm">해당 조건의 지점이 없습니다</p>
              </div>
            )}
          </div>

          {/* 모바일 카드 */}
          <div className="md:hidden divide-y divide-gray-100">
            {filteredBranchStats.map((stat, index) => (
              <div key={stat.id} className={`px-5 py-4 ${stat.reportRate < 50 && stat.activeStudents > 0 ? 'bg-rose-50/50' : ''}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">
                      {index === 0 && stat.reportRate > 0 ? '🥇' : 
                       index === 1 && stat.reportRate > 0 ? '🥈' : 
                       index === 2 && stat.reportRate > 0 ? '🥉' : 
                       <span className="text-gray-400">{index + 1}.</span>}
                    </span>
                    <span className="font-medium text-gray-800">{stat.name}</span>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    stat.reportRate >= 100 ? 'bg-teal-50 text-teal-600' :
                    stat.reportRate >= 50 ? 'bg-amber-50 text-amber-600' :
                    stat.activeStudents === 0 ? 'bg-gray-100 text-gray-500' :
                    'bg-rose-50 text-rose-600'
                  }`}>
                    {stat.reportRate}%
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2 text-xs text-center">
                  <div className="bg-gray-50 rounded-lg py-2">
                    <p className="text-gray-400 mb-0.5">재원</p>
                    <p className="font-medium text-gray-700">{stat.activeStudents}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg py-2">
                    <p className="text-gray-400 mb-0.5">휴원</p>
                    <p className="font-medium text-amber-600">{stat.pausedStudents}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg py-2">
                    <p className="text-gray-400 mb-0.5">퇴원</p>
                    <p className="font-medium text-gray-400">{stat.inactiveStudents}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg py-2">
                    <p className="text-gray-400 mb-0.5">리포트</p>
                    <p className="font-medium text-gray-700">{stat.monthlyReports}</p>
                  </div>
                </div>
              </div>
            ))}
            
            {filteredBranchStats.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                <p className="text-3xl mb-2">✅</p>
                <p className="text-sm">해당 조건의 지점이 없습니다</p>
              </div>
            )}
          </div>
        </div>

        {/* 최근 휴원/퇴원 & 장기 미작성 */}
        <div className="grid md:grid-cols-2 gap-4 md:gap-6">
          {/* 최근 휴원/퇴원 */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800">📉 최근 휴원/퇴원 (30일)</h3>
            </div>
            {recentChanges.length > 0 ? (
              <div className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
                {recentChanges.map(student => (
                  <div key={student.id} className="px-5 py-3 flex items-center justify-between hover:bg-gray-50 transition">
                    <div>
                      <p className="font-medium text-sm text-gray-800">{student.name}</p>
                      <p className="text-xs text-gray-500">{student.branch_name} · {student.student_code}</p>
                    </div>
                    <div className="text-right">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                        student.status === 'paused' ? 'bg-amber-50 text-amber-600' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {student.status === 'paused' ? '휴원' : '퇴원'}
                      </span>
                      <p className="text-xs text-gray-400 mt-1">{formatDate(student.updated_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-5 py-12 text-center text-gray-500">
                <p className="text-3xl mb-2">👍</p>
                <p className="text-sm">최근 휴원/퇴원 학생이 없습니다</p>
              </div>
            )}
          </div>

          {/* 장기 미작성 학생 */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800">⏰ 장기 미작성 학생 (60일+)</h3>
            </div>
            {longPendingStudents.length > 0 ? (
              <div className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
                {longPendingStudents.map(student => (
                  <div 
                    key={student.id} 
                    onClick={() => router.push(`/students/${student.id}`)}
                    className="px-5 py-3 flex items-center justify-between hover:bg-teal-50/50 cursor-pointer transition"
                  >
                    <div>
                      <p className="font-medium text-sm text-gray-800">{student.name}</p>
                      <p className="text-xs text-gray-500">{student.branch_name} · {student.student_code}</p>
                    </div>
                    <div className="text-right">
                      <span className="px-2.5 py-1 bg-rose-50 text-rose-600 rounded-full text-xs font-medium">
                        {student.days_since_report === -1 ? '작성 없음' : `${student.days_since_report}일`}
                      </span>
                      {student.last_report_date && (
                        <p className="text-xs text-gray-400 mt-1">마지막: {student.last_report_date}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-5 py-12 text-center text-gray-500">
                <p className="text-3xl mb-2">🎉</p>
                <p className="text-sm">장기 미작성 학생이 없습니다</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}