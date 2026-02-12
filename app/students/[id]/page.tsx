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
  branch_id: string | null
  classes: {
    name: string
  } | null
  branches: {
    name: string
  } | null
}

interface Report {
  id: string
  period_start: string
  period_end: string
  created_at: string
}

interface Consultation {
  id: string
  consultation_date: string
  consultation_type: string
  content: string
  follow_up: string | null
  counselor_name: string
  counselor_id: string
  created_at: string
}

interface Sketchbook {
  id: string
  book_number: number
  started_at: string
  completed_at: string | null
  status: string
}

interface SketchbookWork {
  id: string
  work_date: string
  curriculum_id: string | null
  is_custom: boolean
  custom_title: string | null
  custom_description: string | null
  curriculum?: {
    title: string
    parent_message_template: string | null
  }
}

const CONSULTATION_TYPES = [
  { value: 'first_visit', label: '첫 등원' },
  { value: 'regular', label: '정기 상담' },
  { value: 'lesson', label: '수업 관련' },
  { value: 'behavior', label: '행동/태도' },
  { value: 'other', label: '기타' }
]

export default function StudentDetailPage() {
  const router = useRouter()
  const params = useParams()
  const studentId = params.id as string

  const [student, setStudent] = useState<Student | null>(null)
  const [reports, setReports] = useState<Report[]>([])
  const [consultations, setConsultations] = useState<Consultation[]>([])
  const [loading, setLoading] = useState(true)
  
  // 탭 상태
  const [activeTab, setActiveTab] = useState<'info' | 'sketchbook' | 'reports'>('info')
  
  // 스케치북 관련 상태
  const [activeSketchbook, setActiveSketchbook] = useState<Sketchbook | null>(null)
  const [sketchbookWorks, setSketchbookWorks] = useState<SketchbookWork[]>([])
  const [completedSketchbooks, setCompletedSketchbooks] = useState<Sketchbook[]>([])
  
  // 진도 수정/추가 모달
  const [showWorkModal, setShowWorkModal] = useState(false)
  const [editingWork, setEditingWork] = useState<SketchbookWork | null>(null)
  const [workForm, setWorkForm] = useState({
    work_date: new Date().toISOString().split('T')[0],
    is_custom: false,
    curriculum_id: '',
    custom_title: '',
    custom_description: ''
  })
  const [curriculumOptions, setCurriculumOptions] = useState<{id: string, title: string, parent_message_template: string | null}[]>([])
  
  const [currentUserId, setCurrentUserId] = useState<string>('')
  const [currentUserName, setCurrentUserName] = useState<string>('')
  
  const [showConsultationModal, setShowConsultationModal] = useState(false)
  const [editingConsultation, setEditingConsultation] = useState<Consultation | null>(null)
  const [saving, setSaving] = useState(false)
  
  const [consultationForm, setConsultationForm] = useState({
    consultation_date: new Date().toISOString().split('T')[0],
    consultation_type: 'regular',
    content: '',
    follow_up: ''
  })

  const currentYear = new Date().getFullYear()

  useEffect(() => {
    if (studentId) loadStudentData()
  }, [studentId])

  async function loadStudentData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      setCurrentUserId(user.id)
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('name')
        .eq('id', user.id)
        .single()
      if (profile) setCurrentUserName(profile.name)
    }

    const { data: studentData } = await supabase
      .from('students')
      .select('id, student_code, name, birth_year, status, parent_name, parent_phone, enrolled_at, branch_id, classes(name), branches(name)')
      .eq('id', studentId)
      .single()

    if (studentData) {
      setStudent({
        ...studentData,
        classes: Array.isArray(studentData.classes) 
          ? studentData.classes[0] || null 
          : studentData.classes,
        branches: Array.isArray(studentData.branches) 
          ? studentData.branches[0] || null 
          : studentData.branches
      })
    }

    // 기존 데이터 로드
    const [reportsResult, consultationsResult] = await Promise.all([
      supabase
        .from('reports')
        .select('id, period_start, period_end, created_at')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false }),
      supabase
        .from('student_consultations')
        .select('*')
        .eq('student_id', studentId)
        .order('consultation_date', { ascending: false })
    ])

    if (reportsResult.data) setReports(reportsResult.data)
    if (consultationsResult.data) setConsultations(consultationsResult.data)

    // 스케치북 데이터 로드
    await loadSketchbookData()

    setLoading(false)
  }

  async function loadSketchbookData() {
    // 커리큘럼 옵션 로드 (진도 추가 시 사용)
    const { data: curriculumData } = await supabase
      .from('monthly_curriculum')
      .select('id, title, parent_message_template')
      .eq('status', 'active')
      .order('year', { ascending: false })
      .order('month', { ascending: false })
    
    if (curriculumData) setCurriculumOptions(curriculumData)

    // 활성 스케치북
    const { data: activeData } = await supabase
      .from('sketchbooks')
      .select('*')
      .eq('student_id', studentId)
      .eq('status', 'active')
      .single()

      setActiveSketchbook(null)
      setSketchbookWorks([])
  
      if (activeData) {
        setActiveSketchbook(activeData)
      
      // 진도 목록 로드
      const { data: worksData } = await supabase
        .from('sketchbook_works')
        .select(`
          id,
          work_date,
          curriculum_id,
          is_custom,
          custom_title,
          custom_description
        `)
        .eq('sketchbook_id', activeData.id)
        .order('work_date', { ascending: false })

      if (worksData) {
        // 커리큘럼 정보 가져오기
        const curriculumIds = worksData
          .filter(w => w.curriculum_id)
          .map(w => w.curriculum_id)

        let curriculumMap = new Map()
        if (curriculumIds.length > 0) {
          const { data: curriculumData } = await supabase
            .from('monthly_curriculum')
            .select('id, title, parent_message_template')
            .in('id', curriculumIds)

          if (curriculumData) {
            curriculumMap = new Map(curriculumData.map(c => [c.id, c]))
          }
        }

        const worksWithCurriculum = worksData.map(work => ({
          ...work,
          curriculum: work.curriculum_id ? curriculumMap.get(work.curriculum_id) : null
        }))

        setSketchbookWorks(worksWithCurriculum)
      }
    }

    // 완료된 스케치북 목록
    const { data: completedData } = await supabase
      .from('sketchbooks')
      .select('*')
      .eq('student_id', studentId)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })

    if (completedData) setCompletedSketchbooks(completedData)
  }

  // 새 스케치북 시작
  async function handleStartNewSketchbook() {
    const lastNumber = activeSketchbook?.book_number || 
      (completedSketchbooks.length > 0 ? Math.max(...completedSketchbooks.map(s => s.book_number)) : 0)

    const { data, error } = await supabase
      .from('sketchbooks')
      .insert({
        student_id: studentId,
        book_number: lastNumber + 1,
        started_at: new Date().toISOString().split('T')[0],
        status: 'active'
      })
      .select()
      .single()

    if (error) {
      alert('스케치북 생성 실패: ' + error.message)
      return
    }

    setActiveSketchbook(data)
    setSketchbookWorks([])
  }

  // 스케치북 완료 처리
  async function handleCompleteSketchbook() {
    if (!activeSketchbook) return
    
    if (sketchbookWorks.length === 0) {
      alert('진도가 없는 스케치북은 완료할 수 없습니다.')
      return
    }

    if (!confirm(`스케치북 #${activeSketchbook.book_number}을 완료 처리하시겠습니까?\n\n완료 후에는 작품 설명 출력과 성장 리포트 작성이 가능합니다.`)) {
      return
    }

    const { error } = await supabase
      .from('sketchbooks')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString().split('T')[0]
      })
      .eq('id', activeSketchbook.id)

    if (error) {
      alert('완료 처리 실패: ' + error.message)
      return
    }

    alert('스케치북이 완료되었습니다!')
    loadSketchbookData()
  }

  // 진도 추가 모달 열기
  const openAddWorkModal = () => {
    setEditingWork(null)
    setWorkForm({
      work_date: new Date().toISOString().split('T')[0],
      is_custom: false,
      curriculum_id: '',
      custom_title: '',
      custom_description: ''
    })
    setShowWorkModal(true)
  }

  // 진도 수정 모달 열기
  const openEditWorkModal = (work: SketchbookWork) => {
    setEditingWork(work)
    setWorkForm({
      work_date: work.work_date,
      is_custom: work.is_custom,
      curriculum_id: work.curriculum_id || '',
      custom_title: work.custom_title || '',
      custom_description: work.custom_description || ''
    })
    setShowWorkModal(true)
  }

  // 진도 저장
  const handleSaveWork = async () => {
    if (!activeSketchbook) return
    
    if (!workForm.is_custom && !workForm.curriculum_id) {
      alert('커리큘럼을 선택해주세요')
      return
    }
    if (workForm.is_custom && !workForm.custom_title.trim()) {
      alert('주제를 입력해주세요')
      return
    }

    setSaving(true)

    try {
      const workData: any = {
        work_date: workForm.work_date,
        is_custom: workForm.is_custom,
        curriculum_id: workForm.is_custom ? null : workForm.curriculum_id,
        custom_title: workForm.is_custom ? workForm.custom_title : null,
        custom_description: workForm.is_custom ? workForm.custom_description : null
      }

      if (editingWork) {
        // 수정
        const { error } = await supabase
          .from('sketchbook_works')
          .update(workData)
          .eq('id', editingWork.id)

        if (error) throw error
      } else {
        // 추가
        workData.sketchbook_id = activeSketchbook.id
        const { error } = await supabase
          .from('sketchbook_works')
          .insert(workData)

        if (error) throw error
      }

      setShowWorkModal(false)
      await loadSketchbookData()
    } catch (error) {
      console.error('Save error:', error)
      alert('저장에 실패했습니다')
    }

    setSaving(false)
  }

  // 진도 삭제
  const handleDeleteWork = async (workId: string) => {
    if (!confirm('이 진도를 삭제하시겠습니까?')) return

    try {
      const { error } = await supabase
        .from('sketchbook_works')
        .delete()
        .eq('id', workId)

      if (error) throw error

      setSketchbookWorks(prev => prev.filter(w => w.id !== workId))
    } catch (error) {
      console.error('Delete error:', error)
      alert('삭제에 실패했습니다')
    }
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

  const getTypeLabel = (type: string) => {
    return CONSULTATION_TYPES.find(t => t.value === type)?.label || type
  }

  const getTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'first_visit': return 'bg-purple-100 text-purple-700'
      case 'regular': return 'bg-blue-100 text-blue-700'
      case 'lesson': return 'bg-teal-100 text-teal-700'
      case 'behavior': return 'bg-orange-100 text-orange-700'
      default: return 'bg-gray-100 text-gray-700'
    }
  }

  const openAddModal = () => {
    setEditingConsultation(null)
    setConsultationForm({
      consultation_date: new Date().toISOString().split('T')[0],
      consultation_type: 'regular',
      content: '',
      follow_up: ''
    })
    setShowConsultationModal(true)
  }

  const openEditModal = (consultation: Consultation) => {
    setEditingConsultation(consultation)
    setConsultationForm({
      consultation_date: consultation.consultation_date,
      consultation_type: consultation.consultation_type,
      content: consultation.content,
      follow_up: consultation.follow_up || ''
    })
    setShowConsultationModal(true)
  }

  const handleSaveConsultation = async () => {
    if (!consultationForm.content.trim()) {
      alert('상담 내용을 입력해주세요')
      return
    }

    setSaving(true)

    try {
      if (editingConsultation) {
        const { error } = await supabase
          .from('student_consultations')
          .update({
            consultation_date: consultationForm.consultation_date,
            consultation_type: consultationForm.consultation_type,
            content: consultationForm.content,
            follow_up: consultationForm.follow_up || null,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingConsultation.id)

        if (error) throw error
      } else {
        const { error } = await supabase
          .from('student_consultations')
          .insert({
            student_id: studentId,
            branch_id: student?.branch_id,
            counselor_id: currentUserId,
            counselor_name: currentUserName,
            consultation_date: consultationForm.consultation_date,
            consultation_type: consultationForm.consultation_type,
            content: consultationForm.content,
            follow_up: consultationForm.follow_up || null
          })

        if (error) throw error
      }

      setShowConsultationModal(false)
      
      const { data } = await supabase
        .from('student_consultations')
        .select('*')
        .eq('student_id', studentId)
        .order('consultation_date', { ascending: false })
      
      if (data) setConsultations(data)
    } catch (error) {
      console.error('Save error:', error)
      alert('저장에 실패했습니다')
    }

    setSaving(false)
  }

  const handleDeleteConsultation = async (consultationId: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return

    try {
      const { error } = await supabase
        .from('student_consultations')
        .delete()
        .eq('id', consultationId)

      if (error) throw error

      setConsultations(prev => prev.filter(c => c.id !== consultationId))
    } catch (error) {
      console.error('Delete error:', error)
      alert('삭제에 실패했습니다')
    }
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
        {/* 학생 기본 정보 카드 */}
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
        </div>

        {/* 탭 메뉴 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-4 md:mb-6 overflow-hidden">
          <div className="flex border-b border-gray-100">
            <button
              onClick={() => setActiveTab('info')}
              className={`flex-1 py-3 text-sm font-medium transition ${
                activeTab === 'info'
                  ? 'text-teal-600 border-b-2 border-teal-500 bg-teal-50/50'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              📋 기본정보
            </button>
            <button
              onClick={() => setActiveTab('sketchbook')}
              className={`flex-1 py-3 text-sm font-medium transition ${
                activeTab === 'sketchbook'
                  ? 'text-teal-600 border-b-2 border-teal-500 bg-teal-50/50'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              📒 스케치북
            </button>
            <button
              onClick={() => setActiveTab('reports')}
              className={`flex-1 py-3 text-sm font-medium transition ${
                activeTab === 'reports'
                  ? 'text-teal-600 border-b-2 border-teal-500 bg-teal-50/50'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              📝 리포트
            </button>
          </div>
        </div>

        {/* 탭 컨텐츠 */}
        {activeTab === 'info' && (
          <>
            {/* 학부모 정보 */}
            {(student.parent_name || student.parent_phone) && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-4 md:mb-6">
                <h3 className="font-semibold text-gray-800 mb-3">👨‍👩‍👧 학부모 정보</h3>
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

            {/* 상담 일지 섹션 */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-semibold text-gray-800">📋 상담 일지 ({consultations.length}건)</h3>
                <button
                  onClick={openAddModal}
                  className="px-3 py-1.5 bg-teal-500 text-white rounded-lg text-sm font-medium hover:bg-teal-600 transition"
                >
                  + 추가
                </button>
              </div>

              {consultations.length > 0 ? (
                <div className="divide-y divide-gray-100">
                  {consultations.map(consultation => (
                    <div key={consultation.id} className="p-4 md:p-5 hover:bg-gray-50 transition">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getTypeBadgeColor(consultation.consultation_type)}`}>
                            {getTypeLabel(consultation.consultation_type)}
                          </span>
                          <span className="text-sm text-gray-500">{consultation.consultation_date}</span>
                          <span className="text-xs text-gray-400">by {consultation.counselor_name}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          {consultation.counselor_id === currentUserId && (
                            <>
                              <button
                                onClick={() => openEditModal(consultation)}
                                className="px-2 py-1 text-xs text-teal-600 hover:bg-teal-50 rounded transition"
                              >
                                수정
                              </button>
                              <button
                                onClick={() => handleDeleteConsultation(consultation.id)}
                                className="px-2 py-1 text-xs text-red-500 hover:bg-red-50 rounded transition"
                              >
                                삭제
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{consultation.content}</p>
                      {consultation.follow_up && (
                        <div className="mt-2 pt-2 border-t border-gray-100">
                          <p className="text-xs text-gray-400 mb-1">후속 조치</p>
                          <p className="text-sm text-gray-600">{consultation.follow_up}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <p className="text-4xl mb-3">📋</p>
                  <p className="font-medium">상담 기록이 없습니다</p>
                  <p className="text-sm mt-1 text-gray-400">첫 상담 내용을 기록해보세요!</p>
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === 'sketchbook' && (
          <>
            {/* 현재 스케치북 */}
            {activeSketchbook ? (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-4 md:mb-6">
                <div className="px-4 py-4 border-b border-gray-100">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-2xl">📒</span>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-800 text-sm md:text-base">스케치북 #{activeSketchbook.book_number}</h3>
                      <p className="text-xs text-gray-500">시작일: {activeSketchbook.started_at}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-9">
                    <span className="px-2.5 py-1 bg-blue-50 text-blue-600 rounded-full text-xs md:text-sm font-medium">
                      진행중 · {sketchbookWorks.length}작품
                    </span>
                    <button
                      onClick={handleCompleteSketchbook}
                      className="px-2.5 py-1.5 bg-purple-500 text-white rounded-lg text-xs md:text-sm font-medium hover:bg-purple-600 transition"
                    >
                      완료 처리
                    </button>
                  </div>
                </div>

                {/* 진도 추가 버튼 */}
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
                  <button
                    onClick={openAddWorkModal}
                    className="w-full py-2.5 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-teal-400 hover:text-teal-600 hover:bg-teal-50 transition"
                  >
                    + 진도 수동 추가
                  </button>
                </div>

                {/* 진도 목록 */}
                {sketchbookWorks.length > 0 ? (
                  <div className="divide-y divide-gray-100">
                    {sketchbookWorks.map((work, index) => (
                      <div key={work.id} className="px-4 py-4 flex items-start gap-3 hover:bg-gray-50 transition group">
                      <div className="w-8 h-8 bg-teal-100 rounded-lg flex items-center justify-center text-teal-700 font-bold text-sm shrink-0 mt-0.5">
                        {sketchbookWorks.length - index}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-2 flex-wrap">
                          <p className="font-medium text-gray-800 text-sm md:text-base">
                            {work.is_custom ? work.custom_title : work.curriculum?.title}
                          </p>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium shrink-0 ${
                            work.is_custom ? 'bg-purple-100 text-purple-700' : 'bg-teal-100 text-teal-700'
                          }`}>
                            {work.is_custom ? '자율' : '커리큘럼'}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">{work.work_date}</p>
                      </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                          <button
                            onClick={() => openEditWorkModal(work)}
                            className="px-2 py-1 text-xs text-teal-600 hover:bg-teal-50 rounded transition"
                          >
                            수정
                          </button>
                          <button
                            onClick={() => handleDeleteWork(work.id)}
                            className="px-2 py-1 text-xs text-red-500 hover:bg-red-50 rounded transition"
                          >
                            삭제
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    <p className="text-4xl mb-3">🎨</p>
                    <p className="font-medium">아직 진도가 없습니다</p>
                    <p className="text-sm mt-1 text-gray-400">일일 메시지에서 "완료" 시 자동으로 추가되거나,<br/>위 버튼으로 수동 추가할 수 있습니다</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center mb-4 md:mb-6">
                <p className="text-5xl mb-4">📒</p>
                <p className="font-medium text-gray-800 mb-2">활성 스케치북이 없습니다</p>
                <p className="text-sm text-gray-500 mb-4">새 스케치북을 시작해보세요!</p>
                <button
                  onClick={handleStartNewSketchbook}
                  className="px-6 py-3 bg-teal-500 text-white rounded-xl font-medium hover:bg-teal-600 transition"
                >
                  + 새 스케치북 시작
                </button>
              </div>
            )}

            {/* 완료된 스케치북 목록 */}
            {completedSketchbooks.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h3 className="font-semibold text-gray-800">📚 완료된 스케치북</h3>
                </div>
                <div className="divide-y divide-gray-100">
                  {completedSketchbooks.map(sketchbook => (
                    <div key={sketchbook.id} className="px-4 py-4">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-xl">📗</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-800 text-sm md:text-base">스케치북 #{sketchbook.book_number}</p>
                        <p className="text-xs text-gray-500">
                          {sketchbook.started_at} ~ {sketchbook.completed_at}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-8">
                      <button
                        onClick={() => router.push(`/students/${studentId}/sketchbook/${sketchbook.id}`)}
                        className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs md:text-sm font-medium hover:bg-gray-200 transition"
                      >
                        상세보기
                      </button>
                      <button
                        onClick={() => router.push(`/students/${studentId}/sketchbook/${sketchbook.id}/print`)}
                        className="px-3 py-1.5 bg-teal-50 text-teal-600 rounded-lg text-xs md:text-sm font-medium hover:bg-teal-100 transition"
                      >
                        출력
                      </button>
                    </div>
                  </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === 'reports' && (
          <>
            <button
              onClick={() => router.push(`/reports/new?studentId=${student.id}`)}
              className="w-full bg-gradient-to-r from-teal-500 to-cyan-500 text-white py-4 rounded-2xl font-medium hover:from-teal-600 hover:to-cyan-600 transition shadow-lg shadow-teal-500/30 mb-4 md:mb-6 text-sm md:text-base"
            >
              📝 새 리포트 작성
            </button>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="font-semibold text-gray-800">📝 리포트 히스토리 ({reports.length}건)</h3>
              </div>

              {reports.length > 0 ? (
                <>
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
          </>
        )}
      </div>

      {/* 상담 일지 추가/수정 모달 */}
      {showConsultationModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-800">
                {editingConsultation ? '상담 일지 수정' : '상담 일지 추가'}
              </h2>
              <button
                onClick={() => setShowConsultationModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">상담일 *</label>
                  <input
                    type="date"
                    value={consultationForm.consultation_date}
                    onChange={(e) => setConsultationForm({ ...consultationForm, consultation_date: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">상담 유형 *</label>
                  <select
                    value={consultationForm.consultation_type}
                    onChange={(e) => setConsultationForm({ ...consultationForm, consultation_type: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm"
                  >
                    {CONSULTATION_TYPES.map(type => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">상담 내용 *</label>
                <textarea
                  value={consultationForm.content}
                  onChange={(e) => setConsultationForm({ ...consultationForm, content: e.target.value })}
                  placeholder="상담 내용을 기록해주세요..."
                  rows={5}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  후속 조치
                  <span className="text-gray-400 font-normal ml-1">(선택)</span>
                </label>
                <textarea
                  value={consultationForm.follow_up}
                  onChange={(e) => setConsultationForm({ ...consultationForm, follow_up: e.target.value })}
                  placeholder="필요한 후속 조치가 있다면 기록해주세요..."
                  rows={2}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
                />
              </div>
            </div>

            <div className="sticky bottom-0 bg-white px-6 py-4 border-t border-gray-100 flex gap-2">
              <button
                onClick={() => setShowConsultationModal(false)}
                className="flex-1 py-3 rounded-xl text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition"
              >
                취소
              </button>
              <button
                onClick={handleSaveConsultation}
                disabled={saving}
                className="flex-1 py-3 rounded-xl text-sm font-medium bg-teal-500 text-white hover:bg-teal-600 transition disabled:opacity-50"
              >
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 진도 추가/수정 모달 */}
      {showWorkModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-800">
                {editingWork ? '진도 수정' : '진도 추가'}
              </h2>
              <button
                onClick={() => setShowWorkModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              {/* 날짜 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">날짜 *</label>
                <input
                  type="date"
                  value={workForm.work_date}
                  onChange={(e) => setWorkForm({ ...workForm, work_date: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm"
                />
              </div>

              {/* 수업 유형 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">수업 유형 *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setWorkForm({ ...workForm, is_custom: false })}
                    className={`py-3 rounded-xl font-medium transition ${
                      !workForm.is_custom
                        ? 'bg-teal-500 text-white'
                        : 'bg-gray-50 text-gray-600 border border-gray-200'
                    }`}
                  >
                    커리큘럼
                  </button>
                  <button
                    type="button"
                    onClick={() => setWorkForm({ ...workForm, is_custom: true })}
                    className={`py-3 rounded-xl font-medium transition ${
                      workForm.is_custom
                        ? 'bg-purple-500 text-white'
                        : 'bg-gray-50 text-gray-600 border border-gray-200'
                    }`}
                  >
                    자율
                  </button>
                </div>
              </div>

              {/* 커리큘럼 선택 */}
              {!workForm.is_custom && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">커리큘럼 선택 *</label>
                  <select
                    value={workForm.curriculum_id}
                    onChange={(e) => setWorkForm({ ...workForm, curriculum_id: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm"
                  >
                    <option value="">선택해주세요</option>
                    {curriculumOptions.map(c => (
                      <option key={c.id} value={c.id}>{c.title}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* 자율 수업 입력 */}
              {workForm.is_custom && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">주제 *</label>
                    <input
                      type="text"
                      value={workForm.custom_title}
                      onChange={(e) => setWorkForm({ ...workForm, custom_title: e.target.value })}
                      placeholder="예: 우리 강아지 그리기"
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      작품 설명
                      <span className="text-gray-400 font-normal ml-1">(선택)</span>
                    </label>
                    <textarea
                      value={workForm.custom_description}
                      onChange={(e) => setWorkForm({ ...workForm, custom_description: e.target.value })}
                      placeholder="작품에 대한 설명을 입력해주세요..."
                      rows={3}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none text-sm"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="sticky bottom-0 bg-white px-6 py-4 border-t border-gray-100 flex gap-2">
              <button
                onClick={() => setShowWorkModal(false)}
                className="flex-1 py-3 rounded-xl text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition"
              >
                취소
              </button>
              <button
                onClick={handleSaveWork}
                disabled={saving}
                className="flex-1 py-3 rounded-xl text-sm font-medium bg-teal-500 text-white hover:bg-teal-600 transition disabled:opacity-50"
              >
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
