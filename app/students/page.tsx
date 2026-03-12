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

// Storage에서 파일 경로 추출 헬퍼
function extractStoragePath(url: string | null): string | null {
  if (!url) return null
  try {
    const match = url.match(/\/storage\/v1\/object\/public\/artworks\/(.+)/)
    return match ? match[1] : null
  } catch {
    return null
  }
}

function StudentsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const filterParam = searchParams.get('filter')
  const branchParam = searchParams.get('branch')

  const [students, setStudents] = useState<Student[]>([])
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')  // ★ 디바운스용
  const [statusFilter, setStatusFilter] = useState('all')
  const [specialFilter, setSpecialFilter] = useState<string | null>(filterParam)
  const [branchFilter, setBranchFilter] = useState<string | null>(branchParam)
  const [userRole, setUserRole] = useState('')
  const [userBranchId, setUserBranchId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [teacherClassIds, setTeacherClassIds] = useState<string[]>([])
  const [showMyClassOnly, setShowMyClassOnly] = useState(false)
  const [classFilter, setClassFilter] = useState('')  // ★ 반 필터
  const [thisMonthReportedIds, setThisMonthReportedIds] = useState<Set<string>>(new Set())
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)  // ★ 검색 중 인디케이터

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkMode, setBulkMode] = useState(false)
  const [bulkAction, setBulkAction] = useState<'status' | 'class' | null>(null)
  const [bulkStatus, setBulkStatus] = useState('active')
  const [bulkClassId, setBulkClassId] = useState('')
  const [processing, setProcessing] = useState(false)
  const [showAddMenu, setShowAddMenu] = useState(false)  // ★ 모바일 드롭다운
  const [currentPage, setCurrentPage] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const PAGE_SIZE = 50

  const currentYear = new Date().getFullYear()
  const now = new Date()
  const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, now.getDate())

  useEffect(() => { loadData() }, [])
  useEffect(() => { setSpecialFilter(filterParam) }, [filterParam])
  useEffect(() => { setBranchFilter(branchParam) }, [branchParam])
  useEffect(() => { setCurrentPage(0) }, [statusFilter, classFilter, debouncedSearch, specialFilter, branchFilter, showMyClassOnly])
  useEffect(() => { if (userRole) loadData() }, [currentPage, debouncedSearch])
  useEffect(() => { if (userRole) loadData() }, [statusFilter, classFilter])

  // ★ 검색어 디바운스: 300ms 후에 서버 검색 실행
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchTerm])

  async function loadData() {
    // ★ 최초 로딩만 전체 스피너, 검색/페이지 이동은 작은 인디케이터
    const isInitialLoad = students.length === 0 && !debouncedSearch.trim()
    if (isInitialLoad) setLoading(true)
    else setSearching(true)
    const { data: { user } } = await supabase.auth.getUser()
    let branchId: string | null = null
    let role = ''
  
    if (user) {
      const { data: profile } = await supabase
        .from('user_profiles').select('role, branch_id').eq('id', user.id).single()
      if (profile) {
        role = profile.role
        branchId = profile.branch_id
        setUserRole(profile.role)
        setUserBranchId(profile.branch_id)
        setUserId(user.id)
      }
    }
  
    let studentsQuery = supabase
      .from('students')
      .select('id, student_code, name, birth_year, status, class_id, branch_id, last_report_at', { count: 'exact' })
      .order('name')

    if (role !== 'admin' && branchId) {
      studentsQuery = studentsQuery.eq('branch_id', branchId)
    }

    // ★ 서버 필터: 상태, 반, 검색어 모두 서버에서 처리
    if (statusFilter !== 'all') {
      studentsQuery = studentsQuery.eq('status', statusFilter)
    }
    if (classFilter) {
      studentsQuery = studentsQuery.eq('class_id', classFilter)
    }
    if (debouncedSearch.trim()) {
      studentsQuery = studentsQuery.or(`name.ilike.%${debouncedSearch.trim()}%,student_code.ilike.%${debouncedSearch.trim()}%`)
    } else if (statusFilter === 'all' && !classFilter) {
      // 필터 없을 때만 페이지네이션 적용
      studentsQuery = studentsQuery.range(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE - 1)
    }
  
    const [teacherClassesResult, studentsResult, classesResult, branchesResult] = await Promise.all([
      user ? supabase.from('teacher_classes').select('class_id').eq('teacher_id', user.id) : Promise.resolve({ data: null }),
      studentsQuery,
      supabase.from('classes').select('id, name, branch_id'),
      supabase.from('branches').select('id, name')
    ])
  
    if (user && teacherClassesResult.data) {
      setTeacherClassIds(teacherClassesResult.data.map((tc: any) => tc.class_id))
    }
  
    if (studentsResult.error) {
      console.error('학생 목록 로드 실패:', studentsResult.error)
      setLoading(false)
      return
    }
  
    setTotalCount(studentsResult.count || 0)
    setClasses(classesResult.data || [])
    const classMap = new Map(classesResult.data?.map((c: any) => [c.id, c.name]) || [])
    const branchMap = new Map(branchesResult.data?.map((b: any) => [b.id, b.name]) || [])
  
    if (studentsResult.data) {
      setStudents(studentsResult.data.map((student: any) => ({
        ...student,
        class_name: student.class_id ? classMap.get(student.class_id) || null : null,
        branch_name: student.branch_id ? branchMap.get(student.branch_id) || null : null
      })))
    }
  
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    let reportsQuery = supabase.from('reports').select('student_id').gte('created_at', startOfMonth.toISOString())
    if (branchId) reportsQuery = reportsQuery.eq('branch_id', branchId)
    const { data: reportsData } = await reportsQuery
    if (reportsData) setThisMonthReportedIds(new Set(reportsData.map((r: any) => r.student_id)))
  
    setLoading(false)
    setSearching(false)
  }

  async function handleDeleteStudent(e: React.MouseEvent, studentId: string, studentName: string) {
    e.stopPropagation()
    if (!confirm(`"${studentName}" 학생을 삭제하시겠습니까?\n\n해당 학생의 모든 리포트와 작품 이미지도 함께 삭제됩니다.`)) return

    setDeleteLoading(studentId)

    try {
      const { data: reportsData } = await supabase
        .from('reports')
        .select('image_before_url, image_after_url')
        .eq('student_id', studentId)

      if (reportsData && reportsData.length > 0) {
        const imagePaths: string[] = []
        reportsData.forEach((report: any) => {
          const beforePath = extractStoragePath(report.image_before_url)
          const afterPath = extractStoragePath(report.image_after_url)
          if (beforePath) imagePaths.push(beforePath)
          if (afterPath) imagePaths.push(afterPath)
        })

        if (imagePaths.length > 0) {
          const { error: storageError } = await supabase.storage
            .from('artworks')
            .remove(imagePaths)
          if (storageError) {
            console.warn('이미지 삭제 일부 실패 (학생 삭제는 계속 진행):', storageError)
          }
        }
      }

      await supabase.from('reports').delete().eq('student_id', studentId)

      const { error } = await supabase.from('students').delete().eq('id', studentId)
      if (error) {
        alert('삭제 실패: ' + error.message)
      } else {
        setStudents(prev => prev.filter(s => s.id !== studentId))
      }
    } catch (err) {
      console.error('삭제 오류:', err)
      alert('삭제 중 오류가 발생했습니다. 다시 시도해주세요.')
    } finally {
      setDeleteLoading(null)
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
    if (newSet.has(id)) newSet.delete(id)
    else newSet.add(id)
    setSelectedIds(newSet)
  }

  const cancelBulkMode = () => {
    setBulkMode(false)
    setSelectedIds(new Set())
    setBulkAction(null)
  }

  async function handleBulkStatusChange() {
    if (selectedIds.size === 0) { alert('학생을 선택해주세요.'); return }
    const statusText = bulkStatus === 'active' ? '재원' : bulkStatus === 'paused' ? '휴원' : '퇴원'
    if (!confirm(`선택한 ${selectedIds.size}명의 학생을 "${statusText}" 상태로 변경하시겠습니까?`)) return
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
    if (selectedIds.size === 0) { alert('학생을 선택해주세요.'); return }
    if (!bulkClassId) { alert('이동할 반을 선택해주세요.'); return }
    setProcessing(true)
    try {
      const { error } = await supabase
        .from('students')
        .update({ class_id: bulkClassId })
        .in('id', Array.from(selectedIds))
      if (error) {
        alert('변경 실패: ' + error.message)
      } else {
        alert(`${selectedIds.size}명의 학생 반이 변경되었습니다.`)
        setSelectedIds(new Set())
        setBulkMode(false)
        setBulkAction(null)
        loadData()
      }
    } finally {
      setProcessing(false)
    }
  }

  const getAge = (birthYear: number) => currentYear - birthYear + 1

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active': return <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">재원</span>
      case 'paused': return <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">휴원</span>
      case 'inactive': return <span className="px-2 py-1 bg-gray-100 text-gray-500 rounded-full text-xs font-medium">퇴원</span>
      default: return null
    }
  }

  // ★ 클라이언트 필터링: 검색은 서버에서 하므로 여기서 제거
  const roleFilteredStudents = students.filter(student => {
    if (userRole === 'admin') return true
    if (userRole === 'director' || userRole === 'manager') return student.branch_id === userBranchId
    if (userRole === 'teacher') {
      if (showMyClassOnly && teacherClassIds.length > 0) return student.class_id && teacherClassIds.includes(student.class_id)
      return student.branch_id === userBranchId
    }
    return true
  })

  const specialFilteredStudents = roleFilteredStudents.filter(student => {
    if (!specialFilter) return true
    if (specialFilter === 'pending') return student.status === 'active' && !thisMonthReportedIds.has(student.id)
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

  // ★ 수정: 클라이언트에서 검색 필터 제거 (서버에서 이미 필터링됨)
  const filteredStudents = branchFilteredStudents.filter(student => {
    const matchesStatus = statusFilter === 'all' || student.status === statusFilter
    const matchesClass = !classFilter || student.class_id === classFilter
    return matchesStatus && matchesClass
  })

  const filterClasses = userRole === 'admin' 
    ? classes 
    : classes.filter(c => c.branch_id === userBranchId)

  const hasActiveFilter = statusFilter !== 'all' || classFilter !== ''

  const selectedBranchIds = new Set(
    Array.from(selectedIds).map(id => students.find(s => s.id === id)?.branch_id).filter(Boolean)
  )

  const availableClasses = (() => {
    if (selectedBranchIds.size === 1) {
      const branchId = Array.from(selectedBranchIds)[0]
      return classes.filter(c => c.branch_id === branchId)
    } else if (selectedBranchIds.size > 1) return []
    else if (userRole === 'admin') return classes
    else return classes.filter(c => c.branch_id === userBranchId)
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
                  <button onClick={() => setBulkMode(true)} className="bg-white border border-gray-200 text-gray-700 px-3 py-1.5 md:py-2 rounded-xl text-xs md:text-sm font-medium hover:bg-gray-50 transition">
                    대량수정
                  </button>
                  <div className="relative">
                    <button onClick={() => setShowAddMenu(!showAddMenu)} className="bg-gradient-to-r from-teal-500 to-cyan-500 text-white px-3 py-1.5 md:py-2 rounded-xl text-xs md:text-sm font-medium hover:from-teal-600 hover:to-cyan-600 transition shadow-sm">
                      + 새 학생
                    </button>
                    {showAddMenu && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setShowAddMenu(false)} />
                        <div className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden z-50 w-36">
                          <button
                            onClick={() => { setShowAddMenu(false); router.push('/students/new') }}
                            className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-teal-50 transition"
                          >
                            ✏️ 개별등록
                          </button>
                          <button
                            onClick={() => { setShowAddMenu(false); router.push('/students/import') }}
                            className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-teal-50 transition border-t border-gray-100"
                          >
                            📥 엑셀등록
                          </button>
                        </div>
                      </>
                    )}
                  </div>
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
            <p className={`font-medium text-sm ${specialFilter === 'pending' ? 'text-rose-700' : 'text-orange-700'}`}>
              {getFilterTitle()} · {filteredStudents.length}명
            </p>
            <button
              onClick={() => { setSpecialFilter(null); router.push('/students') }}
              className="text-gray-500 hover:text-gray-700 text-sm"
            >
              전체 보기
            </button>
          </div>
        )}

        {/* 대량 수정 툴바 */}
        {bulkMode && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 mb-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <p className="text-sm font-medium text-gray-700">
                {selectedIds.size > 0 ? `${selectedIds.size}명 선택됨` : '학생을 선택하세요'}
              </p>
              {!bulkAction ? (
                <div className="flex gap-2">
                  <button onClick={() => setBulkAction('status')} disabled={selectedIds.size === 0} className="px-3 py-2 bg-teal-500 text-white rounded-xl text-sm font-medium hover:bg-teal-600 transition disabled:opacity-40">
                    상태 변경
                  </button>
                  <button onClick={() => setBulkAction('class')} disabled={selectedIds.size === 0} className="px-3 py-2 bg-purple-500 text-white rounded-xl text-sm font-medium hover:bg-purple-600 transition disabled:opacity-40">
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
                  <button onClick={() => setBulkAction(null)} className="px-3 py-2 bg-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-300 transition">뒤로</button>
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
                  <button onClick={() => setBulkAction(null)} className="px-3 py-2 bg-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-300 transition">뒤로</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 검색 & 필터 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-5 mb-4 md:mb-6">
          <div className="flex flex-col gap-3">
            <div className="relative">
              <input
                type="text"
                placeholder="이름, 학생ID로 검색"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-3 bg-gray-50 border-0 rounded-xl focus:ring-2 focus:ring-teal-500 focus:bg-white transition text-sm md:text-base"
              />
              {searching && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-teal-500 border-t-transparent"></div>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <select
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
                className={`flex-1 px-3 py-2 rounded-xl text-sm font-medium border transition ${classFilter ? 'border-teal-400 bg-teal-50 text-teal-700' : 'border-gray-200 bg-gray-50 text-gray-600'}`}
              >
                <option value="">반 전체</option>
                {filterClasses.map(cls => (
                  <option key={cls.id} value={cls.id}>{cls.name}</option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className={`flex-1 px-3 py-2 rounded-xl text-sm font-medium border transition ${statusFilter !== 'all' ? 'border-teal-400 bg-teal-50 text-teal-700' : 'border-gray-200 bg-gray-50 text-gray-600'}`}
              >
                <option value="all">상태 전체</option>
                <option value="active">재원</option>
                <option value="paused">휴원</option>
                <option value="inactive">퇴원</option>
              </select>
              {hasActiveFilter && (
                <button
                  onClick={() => { setStatusFilter('all'); setClassFilter(''); setShowMyClassOnly(false) }}
                  className="px-3 py-2 rounded-xl text-sm font-medium bg-gray-800 text-white hover:bg-gray-700 transition whitespace-nowrap"
                >
                  초기화
                </button>
              )}
              {userRole === 'teacher' && (
                <button
                  onClick={() => setShowMyClassOnly(!showMyClassOnly)}
                  className={`px-3 py-2 rounded-xl text-sm font-medium transition whitespace-nowrap ${
                    showMyClassOnly ? 'bg-indigo-500 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  내 반
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 학생 수 */}
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm text-gray-500">
          총 <span className="font-bold text-teal-600">{statusFilter === 'all' && !classFilter && !debouncedSearch.trim() ? totalCount : filteredStudents.length}</span>명
            {!debouncedSearch.trim() && Math.ceil(totalCount / PAGE_SIZE) > 1 && (
              <span className="ml-2 text-gray-400">({currentPage+1} / {Math.ceil(totalCount / PAGE_SIZE)} 페이지)</span>
            )}
            {specialFilter === 'pending' && <span className="ml-2 text-rose-500">(이번 달 미작성)</span>}
            {specialFilter === 'needReport' && <span className="ml-2 text-orange-500">(리포트 필요)</span>}
          </p>
          {bulkMode && (
            <button onClick={handleSelectAll} className="text-sm text-teal-600 hover:text-teal-700 font-medium">
              {selectedIds.size === filteredStudents.length ? '전체 해제' : '전체 선택'}
            </button>
          )}
        </div>

        {/* 데스크톱 테이블 */}
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
                  <td className="px-5 py-4 text-sm font-medium text-gray-800">{student.name}</td>
                  <td className="px-5 py-4 text-sm text-gray-600">{getAge(student.birth_year)}세</td>
                  <td className="px-5 py-4 text-sm text-gray-600">{student.class_name || '-'}</td>
                  <td className="px-5 py-4">{getStatusBadge(student.status)}</td>
                  <td className="px-5 py-4 text-center">
                    {!bulkMode && (
                      <button
                        onClick={(e) => handleDeleteStudent(e, student.id, student.name)}
                        disabled={deleteLoading === student.id}
                        className="text-gray-400 hover:text-red-500 transition text-sm disabled:opacity-40"
                      >
                        {deleteLoading === student.id ? '삭제 중...' : '삭제'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredStudents.length === 0 && (
            <div className="text-center py-16 text-gray-500">
              <p className="text-2xl mb-2">🔍</p>
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
                  <button
                    onClick={(e) => handleDeleteStudent(e, student.id, student.name)}
                    disabled={deleteLoading === student.id}
                    className="text-gray-300 hover:text-red-500 transition ml-2 text-sm disabled:opacity-40"
                  >
                    {deleteLoading === student.id ? '...' : '삭제'}
                  </button>
                )}
              </div>
            </div>
          ))}
          {filteredStudents.length === 0 && (
            <div className="text-center py-16 text-gray-500">
              <p className="text-2xl mb-2">🔍</p>
              <p>검색 결과가 없습니다</p>
            </div>
          )}
        </div>

        {!debouncedSearch.trim() && Math.ceil(totalCount / PAGE_SIZE) > 1 && (
          <div className="flex items-center justify-center gap-2 mt-6">
            <button onClick={() => setCurrentPage(0)} disabled={currentPage === 0}
              className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40">«</button>
            <button onClick={() => setCurrentPage(p => Math.max(0, p-1))} disabled={currentPage === 0}
              className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40">이전</button>
            <span className="px-4 py-2 bg-teal-500 text-white rounded-xl text-sm font-medium">
              {currentPage+1} / {Math.ceil(totalCount / PAGE_SIZE)}
            </span>
            <button onClick={() => setCurrentPage(p => Math.min(Math.ceil(totalCount/PAGE_SIZE)-1, p+1))} disabled={currentPage >= Math.ceil(totalCount/PAGE_SIZE)-1}
              className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40">다음</button>
            <button onClick={() => setCurrentPage(Math.ceil(totalCount/PAGE_SIZE)-1)} disabled={currentPage >= Math.ceil(totalCount/PAGE_SIZE)-1}
              className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40">»</button>
          </div>
        )}

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
