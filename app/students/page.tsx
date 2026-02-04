'use client'
import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
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

interface BranchOption {
  id: string
  name: string
}

function StudentsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const filterParam = searchParams.get('filter')
  const branchParam = searchParams.get('branch')

  const [students, setStudents] = useState<Student[]>([])
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [branches, setBranches] = useState<BranchOption[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [specialFilter, setSpecialFilter] = useState<string | null>(filterParam)
  const [branchFilter, setBranchFilter] = useState<string | null>(branchParam)
  const [userRole, setUserRole] = useState('')
  const [userBranchId, setUserBranchId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [teacherClassIds, setTeacherClassIds] = useState<string[]>([])
  const [showMyClassOnly, setShowMyClassOnly] = useState(false)
  const [thisMonthReportedIds, setThisMonthReportedIds] = useState<Set<string>>(new Set())

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkMode, setBulkMode] = useState(false)
  const [bulkAction, setBulkAction] = useState<'status' | 'class' | null>(null)
  const [bulkStatus, setBulkStatus] = useState('active')
  const [bulkClassId, setBulkClassId] = useState('')
  const [processing, setProcessing] = useState(false)

  const currentYear = new Date().getFullYear()

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    setSpecialFilter(filterParam)
  }, [filterParam])

  useEffect(() => {
    setBranchFilter(branchParam)
  }, [branchParam])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    let branchId: string | null = null

    const [profileResult, teacherClassesResult, studentsResult, classesResult, branchesResult] = await Promise.all([
      user ? supabase.from('user_profiles').select('role, branch_id').eq('id', user.id).single() : Promise.resolve({ data: null }),
      user ? supabase.from('teacher_classes').select('class_id').eq('teacher_id', user.id) : Promise.resolve({ data: null }),
      supabase.from('students').select('id, student_code, name, birth_year, status, class_id, branch_id, last_report_at').order('name'),
      supabase.from('classes').select('id, name, branch_id'),
      supabase.from('branches').select('id, name').order('name')
    ])

    if (user) {
      setUserId(user.id)
      if (profileResult.data) {
        setUserRole(profileResult.data.role)
        setUserBranchId(profileResult.data.branch_id)
        branchId = profileResult.data.branch_id
      }
      if (teacherClassesResult.data) {
        setTeacherClassIds(teacherClassesResult.data.map((tc: any) => tc.class_id))
      }
    }

    if (studentsResult.error) {
      console.error('Error:', studentsResult.error)
      setLoading(false)
      return
    }

    setClasses(classesResult.data || [])
    setBranches(branchesResult.data || [])
    const classMap = new Map(classesResult.data?.map((c: any) => [c.id, c.name]) || [])
    const branchMap = new Map(branchesResult.data?.map((b: any) => [b.id, b.name]) || [])

    if (studentsResult.data) {
      const studentsWithDetails = studentsResult.data.map((student: any) => ({
        ...student,
        class_name: student.class_id ? classMap.get(student.class_id) || null : null,
        branch_name: student.branch_id ? branchMap.get(student.branch_id) || null : null
      }))
      setStudents(studentsWithDetails)
    }

    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    let reportsQuery = supabase
      .from('reports')
      .select('student_id')
      .gte('created_at', startOfMonth.toISOString())

    if (branchId) {
      reportsQuery = reportsQuery.eq('branch_id', branchId)
    }

    const { data: reportsData } = await reportsQuery

    if (reportsData) {
      setThisMonthReportedIds(new Set(reportsData.map((r: any) => r.student_id)))
    }

    setLoading(false)
  }

  async function handleDeleteStudent(e: React.MouseEvent, studentId: string, studentName: string) {
    e.stopPropagation()
    if (!confirm(`"${studentName}" 학생을 삭제하시겠습니까?\n\n해당 학생의 모든 리포트도 함께 삭제됩니다.`)) {
      return
    }
    await supabase.from('reports').delete().eq('student_id', studentId)
    const { error } = await supabase.from('students').delete().eq('id', studentId)
    if (error) {
      alert('삭제 실패: ' + error.message)
    } else {
      alert('학생이 삭제되었습니다.')
      loadData()
    }
  }

  const handleSelectAll = () => {
    if (selectedIds.size === filteredStudents.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredStudents.map(s => s.id)))
    }
  }

  const handleSelectOne = (id: string) => {
    const newSet = new Set(selectedIds)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    setSelectedIds(newSet)
  }

  async function handleBulkStatusChange() {
    if (selectedIds.size === 0) {
      alert('학생을 선택해주세요.')
      return
    }
    const statusText = bulkStatus === 'active' ? '재원' : bulkStatus === 'paused' ? '휴원' : '퇴원'
    if (!confirm(`선택한 ${selectedIds.size}명의 학생을 "${statusText}" 상태로 변경하시겠습니까?`)) {
      return
    }
    setProcessing(true)
    try {
      const { error } = await supabase
        .from('students')
        .update({ status: bulkStatus })
        .in('id', Array.from(selectedIds))
      if (error) {
        alert('변경 실패: ' + error.message)
      } else {
        alert(`${selectedIds.size}명의 학생 상태가 변경되었습니다.`)
        setSelectedIds(new Set())
        setBulkMode(false)
        setBulkAction(null)
        loadData()
      }
    } finally {
      setProcessing(false)
    }
  }

  async function handleBulkClassChange() {
    if (selectedIds.size === 0) {
      alert('학생을 선택해주세요.')
      return
    }
    if (!bulkClassId) {
      alert('이동할 반을 선택해주세요.')
      return
    }
    const targetClass = classes.find(c => c.id === bulkClassId)
    if (!confirm(`선택한 ${selectedIds.size}명의 학생을 "${targetClass?.name}" 반으로 이동하시겠습니까?`)) {
      return
    }
    setProcessing(true)
    try {
      const { error } = await supabase
        .from('students')
        .update({ class_id: bulkClassId })
        .in('id', Array.from(selectedIds))
      if (error) {
        alert('변경 실패: ' + error.message)
      } else {
        alert(`${selectedIds.size}명의 학생이 반 이동되었습니다.`)
        setSelectedIds(new Set())
        setBulkMode(false)
        setBulkAction(null)
        loadData()
      }
    } finally {
      setProcessing(false)
    }
  }

  const cancelBulkMode = () => {
    setBulkMode(false)
    setBulkAction(null)
    setSelectedIds(new Set())
  }

  const clearSpecialFilter = () => {
    setSpecialFilter(null)
    router.push('/students')
  }

  const getAge = (birthYear: number) => currentYear - birthYear + 1

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <span className="px-2.5 py-1 bg-teal-50 text-teal-600 rounded-full text-xs font-medium">재원</span>
      case 'paused':
        return <span className="px-2.5 py-1 bg-amber-50 text-amber-600 rounded-full text-xs font-medium">휴원</span>
      case 'inactive':
        return <span className="px-2.5 py-1 bg-gray-100 text-gray-500 rounded-full text-xs font-medium">퇴원</span>
      default:
        return null
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active': return '재원'
      case 'paused': return '휴원'
      case 'inactive': return '퇴원'
      default: return status
    }
  }

  // ===== 엑셀 다운로드 =====
  function handleExcelDownload() {
    let targetStudents: Student[] = []
    let fileName = ''

    if (userRole === 'admin') {
      if (branchFilter) {
        const branchName = branches.find(b => b.id === branchFilter)?.name || '지점'
        targetStudents = filteredStudents
        fileName = `원생명단_${branchName}_${new Date().toISOString().slice(0, 10)}.csv`
      } else {
        targetStudents = filteredStudents
        fileName = `원생명단_전체_${new Date().toISOString().slice(0, 10)}.csv`
      }
    } else {
      targetStudents = filteredStudents
      const branchName = branches.find(b => b.id === userBranchId)?.name || '지점'
      fileName = `원생명단_${branchName}_${new Date().toISOString().slice(0, 10)}.csv`
    }

    if (targetStudents.length === 0) {
      alert('다운로드할 학생이 없습니다.')
      return
    }

    const headers = ['지점', '학생ID', '이름', '나이', '반', '상태', '마지막 리포트']
    const rows = targetStudents.map(s => [
      s.branch_name || '-',
      s.student_code || '-',
      s.name,
      `${getAge(s.birth_year)}세`,
      s.class_name || '-',
      getStatusText(s.status),
      s.last_report_at ? new Date(s.last_report_at).toLocaleDateString('ko-KR') : '-'
    ])

    const csvContent = '\uFEFF' + [headers, ...rows].map(row =>
      row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ).join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
  }

  const now = new Date()
  const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, now.getDate())

  const roleFilteredStudents = students.filter(student => {
    if (userRole === 'admin') return true
    if (userRole === 'director' || userRole === 'manager') {
      return student.branch_id === userBranchId
    }
    if (userRole === 'teacher') {
      if (showMyClassOnly && teacherClassIds.length > 0) {
        return student.class_id && teacherClassIds.includes(student.class_id)
      }
      return student.branch_id === userBranchId
    }
    return true
  })

  const specialFilteredStudents = roleFilteredStudents.filter(student => {
    if (!specialFilter) return true

    if (specialFilter === 'pending') {
      return student.status === 'active' && !thisMonthReportedIds.has(student.id)
    }

    if (specialFilter === 'needReport') {
      if (student.status !== 'active') return false
      if (!student.last_report_at) return true
      return new Date(student.last_report_at) < twoMonthsAgo
    }

    return true
  })

  const branchFilteredStudents = specialFilteredStudents.filter(student => {
    if (!branchFilter) return true
    return student.branch_id === branchFilter
  })

  const filteredStudents = branchFilteredStudents.filter(student => {
    const matchesSearch = student.name.includes(searchTerm) ||
                          (student.student_code && student.student_code.includes(searchTerm)) ||
                          (student.branch_name && student.branch_name.includes(searchTerm))
    const matchesStatus = statusFilter === 'all' || student.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const selectedBranchIds = new Set(
    Array.from(selectedIds)
      .map(id => students.find(s => s.id === id)?.branch_id)
      .filter(Boolean)
  )

  const availableClasses = (() => {
    if (selectedBranchIds.size === 1) {
      const branchId = Array.from(selectedBranchIds)[0]
      return classes.filter(c => c.branch_id === branchId)
    } else if (selectedBranchIds.size > 1) {
      return []
    } else if (userRole === 'admin') {
      if (branchFilter) {
        return classes.filter(c => c.branch_id === branchFilter)
      }
      return classes
    } else {
      return classes.filter(c => c.branch_id === userBranchId)
    }
  })()

  const getFilterTitle = () => {
    if (specialFilter === 'pending') return '이번 달 미작성 학생'
    if (specialFilter === 'needReport') return '리포트 필요 학생 (2개월 이상 경과)'
    return '학생 관리'
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
            <h1 className="text-base md:text-lg font-bold text-gray-800">{getFilterTitle()}</h1>
            <div className="flex gap-2">
              {!bulkMode ? (
                <>
                  <button onClick={handleExcelDownload} className="bg-white border border-gray-200 text-gray-700 px-3 py-1.5 md:py-2 rounded-xl text-xs md:text-sm font-medium hover:bg-gray-50 transition">
                    📥 엑셀
                  </button>
                  <button onClick={() => setBulkMode(true)} className="bg-white border border-gray-200 text-gray-700 px-3 py-1.5 md:py-2 rounded-xl text-xs md:text-sm font-medium hover:bg-gray-50 transition">
                    대량수정
                  </button>
                  <button onClick={() => router.push('/students/new')} className="bg-gradient-to-r from-teal-500 to-cyan-500 text-white px-3 py-1.5 md:py-2 rounded-xl text-xs md:text-sm font-medium hover:from-teal-600 hover:to-cyan-600 transition shadow-sm">
                    + 새 학생
                  </button>
                </>
              ) : (
                <button onClick={cancelBulkMode} className="bg-gray-500 text-white px-3 py-1.5 md:py-2 rounded-xl text-xs md:text-sm font-medium hover:bg-gray-600 transition">
                  취소
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-4 md:py-6">
        {specialFilter && (
          <div className={`rounded-2xl p-4 mb-4 flex items-center justify-between ${
            specialFilter === 'pending' ? 'bg-rose-50 border border-rose-200' : 'bg-orange-50 border border-orange-200'
          }`}>
            <div>
              <p className={`font-medium ${specialFilter === 'pending' ? 'text-rose-700' : 'text-orange-700'}`}>
                {specialFilter === 'pending' ? '📋 이번 달 미작성 학생' : '⚠️ 리포트 필요 학생'}
              </p>
              <p className={`text-sm mt-0.5 ${specialFilter === 'pending' ? 'text-rose-500' : 'text-orange-500'}`}>
                {specialFilter === 'pending' ? '이번 달 리포트를 아직 작성하지 않은 학생입니다.' : '최근 2개월간 리포트가 없는 학생입니다.'}
              </p>
            </div>
            <button onClick={clearSpecialFilter} className="text-sm text-gray-500 hover:text-gray-700">
              ✕ 필터 해제
            </button>
          </div>
        )}

        {/* 대량수정 액션바 */}
        {bulkMode && selectedIds.size > 0 && (
          <div className="bg-teal-50 border border-teal-200 rounded-2xl p-4 mb-4">
            <p className="text-sm font-medium text-teal-800 mb-3">
              {selectedIds.size}명 선택됨
            </p>
            {!bulkAction ? (
              <div className="flex gap-2">
                <button onClick={() => setBulkAction('status')} className="px-4 py-2 bg-teal-500 text-white rounded-xl text-sm font-medium hover:bg-teal-600 transition">
                  상태 변경
                </button>
                <button onClick={() => setBulkAction('class')} className="px-4 py-2 bg-purple-500 text-white rounded-xl text-sm font-medium hover:bg-purple-600 transition">
                  반 이동
                </button>
              </div>
            ) : bulkAction === 'status' ? (
              <div className="flex items-center gap-2">
                <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)} className="px-3 py-2 border border-teal-300 rounded-xl text-sm bg-white">
                  <option value="active">재원</option>
                  <option value="paused">휴원</option>
                  <option value="inactive">퇴원</option>
                </select>
                <button onClick={handleBulkStatusChange} disabled={processing} className="px-4 py-2 bg-teal-500 text-white rounded-xl text-sm font-medium hover:bg-teal-600 transition disabled:opacity-50">
                  {processing ? '처리 중...' : '적용'}
                </button>
                <button onClick={() => setBulkAction(null)} className="px-3 py-2 bg-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-300 transition">
                  뒤로
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {selectedBranchIds.size > 1 ? (
                  <p className="text-sm text-red-500">같은 지점 학생만 반 이동 가능합니다</p>
                ) : (
                  <>
                    <select value={bulkClassId} onChange={(e) => setBulkClassId(e.target.value)} className="px-3 py-2 border border-purple-300 rounded-xl text-sm bg-white">
                      <option value="">반 선택</option>
                      {availableClasses.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    <button onClick={handleBulkClassChange} disabled={processing || !bulkClassId} className="px-4 py-2 bg-purple-500 text-white rounded-xl text-sm font-medium hover:bg-purple-600 transition disabled:opacity-50">
                      {processing ? '처리 중...' : '이동'}
                    </button>
                  </>
                )}
                <button onClick={() => setBulkAction(null)} className="px-3 py-2 bg-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-300 transition">
                  뒤로
                </button>
              </div>
            )}
          </div>
        )}

        {/* 필터 영역 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-5 mb-4 md:mb-6">
          <div className="flex flex-col gap-4">
            <div className="relative">
              <input
                type="text"
                placeholder="이름, 학생ID, 지점명으로 검색"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-4 pr-4 py-3 bg-gray-50 border-0 rounded-xl focus:ring-2 focus:ring-teal-500 focus:bg-white transition text-sm md:text-base"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* 상태 필터 */}
              {[
                { key: 'all', label: '전체' },
                { key: 'active', label: '재원' },
                { key: 'paused', label: '휴원' },
                { key: 'inactive', label: '퇴원' }
              ].map((status) => (
                <button
                  key={status.key}
                  onClick={() => setStatusFilter(status.key)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition whitespace-nowrap ${
                    statusFilter === status.key
                      ? 'bg-teal-500 text-white shadow-sm'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {status.label}
                </button>
              ))}

              {/* 구분선 */}
              {(userRole === 'admin' || (userRole === 'teacher' && teacherClassIds.length > 0)) && (
                <div className="w-px h-6 bg-gray-200 mx-1"></div>
              )}

              {/* 본사 계정: 지점 드롭다운 */}
              {userRole === 'admin' && (
                <select
                  value={branchFilter || ''}
                  onChange={(e) => setBranchFilter(e.target.value || null)}
                  className="px-4 py-2 rounded-xl text-sm font-medium bg-gray-100 text-gray-600 border-0 focus:ring-2 focus:ring-teal-500 cursor-pointer"
                >
                  <option value="">전체 지점</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              )}

              {/* 강사 계정: 내 담당반만 토글 */}
              {userRole === 'teacher' && teacherClassIds.length > 0 && (
                <button
                  onClick={() => setShowMyClassOnly(!showMyClassOnly)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition whitespace-nowrap ${
                    showMyClassOnly
                      ? 'bg-purple-500 text-white shadow-sm'
                      : 'bg-purple-100 text-purple-600 hover:bg-purple-200'
                  }`}
                >
                  내 담당반만
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            총 <span className="font-bold text-teal-600">{filteredStudents.length}</span>명
            {branchFilter && userRole === 'admin' && (
              <span className="ml-2 text-teal-500">({branches.find(b => b.id === branchFilter)?.name})</span>
            )}
            {showMyClassOnly && <span className="ml-2 text-purple-500">(내 담당반)</span>}
            {specialFilter && <span className="ml-2 text-orange-500">({specialFilter === 'pending' ? '미작성' : '리포트 필요'})</span>}
          </p>
          {bulkMode && (
            <button onClick={handleSelectAll} className="text-sm text-teal-600 hover:text-teal-700 font-medium">
              {selectedIds.size === filteredStudents.length ? '전체 해제' : '전체 선택'}
            </button>
          )}
        </div>

        {/* PC 테이블 */}
        <div className="hidden md:block bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead className="border-b border-gray-200">
              <tr>
                {bulkMode && (
                  <th className="px-4 py-3 text-center text-sm font-semibold text-gray-900 bg-gray-50" style={{width: '5%'}}>
                    <input type="checkbox" checked={selectedIds.size === filteredStudents.length && filteredStudents.length > 0} onChange={handleSelectAll} className="w-4 h-4 text-teal-500 rounded" />
                  </th>
                )}
                <th className="px-5 py-3 text-left text-sm font-semibold text-gray-900 bg-gray-50">지점</th>
                <th className="px-5 py-3 text-left text-sm font-semibold text-gray-900 bg-gray-50">학생ID</th>
                <th className="px-5 py-3 text-left text-sm font-semibold text-gray-900 bg-gray-50">이름</th>
                <th className="px-5 py-3 text-left text-sm font-semibold text-gray-900 bg-gray-50">나이</th>
                <th className="px-5 py-3 text-left text-sm font-semibold text-gray-900 bg-gray-50">반</th>
                <th className="px-5 py-3 text-left text-sm font-semibold text-gray-900 bg-gray-50">상태</th>
                <th className="px-5 py-3 text-center text-sm font-semibold text-gray-900 bg-gray-50">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredStudents.map((student) => (
                <tr
                  key={student.id}
                  onClick={() => bulkMode ? handleSelectOne(student.id) : router.push(`/students/${student.id}`)}
                  className={`hover:bg-teal-50/50 cursor-pointer transition ${selectedIds.has(student.id) ? 'bg-teal-50' : ''}`}
                >
                  {bulkMode && (
                    <td className="px-4 py-4 text-center">
                      <input type="checkbox" checked={selectedIds.has(student.id)} onChange={() => handleSelectOne(student.id)} onClick={(e) => e.stopPropagation()} className="w-4 h-4 text-teal-500 rounded" />
                    </td>
                  )}
                  <td className="px-5 py-4 text-sm text-gray-600">{student.branch_name || '-'}</td>
                  <td className="px-5 py-4 text-sm text-gray-600">{student.student_code || '-'}</td>
                  <td className="px-5 py-4 text-sm text-gray-600">{student.name}</td>
                  <td className="px-5 py-4 text-sm text-gray-600">{getAge(student.birth_year)}세</td>
                  <td className="px-5 py-4 text-sm text-gray-600">{student.class_name || '-'}</td>
                  <td className="px-5 py-4">{getStatusBadge(student.status)}</td>
                  <td className="px-5 py-4 text-center">
                    {!bulkMode && (
                      <button onClick={(e) => handleDeleteStudent(e, student.id, student.name)} className="text-gray-400 hover:text-red-500 transition text-sm">
                        삭제
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredStudents.length === 0 && (
            <div className="text-center py-16 text-gray-500">
              <p>검색 결과가 없습니다</p>
            </div>
          )}
        </div>

        {/* 모바일 카드 */}
        <div className="md:hidden space-y-3">
          {filteredStudents.map((student) => (
            <div
              key={student.id}
              onClick={() => bulkMode ? handleSelectOne(student.id) : router.push(`/students/${student.id}`)}
              className={`bg-white rounded-2xl shadow-sm border border-gray-100 p-4 hover:shadow-md cursor-pointer transition ${selectedIds.has(student.id) ? 'ring-2 ring-teal-500 bg-teal-50' : ''}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  {bulkMode && (
                    <input type="checkbox" checked={selectedIds.has(student.id)} onChange={() => handleSelectOne(student.id)} onClick={(e) => e.stopPropagation()} className="w-5 h-5 text-teal-500 rounded mt-0.5" />
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-medium text-gray-900">{student.name}</span>
                      {getStatusBadge(student.status)}
                    </div>
                    <div className="text-xs text-gray-500 space-y-1">
                      <p>{student.branch_name || '-'} / {student.class_name || '-'}</p>
                      <p>{getAge(student.birth_year)}세 / {student.student_code}</p>
                    </div>
                  </div>
                </div>
                {!bulkMode && (
                  <button onClick={(e) => handleDeleteStudent(e, student.id, student.name)} className="text-gray-300 hover:text-red-500 transition ml-2">
                    삭제
                  </button>
                )}
              </div>
            </div>
          ))}
          {filteredStudents.length === 0 && (
            <div className="text-center py-16 text-gray-500">
              <p>검색 결과가 없습니다</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function StudentsPageWrapper() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-500 mx-auto mb-4"></div>
          <p className="text-gray-500">로딩 중...</p>
        </div>
      </div>
    }>
      <StudentsPage />
    </Suspense>
  )
}
