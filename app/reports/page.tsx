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
  branch_id: string
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
  
  const [userRole, setUserRole] = useState<string | null>(null)
  const [userBranchId, setUserBranchId] = useState<string | null>(null)

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
      .select('role, branch_id')
      .eq('id', user.id)
      .single()

    const role = profile?.role || 'teacher'
    const branchId = profile?.branch_id || null
    
    setUserRole(role)
    setUserBranchId(branchId)

    let branchQuery = supabase.from('branches').select('id, name').order('name')
    
    if (role !== 'admin' && branchId) {
      branchQuery = branchQuery.eq('id', branchId)
    }
    
    const { data: branchData } = await branchQuery
    if (branchData) setBranches(branchData)

    let reportsQuery = supabase
      .from('reports')
      .select('id, period_start, period_end, created_at, student_id, branch_id')
      .order('created_at', { ascending: false })

    if (role !== 'admin' && branchId) {
      reportsQuery = reportsQuery.eq('branch_id', branchId)
    }

    const [reportsResult, studentsResult] = await Promise.all([
      reportsQuery,
      supabase.from('students').select('id, name, student_code, branch_id')
    ])

    const branchMap = new Map(branchData?.map(b => [b.id, b.name]) || [])
    const studentMap = new Map(studentsResult.data?.map(s => [s.id, s]) || [])

    if (reportsResult.data) {
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
          student_id: report.student_id,
          branch_id: report.branch_id
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
    <div className="min-h-screen bg-gray-50">
      <div className="hidden md:block bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-gray-800">📝 리포트</h1>
            <button
              onClick={() => router.push('/reports/select')}
              className="px-4 py-2 bg-teal-500 text-white rounded-xl font-medium hover:bg-teal-600 transition flex items-center gap-2"
            >
              ✏️ 리포트 생성
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        <button
          onClick={() => router.push('/reports/select')}
          className="md:hidden w-full mb-4 px-4 py-3 bg-gradient-to-r from-teal-500 to-cyan-500 text-white rounded-2xl font-medium hover:shadow-md transition flex items-center justify-center gap-2"
        >
          ✏️ 새 리포트 생성
        </button>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <input
                type="text"
                placeholder="이름, 학생ID, 지점명으로 검색"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
            </div>
            
            {userRole === 'admin' && (
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              >
                <option value="all">전체 지점</option>
                {branches.map(branch => (
                  <option key={branch.id} value={branch.name}>{branch.name}</option>
                ))}
              </select>
            )}
            
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            >
              <option value="all">전체 기간</option>
              {monthOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mb-4">
          <p className="text-sm text-gray-500">
            총 <span className="font-bold text-teal-600">{filteredReports.length}</span>건
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-gray-200">
                <tr>
                  {userRole === 'admin' && (
                    <th className="px-5 py-3 text-left text-sm font-semibold text-gray-900 bg-gray-50">지점</th>
                  )}
                  <th className="px-5 py-3 text-left text-sm font-semibold text-gray-900 bg-gray-50">학생ID</th>
                  <th className="px-5 py-3 text-left text-sm font-semibold text-gray-900 bg-gray-50">이름</th>
                  <th className="px-5 py-3 text-left text-sm font-semibold text-gray-900 bg-gray-50">지도기간</th>
                  <th className="px-5 py-3 text-left text-sm font-semibold text-gray-900 bg-gray-50">작성일</th>
                  <th className="px-5 py-3 text-center text-sm font-semibold text-gray-900 bg-gray-50">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredReports.map(report => (
                  <tr 
                    key={report.id} 
                    onClick={() => router.push(`/reports/${report.id}`)}
                    className="hover:bg-teal-50/50 cursor-pointer transition"
                  >
                    {userRole === 'admin' && (
                      <td className="px-5 py-4 text-sm text-gray-600">{report.branch_name}</td>
                    )}
                    <td className="px-5 py-4 text-sm text-gray-600">{report.student_code}</td>
                    <td className="px-5 py-4 text-sm font-medium text-gray-800">{report.student_name}</td>
                    <td className="px-5 py-4 text-sm text-gray-600">
                      {report.period_start} ~ {report.period_end}
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-600">{formatDate(report.created_at)}</td>
                    <td className="px-5 py-4 text-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          router.push(`/reports/${report.id}`)
                        }}
                        className="px-3 py-1.5 bg-teal-50 text-teal-600 rounded-lg text-xs font-medium hover:bg-teal-100 transition"
                      >
                        보기
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden divide-y divide-gray-100">
            {filteredReports.map(report => (
              <div 
                key={report.id} 
                onClick={() => router.push(`/reports/${report.id}`)}
                className="p-4 hover:bg-gray-50 cursor-pointer"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-gray-800">{report.student_name}</span>
                  <span className="text-xs text-gray-400">{formatDate(report.created_at)}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <span>{report.student_code}</span>
                  <span>·</span>
                  <span>{report.branch_name}</span>
                </div>
                <div className="mt-1 text-xs text-teal-600">
                  {report.period_start} ~ {report.period_end}
                </div>
              </div>
            ))}
          </div>

          {filteredReports.length === 0 && (
            <div className="text-center py-16 text-gray-500">
              <p className="text-4xl mb-4">📝</p>
              <p>리포트가 없습니다</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
