'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Student {
  id: string
  student_code: string
  name: string
  birth_year: number
  class_id: string | null
  branch_id: string | null
  class_name: string | null
  last_report_date: string | null
  days_since_report: number | null
}

interface UserProfile {
  name: string
  role: string
  branch_id: string | null
  branch_name: string | null
}

export default function ReportSelectPage() {
  const router = useRouter()
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [user, setUser] = useState<UserProfile | null>(null)
  const [filterUrgent, setFilterUrgent] = useState(false)

  const currentYear = new Date().getFullYear()

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    
    if (!authUser) {
      router.push('/login')
      return
    }

    const [profileResult, studentsResult, classesResult, branchesResult, reportsResult] = await Promise.all([
      supabase.from('user_profiles').select('name, role, branch_id').eq('id', authUser.id).single(),
      supabase.from('students').select('id, student_code, name, birth_year, class_id, branch_id').eq('status', 'active').order('name'),
      supabase.from('classes').select('id, name, branch_id'),
      supabase.from('branches').select('id, name'),
      supabase.from('reports').select('student_id, created_at').order('created_at', { ascending: false })
    ])

    if (profileResult.data) {
      const branchName = branchesResult.data?.find(b => b.id === profileResult.data.branch_id)?.name || null
      setUser({
        name: profileResult.data.name,
        role: profileResult.data.role,
        branch_id: profileResult.data.branch_id,
        branch_name: branchName
      })
    }

    const classMap = new Map(classesResult.data?.map(c => [c.id, c.name]) || [])
    const now = new Date()

    // 학생별 최신 리포트 날짜 맵 생성
    const lastReportMap = new Map<string, string>()
    if (reportsResult.data) {
      reportsResult.data.forEach(report => {
        // 첫 번째로 나오는 게 가장 최신 (order by desc)
        if (!lastReportMap.has(report.student_id)) {
          lastReportMap.set(report.student_id, report.created_at)
        }
      })
    }

    if (studentsResult.data) {
      let filteredStudents = studentsResult.data

      // 지점 계정이면 해당 지점 학생만
      if (profileResult.data?.role !== 'admin' && profileResult.data?.branch_id) {
        filteredStudents = filteredStudents.filter(s => s.branch_id === profileResult.data.branch_id)
      }

      const studentsWithDetails: Student[] = filteredStudents.map(student => {
        const lastReportDate = lastReportMap.get(student.id) || null
        const daysSince = lastReportDate
          ? Math.floor((now.getTime() - new Date(lastReportDate).getTime()) / (1000 * 60 * 60 * 24))
          : null

        return {
          ...student,
          class_name: student.class_id ? classMap.get(student.class_id) || null : null,
          last_report_date: lastReportDate,
          days_since_report: daysSince
        }
      })

      // 리포트 필요한 학생 먼저 정렬 (오래된 순)
      studentsWithDetails.sort((a, b) => {
        if (a.days_since_report === null && b.days_since_report === null) return 0
        if (a.days_since_report === null) return -1
        if (b.days_since_report === null) return 1
        return b.days_since_report - a.days_since_report
      })

      setStudents(studentsWithDetails)
    }

    setLoading(false)
  }

  const getAge = (birthYear: number) => currentYear - birthYear + 1

  const getReportStatus = (daysSince: number | null) => {
    if (daysSince === null) {
      return { text: '리포트 없음', color: 'text-red-500', bg: 'bg-red-50', urgent: true }
    }
    if (daysSince >= 60) {
      return { text: `${Math.floor(daysSince / 30)}개월 경과`, color: 'text-red-500', bg: 'bg-red-50', urgent: true }
    }
    if (daysSince >= 30) {
      return { text: `${Math.floor(daysSince / 30)}개월 전`, color: 'text-yellow-600', bg: 'bg-yellow-50', urgent: false }
    }
    if (daysSince === 0) {
      return { text: '오늘', color: 'text-green-600', bg: 'bg-green-50', urgent: false }
    }
    if (daysSince <= 7) {
      return { text: `${daysSince}일 전`, color: 'text-green-600', bg: 'bg-green-50', urgent: false }
    }
    return { text: `${daysSince}일 전`, color: 'text-slate-500', bg: 'bg-slate-50', urgent: false }
  }

  const filteredStudents = students.filter(student => {
    const matchesSearch = 
      student.name.includes(searchTerm) ||
      student.student_code?.includes(searchTerm) ||
      student.class_name?.includes(searchTerm)
    
    const matchesUrgent = !filterUrgent || getReportStatus(student.days_since_report).urgent

    return matchesSearch && matchesUrgent
  })

  const urgentCount = students.filter(s => getReportStatus(s.days_since_report).urgent).length

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

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-8 max-w-5xl mx-auto">
        {/* Header */}
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800 mb-1">📝 리포트 작성</h1>
          <p className="text-slate-500">학생을 선택하여 리포트를 작성하세요</p>
        </header>

        {/* Search & Filter */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
              <input
                type="text"
                placeholder="이름, 학생ID, 반으로 검색"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-slate-50 border-0 rounded-xl focus:ring-2 focus:ring-teal-500 focus:bg-white transition"
              />
            </div>
            <button
              onClick={() => setFilterUrgent(!filterUrgent)}
              className={`px-5 py-3 rounded-xl font-medium transition whitespace-nowrap ${
                filterUrgent
                  ? 'bg-red-500 text-white'
                  : 'bg-red-50 text-red-600 hover:bg-red-100'
              }`}
            >
              ⚠️ 리포트 필요 ({urgentCount})
            </button>
          </div>
        </div>

        {/* Count */}
        <div className="mb-4">
          <p className="text-sm text-slate-500">
            총 <span className="font-bold text-teal-600">{filteredStudents.length}</span>명
            {filterUrgent && <span className="ml-2 text-red-500">(리포트 필요)</span>}
          </p>
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead className="border-b border-slate-200">
              <tr>
                <th className="px-5 py-4 text-left text-sm font-semibold text-slate-700 bg-slate-50">학생명</th>
                <th className="px-5 py-4 text-left text-sm font-semibold text-slate-700 bg-slate-50">학생ID</th>
                <th className="px-5 py-4 text-left text-sm font-semibold text-slate-700 bg-slate-50">나이</th>
                <th className="px-5 py-4 text-left text-sm font-semibold text-slate-700 bg-slate-50">반</th>
                <th className="px-5 py-4 text-left text-sm font-semibold text-slate-700 bg-slate-50">마지막 리포트</th>
                <th className="px-5 py-4 text-center text-sm font-semibold text-slate-700 bg-slate-50">액션</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStudents.map((student) => {
                const reportStatus = getReportStatus(student.days_since_report)
                return (
                  <tr key={student.id} className="hover:bg-slate-50 transition">
                    <td className="px-5 py-4 text-sm font-medium text-slate-800">{student.name}</td>
                    <td className="px-5 py-4 text-sm text-slate-600">{student.student_code || '-'}</td>
                    <td className="px-5 py-4 text-sm text-slate-600">{getAge(student.birth_year)}세</td>
                    <td className="px-5 py-4 text-sm text-slate-600">{student.class_name || '-'}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium ${reportStatus.bg} ${reportStatus.color}`}>
                        {reportStatus.urgent && <span className="mr-1">🔴</span>}
                        {reportStatus.text}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <button
                        onClick={() => router.push(`/reports/new?studentId=${student.id}`)}
                        className="px-4 py-2 bg-gradient-to-r from-teal-500 to-cyan-500 text-white rounded-lg text-sm font-medium hover:shadow-md transition"
                      >
                        작성하기
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {filteredStudents.length === 0 && (
            <div className="text-center py-16 text-slate-500">
              <p className="text-4xl mb-3">📝</p>
              <p>검색 결과가 없습니다</p>
            </div>
          )}
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden space-y-3">
          {filteredStudents.map((student) => {
            const reportStatus = getReportStatus(student.days_since_report)
            return (
              <div
                key={student.id}
                className="bg-white rounded-2xl border border-slate-200 p-4"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-medium text-slate-800">{student.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{student.student_code}</p>
                  </div>
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium ${reportStatus.bg} ${reportStatus.color}`}>
                    {reportStatus.urgent && <span className="mr-1">🔴</span>}
                    {reportStatus.text}
                  </span>
                </div>
                <div className="text-xs text-slate-500 mb-3 space-y-1">
                  <p>{getAge(student.birth_year)}세 / {student.class_name || '-'}</p>
                </div>
                <button
                  onClick={() => router.push(`/reports/new?studentId=${student.id}`)}
                  className="w-full py-2.5 bg-gradient-to-r from-teal-500 to-cyan-500 text-white rounded-xl text-sm font-medium hover:shadow-md transition"
                >
                  작성하기
                </button>
              </div>
            )
          })}

          {filteredStudents.length === 0 && (
            <div className="text-center py-16 text-slate-500">
              <p className="text-4xl mb-3">📝</p>
              <p>검색 결과가 없습니다</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
