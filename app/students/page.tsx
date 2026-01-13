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
}

interface ClassOption {
  id: string
  name: string
  branch_id: string
}

export default function StudentsPage() {
  const router = useRouter()
  const [students, setStudents] = useState<Student[]>([])
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [userRole, setUserRole] = useState('')
  const [userBranchId, setUserBranchId] = useState<string | null>(null)
  const [userClassId, setUserClassId] = useState<string | null>(null)

  // 대량 선택 상태
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

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role, branch_id, class_id')
        .eq('id', user.id)
        .single()
      
      if (profile) {
        setUserRole(profile.role)
        setUserBranchId(profile.branch_id)
        setUserClassId(profile.class_id)
      }
    }

    const { data: studentsData, error } = await supabase
      .from('students')
      .select('id, student_code, name, birth_year, status, class_id, branch_id')
      .order('name')

    if (error) {
      console.error('Error:', error)
      setLoading(false)
      return
    }

    if (studentsData) {
      const { data: classesData } = await supabase
        .from('classes')
        .select('id, name, branch_id')

      setClasses(classesData || [])
      const classMap = new Map(classesData?.map(c => [c.id, c.name]) || [])

      const { data: branchesData } = await supabase
        .from('branches')
        .select('id, name')

      const branchMap = new Map(branchesData?.map(b => [b.id, b.name]) || [])

      const studentsWithDetails = studentsData.map(student => ({
        ...student,
        class_name: student.class_id ? classMap.get(student.class_id) || null : null,
        branch_name: student.branch_id ? branchMap.get(student.branch_id) || null : null
      }))

      setStudents(studentsWithDetails)
    }

    setLoading(false)
  }

  async function handleDeleteStudent(e: React.MouseEvent, studentId: string, studentName: string) {
    e.stopPropagation()

    if (!confirm(`"${studentName}" 학생을 삭제하시겠습니까?\n\n⚠️ 해당 학생의 모든 리포트도 함께 삭제됩니다.`)) {
      return
    }

    await supabase
      .from('reports')
      .delete()
      .eq('student_id', studentId)

    const { error } = await supabase
      .from('students')
      .delete()
      .eq('id', studentId)

    if (error) {
      alert('삭제 실패: ' + error.message)
    } else {
      alert('학생이 삭제되었습니다.')
      loadData()
    }
  }

  // 전체 선택/해제
  const handleSelectAll = () => {
    if (selectedIds.size === filteredStudents.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredStudents.map(s => s.id)))
    }
  }

  // 개별 선택
  const handleSelectOne = (id: string) => {
    const newSet = new Set(selectedIds)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    setSelectedIds(newSet)
  }

  // 대량 상태 변경
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

  // 대량 반 변경
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

  // 대량 모드 취소
  const cancelBulkMode = () => {
    setBulkMode(false)
    setBulkAction(null)
    setSelectedIds(new Set())
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

  const roleFilteredStudents = students.filter(student => {
    if (userRole === 'admin') return true
    if (userRole === 'manager') {
      return student.branch_id === userBranchId
    }
    if (userRole === 'teacher') {
      if (userClassId) {
        return student.branch_id === userBranchId && student.class_id === userClassId
      }
      return student.branch_id === userBranchId
    }
    return true
  })

  const filteredStudents = roleFilteredStudents.filter(student => {
    const matchesSearch = student.name.includes(searchTerm) || 
                          (student.student_code && student.student_code.includes(searchTerm)) ||
                          (student.branch_name && student.branch_name.includes(searchTerm))
    const matchesStatus = statusFilter === 'all' || student.status === statusFilter
    return matchesSearch && matchesStatus
  })

  // 선택한 학생들의 지점 ID 가져오기
  const selectedBranchIds = new Set(
    Array.from(selectedIds)
      .map(id => students.find(s => s.id === id)?.branch_id)
      .filter(Boolean)
  )

  // 현재 지점의 반 목록 (선택한 학생 기준)
  const availableClasses = (() => {
    if (selectedBranchIds.size === 1) {
      const branchId = Array.from(selectedBranchIds)[0]
      return classes.filter(c => c.branch_id === branchId)
    } else if (selectedBranchIds.size > 1) {
      return []
    } else if (userRole === 'admin') {
      return classes
    } else {
      return classes.filter(c => c.branch_id === userBranchId)
    }
  })()

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
            <h1 className="text-base md:text-lg font-bold text-gray-800">학생 관리</h1>
            <div className="flex gap-2">
              {!bulkMode ? (
                <>
                  <button 
                    onClick={() => setBulkMode(true)}
                    className="bg-white border border-gray-200 text-gray-700 px-3 py-1.5 md:py-2 rounded-xl text-xs md:text-sm font-medium hover:bg-gray-50 transition"
                  >
                    ✏️ <span className="hidden sm:inline">대량수정</span>
                  </button>
                  <button 
                    onClick={() => router.push('/students/import')}
                    className="bg-white border border-gray-200 text-gray-700 px-3 py-1.5 md:py-2 rounded-xl text-xs md:text-sm font-medium hover:bg-gray-50 transition"
                  >
                    📥 <span className="hidden sm:inline">일괄등록</span>
                  </button>
                  <button 
                    onClick={() => router.push('/students/new')}
                    className="bg-gradient-to-r from-teal-500 to-cyan-500 text-white px-3 py-1.5 md:py-2 rounded-xl text-xs md:text-sm font-medium hover:from-teal-600 hover:to-cyan-600 transition shadow-sm"
                  >
                    + <span className="hidden sm:inline">새 학생</span>
                  </button>
                </>
              ) : (
                <button 
                  onClick={cancelBulkMode}
                  className="bg-gray-500 text-white px-3 py-1.5 md:py-2 rounded-xl text-xs md:text-sm font-medium hover:bg-gray-600 transition"
                >
                  ✕ 취소
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-4 md:py-6">
        {/* 대량 수정 모드 안내 */}
        {bulkMode && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <p className="font-medium text-amber-800">✏️ 대량 수정 모드</p>
                <p className="text-sm text-amber-600">
                  {selectedIds.size}명 선택됨 · 수정할 학생을 선택하세요
                </p>
              </div>
              
              {!bulkAction ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => setBulkAction('status')}
                    disabled={selectedIds.size === 0}
                    className="px-4 py-2 bg-amber-500 text-white rounded-xl text-sm font-medium hover:bg-amber-600 transition disabled:opacity-50"
                  >
                    상태 변경
                  </button>
                  <button
                    onClick={() => setBulkAction('class')}
                    disabled={selectedIds.size === 0}
                    className="px-4 py-2 bg-purple-500 text-white rounded-xl text-sm font-medium hover:bg-purple-600 transition disabled:opacity-50"
                  >
                    반 이동
                  </button>
                </div>
              ) : bulkAction === 'status' ? (
                <div className="flex items-center gap-2">
                  <select
                    value={bulkStatus}
                    onChange={(e) => setBulkStatus(e.target.value)}
                    className="px-3 py-2 border border-amber-300 rounded-xl text-sm bg-white"
                  >
                    <option value="active">재원</option>
                    <option value="paused">휴원</option>
                    <option value="inactive">퇴원</option>
                  </select>
                  <button
                    onClick={handleBulkStatusChange}
                    disabled={processing}
                    className="px-4 py-2 bg-amber-500 text-white rounded-xl text-sm font-medium hover:bg-amber-600 transition disabled:opacity-50"
                  >
                    {processing ? '처리 중...' : '적용'}
                  </button>
                  <button
                    onClick={() => setBulkAction(null)}
                    className="px-3 py-2 bg-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-300 transition"
                  >
                    뒤로
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  {selectedBranchIds.size > 1 ? (
                    <p className="text-sm text-red-500">⚠️ 같은 지점 학생만 반 이동 가능합니다</p>
                  ) : (
                    <>
                      <select
                        value={bulkClassId}
                        onChange={(e) => setBulkClassId(e.target.value)}
                        className="px-3 py-2 border border-purple-300 rounded-xl text-sm bg-white"
                      >
                        <option value="">반 선택</option>
                        {availableClasses.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                      <button
                        onClick={handleBulkClassChange}
                        disabled={processing || !bulkClassId}
                        className="px-4 py-2 bg-purple-500 text-white rounded-xl text-sm font-medium hover:bg-purple-600 transition disabled:opacity-50"
                      >
                        {processing ? '처리 중...' : '이동'}
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setBulkAction(null)}
                    className="px-3 py-2 bg-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-300 transition"
                  >
                    뒤로
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 검색 및 필터 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-5 mb-4 md:mb-6">
          <div className="flex flex-col gap-4">
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
              <input
                type="text"
                placeholder="이름, 학생ID, 지점명으로 검색"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-gray-50 border-0 rounded-xl focus:ring-2 focus:ring-teal-500 focus:bg-white transition text-sm md:text-base"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
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
            </div>
          </div>
        </div>

        {/* 학생 수 표시 */}
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            총 <span className="font-bold text-teal-600">{filteredStudents.length}</span>명
            {userRole !== 'admin' && <span className="text-gray-400 ml-1">(내 지점)</span>}
          </p>
          {bulkMode && (
            <button
              onClick={handleSelectAll}
              className="text-sm text-teal-600 hover:text-teal-700 font-medium"
            >
              {selectedIds.size === filteredStudents.length ? '전체 해제' : '전체 선택'}
            </button>
          )}
        </div>

        {/* 데스크톱 테이블 */}
        <div className="hidden md:block bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full table-fixed">
            <thead className="border-b border-gray-200">
              <tr>
                {bulkMode && (
                  <th className="px-4 py-3 text-center text-sm font-semibold text-gray-900 bg-gray-50" style={{width: '5%'}}>
                    <input
                      type="checkbox"
                      checked={selectedIds.size === filteredStudents.length && filteredStudents.length > 0}
                      onChange={handleSelectAll}
                      className="w-4 h-4 text-teal-500 rounded"
                    />
                  </th>
                )}
                <th className="px-5 py-3 text-left text-sm font-semibold text-gray-900 bg-gray-50" style={{width: bulkMode ? '13%' : '14%'}}>지점</th>
                <th className="px-5 py-3 text-left text-sm font-semibold text-gray-900 bg-gray-50" style={{width: bulkMode ? '13%' : '14%'}}>학생ID</th>
                <th className="px-5 py-3 text-left text-sm font-semibold text-gray-900 bg-gray-50" style={{width: bulkMode ? '13%' : '14%'}}>이름</th>
                <th className="px-5 py-3 text-left text-sm font-semibold text-gray-900 bg-gray-50" style={{width: bulkMode ? '11%' : '14%'}}>나이</th>
                <th className="px-5 py-3 text-left text-sm font-semibold text-gray-900 bg-gray-50" style={{width: bulkMode ? '13%' : '14%'}}>반</th>
                <th className="px-5 py-3 text-left text-sm font-semibold text-gray-900 bg-gray-50" style={{width: bulkMode ? '13%' : '14%'}}>상태</th>
                <th className="px-5 py-3 text-center text-sm font-semibold text-gray-900 bg-gray-50" style={{width: bulkMode ? '14%' : '16%'}}>관리</th>
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
                      <input
                        type="checkbox"
                        checked={selectedIds.has(student.id)}
                        onChange={() => handleSelectOne(student.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-4 h-4 text-teal-500 rounded"
                      />
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
                      <button
                        onClick={(e) => handleDeleteStudent(e, student.id, student.name)}
                        className="text-gray-400 hover:text-red-500 transition text-sm"
                      >
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
              <p className="text-4xl mb-3">🔍</p>
              <p>검색 결과가 없습니다</p>
            </div>
          )}
        </div>

        {/* 모바일 카드 리스트 */}
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
                    <input
                      type="checkbox"
                      checked={selectedIds.has(student.id)}
                      onChange={() => handleSelectOne(student.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-5 h-5 text-teal-500 rounded mt-0.5"
                    />
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-medium text-gray-900">{student.name}</span>
                      {getStatusBadge(student.status)}
                    </div>
                    <div className="text-xs text-gray-500 space-y-1">
                      <p className="flex items-center gap-2">
                        <span className="text-gray-400">🏢</span>
                        {student.branch_name || '-'} · {student.class_name || '-'}
                      </p>
                      <p className="flex items-center gap-2">
                        <span className="text-gray-400">🎂</span>
                        {getAge(student.birth_year)}세 · {student.student_code}
                      </p>
                    </div>
                  </div>
                </div>
                {!bulkMode && (
                  <button
                    onClick={(e) => handleDeleteStudent(e, student.id, student.name)}
                    className="text-gray-300 hover:text-red-500 transition ml-2"
                  >
                    🗑️
                  </button>
                )}
              </div>
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