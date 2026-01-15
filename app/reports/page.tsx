'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Report {
  id: string
  period_start: string
  period_end: string
  created_at: string
  student_name: string
  student_code: string
  branch_name: string
  student_id: string
}

interface Branch {
  id: string
  name: string
}

export default function ReportsPage() {
  const router = useRouter()
  const [reports, setReports] = useState<Report[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedBranch, setSelectedBranch] = useState('all')
  const [selectedMonth, setSelectedMonth] = useState('all')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    // 모든 데이터를 병렬로 가져오기
    const [branchResult, reportsResult, studentsResult] = await Promise.all([
      supabase.from('branches').select('id, name').order('name'),
      supabase.from('reports').select('id, period_start, period_end, created_at, student_id, branch_id').order('created_at', { ascending: false }),
      supabase.from('students').select('id, name, student_code, branch_id')
    ])

    if (branchResult.data) setBranches(branchResult.data)

    // Map 생성으로 O(1) 조회
    const branchMap = new Map(branchResult.data?.map(b => [b.id, b.name]) || [])
    const studentMap = new Map(studentsResult.data?.map(s => [s.id, s]) || [])

    if (reportsResult.data) {
      // 모든 리포트를 한 번에 매핑 (N+1 쿼리 제거!)
      const reportsWithDetails: Report[] = reportsResult.data.map(report => {
        const student = studentMap.get(report.student_id)
        const branchName = student?.branch_id ? branchMap.get(student.branch_id) || '-' : '-'

        return {
          id: report.id,
          period_start: report.period_start,
          period_end: report.period_end,
          created_at: report.created_at,
          student_name: student?.name || '-',
          student_code: student?.student_code || '-',
          branch_name: branchName,
          student_id: report.student_id
        }
      })

      setReports(reportsWithDetails)
    }

    setLoading(false)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ko-KR')
  }

  const getMonth = (dateString: string) => {
    const date = new Date(dateString)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
  }

  const filteredReports = reports.filter(report => {
    const matchesSearch = 
      report.student_name.includes(searchTerm) ||
      report.student_code.includes(searchTerm) ||
      report.branch_name.includes(searchTerm)
    
    const matchesBranch = selectedBranch === 'all' || report.branch_name === selectedBranch
    const matchesMonth = selectedMonth === 'all' || getMonth(report.created_at) === selectedMonth

    return matchesSearch && matchesBranch && matchesMonth
  })

  const monthOptions = []
  for (let i = 0; i < 12; i++) {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = `${d.getFullYear()}년 ${d.getMonth() + 1}월`
    monthOptions.push({ value, label })
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
        <div className="max-w-7xl mx-auto px-4 py-3 md:py-4">
          <div className="flex items-center justify-between">
            <button onClick={() => router.push('/dashboard')} className="text-gray-500 hover:text-gray-700 transition text-sm md:text-base">
              ← 대시보드
            </button>
            <h1 className="text-base md:text-lg font-bold text-gray-800">리포트 검색</h1>
            <div className="w-20"></div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-4 md:py-6">
        {/* 검색 및 필터 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-5 mb-4 md:mb-6">
          <div className="flex flex-col gap-4">
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
              <input
                type="text"
                placeholder="학생 이름, 학생ID, 지점명으로 검색"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-gray-50 border-0 rounded-xl focus:ring-2 focus:ring-teal-500 focus:bg-white transition text-sm md:text-base"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🏢</span>
                <select
                  value={selectedBranch}
                  onChange={(e) => setSelectedBranch(e.target.value)}
                  className="w-full pl-10 pr-10 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm text-gray-700 appearance-none cursor-pointer hover:bg-gray-100 transition"
                >
                  <option value="all">전체 지점</option>
                  {branches.map(branch => (
                    <option key={branch.id} value={branch.name}>{branch.name}</option>
                  ))}
                </select>
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">▼</span>
              </div>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm">📅</span>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="w-full pl-10 pr-10 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm text-gray-700 appearance-none cursor-pointer hover:bg-gray-100 transition"
                >
                  <option value="all">전체 기간</option>
                  {monthOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">▼</span>
              </div>
            </div>
          </div>
        </div>
        {/* 리포트 수 표시 */}
        <div className="mb-4">
          <p className="text-sm text-gray-500">
            검색 결과: <span className="font-bold text-teal-600">{filteredReports.length}</span>건
          </p>
        </div>

        {/* 데스크톱 테이블 */}
        <div className="hidden md:block bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full table-fixed">
            <thead className="border-b border-gray-200">
              <tr>
                <th className="px-5 py-3 text-left text-sm font-semibold text-gray-900 bg-gray-50" style={{width: '14%'}}>지점</th>
                <th className="px-5 py-3 text-left text-sm font-semibold text-gray-900 bg-gray-50" style={{width: '14%'}}>학생ID</th>
                <th className="px-5 py-3 text-left text-sm font-semibold text-gray-900 bg-gray-50" style={{width: '14%'}}>이름</th>
                <th className="px-5 py-3 text-left text-sm font-semibold text-gray-900 bg-gray-50" style={{width: '22%'}}>지도기간</th>
                <th className="px-5 py-3 text-left text-sm font-semibold text-gray-900 bg-gray-50" style={{width: '14%'}}>생성일</th>
                <th className="px-5 py-3 text-center text-sm font-semibold text-gray-900 bg-gray-50" style={{width: '22%'}}>관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredReports.map(report => (
                <tr key={report.id} className="hover:bg-teal-50/50 transition">
                  <td className="px-5 py-4 text-sm text-gray-600">{report.branch_name}</td>
                  <td className="px-5 py-4 text-sm text-gray-600">{report.student_code}</td>
                  <td className="px-5 py-4 text-sm text-gray-600">{report.student_name}</td>
                  <td className="px-5 py-4 text-sm text-gray-600">{report.period_start} ~ {report.period_end}</td>
                  <td className="px-5 py-4 text-sm text-gray-600">{formatDate(report.created_at)}</td>
                  <td className="px-5 py-4 text-center">
                    <div className="flex justify-center gap-2">
                      <button
                        onClick={() => router.push(`/reports/${report.id}`)}
                        className="px-3 py-1.5 bg-teal-50 text-teal-600 rounded-lg text-xs font-medium hover:bg-teal-100 transition"
                      >
                        보기
                      </button>
                      <button
                        onClick={() => router.push(`/students/${report.student_id}`)}
                        className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-200 transition"
                      >
                        학생정보
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredReports.length === 0 && (
            <div className="text-center py-16 text-gray-500">
              <p className="text-4xl mb-3">🔍</p>
              <p>검색 결과가 없습니다</p>
            </div>
          )}
        </div>

        {/* 모바일 카드 리스트 */}
        <div className="md:hidden space-y-3">
          {filteredReports.map(report => (
            <div
              key={report.id}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-medium text-gray-900">{report.student_name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{report.student_code}</p>
                </div>
                <span className="text-xs text-gray-400">{formatDate(report.created_at)}</span>
              </div>
              <div className="text-xs text-gray-500 mb-3 space-y-1">
                <p className="flex items-center gap-2">
                  <span className="text-gray-400">🏢</span>
                  {report.branch_name}
                </p>
                <p className="flex items-center gap-2">
                  <span className="text-gray-400">📅</span>
                  {report.period_start} ~ {report.period_end}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => router.push(`/reports/${report.id}`)}
                  className="flex-1 py-2 bg-teal-50 text-teal-600 rounded-xl text-xs font-medium hover:bg-teal-100 transition"
                >
                  보기
                </button>
                <button
                  onClick={() => router.push(`/students/${report.student_id}`)}
                  className="flex-1 py-2 bg-gray-100 text-gray-600 rounded-xl text-xs font-medium hover:bg-gray-200 transition"
                >
                  학생정보
                </button>
              </div>
            </div>
          ))}

          {filteredReports.length === 0 && (
            <div className="text-center py-16 text-gray-500">
              <p className="text-4xl mb-3">🔍</p>
              <p>검색 결과가 없습니다</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
