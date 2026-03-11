'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Student {
  id: string
  student_code: string
  name: string
  birth_year: number
  status: string
  class_id: string | null
  branch_id: string | null
  class_name: string | null
  branch_name: string | null
  last_report_at: string | null
}

interface ClassOption {
  id: string
  name: string
  branch_id: string
}

interface Branch {
  id: string
  name: string
}

export default function ReportSelectPage() {
  const router = useRouter()
  const currentYear = new Date().getFullYear()

  const [students, setStudents] = useState<Student[]>([])
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedBranch, setSelectedBranch] = useState('all')
  const [selectedClass, setSelectedClass] = useState('all')
  const [showNeedReport, setShowNeedReport] = useState(false)
  const [userRole, setUserRole] = useState('')
  const [userBranchId, setUserBranchId] = useState<string | null>(null)
  const [teacherClassIds, setTeacherClassIds] = useState<string[]>([])

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      router.push('/login')
      return
    }

    // 1) 프로필 먼저 가져오기 (지점 필터에 필요)
    const profileResult = await supabase
      .from('user_profiles')
      .select('role, branch_id')
      .eq('id', user.id)
      .single()

    const role = profileResult.data?.role || ''
    const branchId = profileResult.data?.branch_id || null

    setUserRole(role)
    setUserBranchId(branchId)

    // 2) 학생 쿼리: 비-admin이면 내 지점만
    let studentsQuery = supabase
      .from('students')
      .select('id, student_code, name, birth_year, status, class_id, branch_id, last_report_at')
      .eq('status', 'active')
      .order('name')

    if (role !== 'admin' && branchId) {
      studentsQuery = studentsQuery.eq('branch_id', branchId)
    }

    // 3) 나머지 병렬로 가져오기
    const [teacherClassesResult, studentsResult, classesResult, branchesResult] = await Promise.all([
      supabase.from('teacher_classes').select('class_id').eq('teacher_id', user.id),
      studentsQuery,
      supabase.from('classes').select('id, name, branch_id').order('name'),
      supabase.from('branches').select('id, name').order('name')
    ])

    if (teacherClassesResult.data) {
      setTeacherClassIds(teacherClassesResult.data.map(tc => tc.class_id))
    }

    // admin만 전체 지점, 나머지는 자기 지점만
    if (role === 'admin') {
      setBranches(branchesResult.data || [])
    } else if (branchId) {
      setBranches((branchesResult.data || []).filter(b => b.id === branchId))
    } else {
      setBranches(branchesResult.data || [])
    }
    setClasses(classesResult.data || [])

    const classMap = new Map(classesResult.data?.map(c => [c.id, c.name]) || [])
    const branchMap = new Map(branchesResult.data?.map(b => [b.id, b.name]) || [])

    if (studentsResult.data) {
      const studentsWithDetails = studentsResult.data.map(student => ({
        ...student,
        class_name: student.class_id ? classMap.get(student.class_id) || null : null,
        branch_name: student.branch_id ? branchMap.get(student.branch_id) || null : null
      }))
      setStudents(studentsWithDetails)
    }

    setLoading(false)
  }

  const getAge = (birthYear: number) => currentYear - birthYear + 1

  const twoMonthsAgo = new Date()
  twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2)

  // 지점 변경 시 반 필터 초기화
  const handleBranchChange = (value: string) => {
    setSelectedBranch(value)
    setSelectedClass('all')
  }

  // 선택된 지점에 따른 반 목록
  const filteredClasses = (() => {
    // 비-admin: 자기 지점 반만
    if (userRole !== 'admin' && userBranchId) {
      return classes.filter(c => c.branch_id === userBranchId)
    }
    // admin: 지점 선택에 따라
    if (selectedBranch === 'all') return classes
    const branch = branches.find(b => b.name === selectedBranch)
    return branch ? classes.filter(c => c.branch_id === branch.id) : classes
  })()

  // 리포트 필요 학생 수
  const needReportCount = students.filter(s => {
    if (!s.last_report_at) return true
    return new Date(s.last_report_at) < twoMonthsAgo
  }).length

  // 필터링된 학생 목록
  const filteredStudents = students.filter(student => {
    // 검색어 필터
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      const matchesSearch =
        student.name.toLowerCase().includes(term) ||
        student.student_code.toLowerCase().includes(term) ||
        (student.class_name && student.class_name.toLowerCase().includes(term))
      if (!matchesSearch) return false
    }

    // 지점 필터
    if (selectedBranch !== 'all') {
      if (student.branch_name !== selectedBranch) return false
    }

    // 반 필터
    if (selectedClass !== 'all') {
      if (student.class_id !== selectedClass) return false
    }

    // 리포트 필요 필터
    if (showNeedReport) {
      if (student.last_report_at && new Date(student.last_report_at) >= twoMonthsAgo) return false
    }

    // 권한별 필터
    if (userRole === 'teacher' && teacherClassIds.length > 0) {
      if (student.class_id && !teacherClassIds.includes(student.class_id)) return false
    } else if (userRole !== 'admin' && userBranchId) {
      if (student.branch_id !== userBranchId) return false
    }

    return true
  })

  const getLastReportDisplay = (lastReportAt: string | null) => {
    if (!lastReportAt) {
      return <span className="inline-flex items-center gap-1 text-sm text-red-500">🔴 리포트 없음</span>
    }
    const date = new Date(lastReportAt)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
    
    if (diffDays > 60) {
      return <span className="inline-flex items-center gap-1 text-sm text-orange-500">🟠 {diffDays}일 전</span>
    }
    return <span className="text-sm text-gray-500">{diffDays}일 전</span>
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
            <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700 transition text-sm md:text-base">
              ← 뒤로
            </button>
            <h1 className="text-base md:text-lg font-bold text-gray-800">📝 리포트 작성</h1>
            <div className="w-10"></div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-4 md:py-6">
        <p className="text-sm text-gray-500 mb-4">학생을 선택하여 리포트를 작성하세요</p>

        {/* 검색 및 필터 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-5 mb-4 md:mb-6">
          <div className="flex flex-col gap-4">
            {/* 검색바 + 리포트 필요 버튼 */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
                <input
                  type="text"
                  placeholder="이름, 학생ID, 반으로 검색"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-gray-50 border-0 rounded-xl focus:ring-2 focus:ring-teal-500 focus:bg-white transition text-sm md:text-base"
                />
              </div>
              {needReportCount > 0 && (
                <button
                  onClick={() => setShowNeedReport(!showNeedReport)}
                  className={`flex items-center gap-2 px-4 py-3 border rounded-xl text-sm font-medium transition whitespace-nowrap ${
                    showNeedReport
                      ? 'bg-orange-500 border-orange-500 text-white'
                      : 'bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100'
                  }`}
                >
                  ⚠️ 리포트 필요 ({needReportCount})
                </button>
              )}
            </div>

            {/* 지점 + 반 드롭다운 */}
            <div className="flex gap-3">
              {userRole === 'admin' && (
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🏢</span>
                <select
                  value={selectedBranch}
                  onChange={(e) => handleBranchChange(e.target.value)}
                  className="w-full pl-10 pr-10 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm text-gray-700 appearance-none cursor-pointer hover:bg-gray-100 transition"
                >
                  <option value="all">전체 지점</option>
                  {branches.map(branch => (
                    <option key={branch.id} value={branch.name}>{branch.name}</option>
                  ))}
                </select>
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">▼</span>
              </div>
              )}
              <div className="relative w-48">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm">📚</span>
                <select
                  value={selectedClass}
                  onChange={(e) => setSelectedClass(e.target.value)}
                  className="w-full pl-10 pr-10 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm text-gray-700 appearance-none cursor-pointer hover:bg-gray-100 transition"
                >
                  <option value="all">전체 반</option>
                  {filteredClasses.map(cls => (
                    <option key={cls.id} value={cls.id}>{cls.name}</option>
                  ))}
                </select>
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">▼</span>
              </div>
            </div>
          </div>
        </div>

        {/* 학생 수 표시 */}
        <div className="mb-4">
          <p className="text-sm text-gray-500">
            총 <span className="font-bold text-teal-600">{filteredStudents.length}</span>명
            {showNeedReport && <span className="ml-2 text-orange-500">(리포트 필요)</span>}
          </p>
        </div>

        {/* 데스크톱 테이블 */}
        <div className="hidden md:block bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead className="border-b border-gray-200">
              <tr>
                <th className="px-5 py-3 text-left text-sm font-semibold text-gray-900 bg-gray-50">학생명</th>
                <th className="px-5 py-3 text-left text-sm font-semibold text-gray-900 bg-gray-50">학생ID</th>
                <th className="px-5 py-3 text-left text-sm font-semibold text-gray-900 bg-gray-50">나이</th>
                <th className="px-5 py-3 text-left text-sm font-semibold text-gray-900 bg-gray-50">지점</th>
                <th className="px-5 py-3 text-left text-sm font-semibold text-gray-900 bg-gray-50">반</th>
                <th className="px-5 py-3 text-left text-sm font-semibold text-gray-900 bg-gray-50">마지막 리포트</th>
                <th className="px-5 py-3 text-center text-sm font-semibold text-gray-900 bg-gray-50">액션</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredStudents.map((student) => (
                <tr key={student.id} className="hover:bg-teal-50/50 transition">
                  <td className="px-5 py-4 text-sm font-medium text-gray-900">{student.name}</td>
                  <td className="px-5 py-4 text-sm text-gray-600">{student.student_code}</td>
                  <td className="px-5 py-4 text-sm text-gray-600">{getAge(student.birth_year)}세</td>
                  <td className="px-5 py-4 text-sm text-gray-600">{student.branch_name || '-'}</td>
                  <td className="px-5 py-4 text-sm text-gray-600">{student.class_name || '-'}</td>
                  <td className="px-5 py-4">{getLastReportDisplay(student.last_report_at)}</td>
                  <td className="px-5 py-4 text-center">
                    <button
                      onClick={() => router.push(`/reports/new?studentId=${student.id}`)}
                      className="px-4 py-2 bg-gradient-to-r from-teal-500 to-cyan-500 text-white rounded-xl text-sm font-medium hover:from-teal-600 hover:to-cyan-600 transition shadow-sm"
                    >
                      작성하기
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredStudents.length === 0 && (
            <div className="text-center py-16 text-gray-500">
              <p className="text-4xl mb-3">🔍</p>
              <p>검색 결과가 없습니다</p>
            </div>
          )}
        </div>

        {/* 모바일 카드 리스트 */}
        <div className="md:hidden space-y-3">
          {filteredStudents.map((student) => (
            <div key={student.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-medium text-gray-900">{student.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{student.student_code} · {getAge(student.birth_year)}세</p>
                </div>
                {getLastReportDisplay(student.last_report_at)}
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
                <span>🏢 {student.branch_name || '-'}</span>
                <span>·</span>
                <span>📚 {student.class_name || '-'}</span>
              </div>
              <button
                onClick={() => router.push(`/reports/new?studentId=${student.id}`)}
                className="w-full py-2.5 bg-gradient-to-r from-teal-500 to-cyan-500 text-white rounded-xl text-sm font-medium hover:from-teal-600 hover:to-cyan-600 transition shadow-sm"
              >
                작성하기
              </button>
            </div>
          ))}

          {filteredStudents.length === 0 && (
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
