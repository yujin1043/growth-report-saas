'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Student {
  id: string
  student_code: string
  name: string
  birth_year: number
  status: string
  parent_name: string | null
  parent_phone: string | null
  enrolled_at: string
  classes: {
    name: string
  }
  branches: {
    name: string
  }
}

interface Report {
  id: string
  period_start: string
  period_end: string
  created_at: string
}

export default function StudentDetailPage() {
  const router = useRouter()
  const params = useParams()
  const studentId = params.id as string

  const [student, setStudent] = useState<Student | null>(null)
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)

  const currentYear = new Date().getFullYear()

  useEffect(() => {
    if (studentId) loadStudentData()
  }, [studentId])

  async function loadStudentData() {
    const { data: studentData } = await supabase
      .from('students')
      .select('id, student_code, name, birth_year, status, parent_name, parent_phone, enrolled_at, classes(name), branches(name)')
      .eq('id', studentId)
      .single()

    if (studentData) setStudent(studentData)

    const { data: reportsData } = await supabase
      .from('reports')
      .select('id, period_start, period_end, created_at')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })

    if (reportsData) setReports(reportsData)

    setLoading(false)
  }

  const getAge = (birthYear: number) => currentYear - birthYear + 1

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <span className="px-3 py-1 bg-teal-50 text-teal-600 rounded-full text-sm font-medium">재원</span>
      case 'paused':
        return <span className="px-3 py-1 bg-amber-50 text-amber-600 rounded-full text-sm font-medium">휴원</span>
      case 'inactive':
        return <span className="px-3 py-1 bg-gray-100 text-gray-500 rounded-full text-sm font-medium">퇴원</span>
      default:
        return null
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ko-KR')
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

  if (!student) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-4xl mb-3">😢</p>
          <p className="text-gray-500">학생을 찾을 수 없습니다</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <header className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-40 border-b border-gray-200/50">
        <div className="max-w-4xl mx-auto px-4 py-3 md:py-4">
          <div className="flex items-center justify-between">
            <button onClick={() => router.push('/students')} className="text-gray-500 hover:text-gray-700 transition text-sm md:text-base">
              ← 목록
            </button>
            <h1 className="text-base md:text-lg font-bold text-gray-800">학생 정보</h1>
            <button 
              onClick={() => router.push(`/students/${studentId}/edit`)}
              className="text-teal-600 hover:text-teal-700 font-medium text-sm md:text-base"
            >
              수정
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-4 md:py-6">
        {/* 프로필 카드 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 md:p-6 mb-4 md:mb-6">
          <div className="flex items-start gap-4 mb-5">
            <div className="w-14 h-14 md:w-16 md:h-16 bg-gradient-to-br from-teal-400 to-cyan-500 rounded-2xl flex items-center justify-center text-white text-xl md:text-2xl font-bold shadow-lg shadow-teal-500/30">
              {student.name.charAt(0)}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-xl md:text-2xl font-bold text-gray-800">{student.name}</h2>
                {getStatusBadge(student.status)}
              </div>
              <p className="text-sm text-gray-500">{student.student_code}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-400 mb-1">나이</p>
              <p className="font-semibold text-gray-800">{getAge(student.birth_year)}세</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-400 mb-1">지점</p>
              <p className="font-semibold text-gray-800">{student.branches?.name || '-'}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-400 mb-1">반</p>
              <p className="font-semibold text-gray-800">{student.classes?.name || '-'}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-400 mb-1">등록일</p>
              <p className="font-semibold text-gray-800">{student.enrolled_at || '-'}</p>
            </div>
          </div>

          {(student.parent_name || student.parent_phone) && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs text-gray-400 mb-2">학부모 정보</p>
              <div className="flex items-center gap-4">
                <p className="text-sm text-gray-700">
                  <span className="text-gray-400 mr-2">👤</span>
                  {student.parent_name || '-'}
                </p>
                <p className="text-sm text-gray-700">
                  <span className="text-gray-400 mr-2">📞</span>
                  {student.parent_phone || '-'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* 새 리포트 작성 버튼 */}
        <button
          onClick={() => router.push(`/reports/new?studentId=${student.id}`)}
          className="w-full bg-gradient-to-r from-teal-500 to-cyan-500 text-white py-4 rounded-2xl font-medium hover:from-teal-600 hover:to-cyan-600 transition shadow-lg shadow-teal-500/30 mb-4 md:mb-6 text-sm md:text-base"
        >
          📝 새 리포트 작성
        </button>

        {/* 리포트 히스토리 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-800">📋 리포트 히스토리 ({reports.length}건)</h3>
          </div>

          {reports.length > 0 ? (
            <>
              {/* 데스크톱 테이블 */}
              <div className="hidden md:block">
                <table className="w-full table-fixed">
                  <thead className="border-b border-gray-200">
                    <tr>
                      <th className="px-5 py-3 text-left text-sm font-semibold text-gray-900 bg-gray-50" style={{width: '40%'}}>지도기간</th>
                      <th className="px-5 py-3 text-left text-sm font-semibold text-gray-900 bg-gray-50" style={{width: '30%'}}>작성일</th>
                      <th className="px-5 py-3 text-center text-sm font-semibold text-gray-900 bg-gray-50" style={{width: '30%'}}>관리</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {reports.map((report, index) => (
                      <tr key={report.id} className="hover:bg-teal-50/50 transition">
                        <td className="px-5 py-4 text-sm text-gray-600">
                          {report.period_start} ~ {report.period_end}
                        </td>
                        <td className="px-5 py-4 text-sm text-gray-600">
                          {formatDate(report.created_at)}
                        </td>
                        <td className="px-5 py-4 text-center">
                          <div className="flex justify-center gap-2">
                            <button 
                              onClick={() => router.push(`/reports/${report.id}`)}
                              className="px-3 py-1.5 bg-teal-50 text-teal-600 rounded-lg text-xs font-medium hover:bg-teal-100 transition"
                            >
                              보기
                            </button>
                            {index === 0 && (
                              <button 
                                onClick={() => router.push(`/reports/${report.id}/edit`)}
                                className="px-3 py-1.5 bg-amber-50 text-amber-600 rounded-lg text-xs font-medium hover:bg-amber-100 transition"
                              >
                                수정
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 모바일 카드 */}
              <div className="md:hidden divide-y divide-gray-100">
                {reports.map((report, index) => (
                  <div key={report.id} className="px-5 py-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-gray-800">{report.period_start} ~ {report.period_end}</p>
                      <p className="text-xs text-gray-400">{formatDate(report.created_at)}</p>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => router.push(`/reports/${report.id}`)}
                        className="flex-1 py-2 bg-teal-50 text-teal-600 rounded-xl text-xs font-medium hover:bg-teal-100 transition"
                      >
                        보기
                      </button>
                      {index === 0 && (
                        <button 
                          onClick={() => router.push(`/reports/${report.id}/edit`)}
                          className="flex-1 py-2 bg-amber-50 text-amber-600 rounded-xl text-xs font-medium hover:bg-amber-100 transition"
                        >
                          수정
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <p className="text-4xl mb-3">📝</p>
              <p className="font-medium">작성된 리포트가 없습니다</p>
              <p className="text-sm mt-1 text-gray-400">새 리포트를 작성해보세요!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}