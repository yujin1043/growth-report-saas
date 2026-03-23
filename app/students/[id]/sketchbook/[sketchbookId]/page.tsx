'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Student {
  id: string
  name: string
  birth_year: number
  classes: { name: string } | null
}

interface Sketchbook {
  id: string
  book_number: number
  started_at: string
  completed_at: string | null
  status: string
  followup_done?: boolean
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

export default function SketchbookDetailPage() {
  const router = useRouter()
  const params = useParams()
  const studentId = params.id as string
  const sketchbookId = params.sketchbookId as string

  const [student, setStudent] = useState<Student | null>(null)
  const [sketchbook, setSketchbook] = useState<Sketchbook | null>(null)
  const [works, setWorks] = useState<SketchbookWork[]>([])
  const [loading, setLoading] = useState(true)

  // 편집 모드
  const [editMode, setEditMode] = useState(false)
  const [editedWorks, setEditedWorks] = useState<{[key: string]: string}>({})
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  // 진도 이동
  const [showMoveModal, setShowMoveModal] = useState(false)
  const [movingWork, setMovingWork] = useState<SketchbookWork | null>(null)
  const [moveTargetId, setMoveTargetId] = useState<string>('')
  const [otherSketchbooks, setOtherSketchbooks] = useState<Sketchbook[]>([])

  const isCompleted = sketchbook?.status === 'completed'

  useEffect(() => {
    if (studentId && sketchbookId) loadData()
  }, [studentId, sketchbookId])

  async function loadData() {
    try {
      const [studentResult, sketchbookResult, worksResult] = await Promise.all([
        supabase.from('students').select('id, name, birth_year, classes(name)').eq('id', studentId).single(),
        supabase.from('sketchbooks').select('*').eq('id', sketchbookId).single(),
        supabase.from('sketchbook_works').select('id, work_date, curriculum_id, is_custom, custom_title, custom_description').eq('sketchbook_id', sketchbookId).order('work_date', { ascending: true })
      ])

      if (studentResult.data) {
        setStudent({
          ...studentResult.data,
          classes: Array.isArray(studentResult.data.classes) 
            ? studentResult.data.classes[0] || null 
            : studentResult.data.classes
        })
      }

      if (sketchbookResult.data) setSketchbook(sketchbookResult.data)

      if (worksResult.data) {
        const curriculumIds = worksResult.data
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

        const worksWithCurriculum = worksResult.data.map(work => ({
          ...work,
          curriculum: work.curriculum_id ? curriculumMap.get(work.curriculum_id) : null
        }))

        setWorks(worksWithCurriculum)

        const initialEdits: {[key: string]: string} = {}
        worksWithCurriculum.forEach(work => {
          initialEdits[work.id] = work.is_custom 
            ? work.custom_description || ''
            : work.curriculum?.parent_message_template || ''
        })
        setEditedWorks(initialEdits)
      }
    // 다른 스케치북 목록 로드 (이동용)
    const { data: allBooks } = await supabase
    .from('sketchbooks')
    .select('*')
    .eq('student_id', studentId)
    .neq('id', sketchbookId)
    .order('book_number', { ascending: false })

    if (allBooks) setOtherSketchbooks(allBooks)

  } catch (error) {
    console.error('Load error:', error)
  } finally {
    setLoading(false)
  }
  }

  const openMoveModal = (work: SketchbookWork) => {
  setMovingWork(work)
  setMoveTargetId('')
  setShowMoveModal(true)
  }

  const handleMoveWork = async () => {
    if (!movingWork || !moveTargetId) return

    // 완료된 스케치북: 강화 경고
    if (isCompleted) {
      if (!confirm('⚠️ 완료된 스케치북의 작품입니다.\n\n이동하면 이 스케치북의 진도 기록에서 사라집니다.\n정말 이동하시겠습니까?')) return
    }
  
    setSaving(true)
  try {
    const { error } = await supabase
      .from('sketchbook_works')
      .update({ sketchbook_id: moveTargetId })
      .eq('id', movingWork.id)

    if (error) throw error

    setShowMoveModal(false)
    setMovingWork(null)
    setWorks(prev => prev.filter(w => w.id !== movingWork.id))
    alert('진도가 이동되었습니다!')
  } catch (error) {
    console.error('Move error:', error)
    alert('이동에 실패했습니다')
  }
  setSaving(false)
  }

  async function handleSaveEdits() {
    setSaving(true)
    
    try {
      for (const work of works) {
        if (work.is_custom) {
          await supabase
            .from('sketchbook_works')
            .update({ custom_description: editedWorks[work.id] })
            .eq('id', work.id)
        }
      }
      
      setEditMode(false)
      alert('저장되었습니다!')
    } catch (error) {
      console.error('Save error:', error)
      alert('저장에 실패했습니다')
    }
    
    setSaving(false)
  }

  async function handleDeleteWork(workId: string, workTitle: string | null | undefined) {
    if (isCompleted) {
      if (!confirm(`⚠️ 완료된 스케치북의 작품입니다.\n\n"${workTitle || '제목 없음'}"을(를) 삭제하면 진도 기록이 영구 손실됩니다.\n\n정말 삭제하시겠습니까?`)) return
      if (!confirm(`🚨 마지막 확인: "${workTitle || '제목 없음'}" 작품을 정말 삭제합니까?\n\n이 작업은 되돌릴 수 없습니다.`)) return
    } else {
      if (!confirm(`"${workTitle || '제목 없음'}" 진도를 삭제하시겠습니까?`)) return
    }
  
    setDeleting(workId)
    try {
      const { error } = await supabase
        .from('sketchbook_works')
        .delete()
        .eq('id', workId)
  
      if (error) throw error
  
      setWorks(prev => prev.filter(w => w.id !== workId))
      const newEdited = { ...editedWorks }
      delete newEdited[workId]
      setEditedWorks(newEdited)
    } catch (error) {
      console.error('Delete error:', error)
      alert('삭제에 실패했습니다')
    } finally {
      setDeleting(null)
    }
  }

  async function handleFollowupDone() {
    if (!confirm('후속 작업(출력·리포트)을 완료 처리하시겠습니까?\n\n완료하면 대시보드 관리 목록에서 제외됩니다.')) return

    try {
      const { error } = await supabase
        .from('sketchbooks')
        .update({ followup_done: true })
        .eq('id', sketchbookId)

      if (error) throw error

      setSketchbook(prev => prev ? { ...prev, followup_done: true } : prev)
      alert('후속 작업이 완료 처리되었습니다!')
    } catch (error) {
      console.error('Followup done error:', error)
      alert('처리에 실패했습니다')
    }
  }

  const getWorkDescription = (work: SketchbookWork) => {
    if (editMode) {
      return editedWorks[work.id] || ''
    }
    return work.is_custom 
      ? work.custom_description || ''
      : work.curriculum?.parent_message_template || ''
  }

  const getWorkTitle = (work: SketchbookWork) => {
    return work.is_custom ? work.custom_title : work.curriculum?.title
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

  if (!student || !sketchbook) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-4xl mb-3">😢</p>
          <p className="text-gray-500">데이터를 찾을 수 없습니다</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <header className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-40 border-b border-gray-200/50">
        <div className="max-w-4xl mx-auto px-4 py-3 md:py-4">
          <div className="flex items-center justify-between">
            <button 
              onClick={() => router.push(`/students/${studentId}`)} 
              className="text-gray-500 hover:text-gray-700 transition text-sm md:text-base"
            >
              ← 뒤로
            </button>
            <h1 className="text-base md:text-lg font-bold text-gray-800">스케치북 상세</h1>
            <div className="w-10"></div>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-4 md:py-6">
        {/* ── 스케치북 정보 카드 ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-6 mb-4 md:mb-6">
          <div className="flex items-start gap-3 md:gap-4">
            <div className="w-12 h-12 md:w-14 md:h-14 bg-gradient-to-br from-purple-400 to-pink-500 rounded-xl md:rounded-2xl flex items-center justify-center text-white text-xl md:text-2xl shadow-lg flex-shrink-0">
              📒
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 md:gap-3 mb-1">
                <h2 className="text-base md:text-xl font-bold text-gray-800 break-keep">
                  {student.name} - 스케치북 #{sketchbook.book_number}
                </h2>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${
                  sketchbook.status === 'completed' 
                    ? 'bg-green-50 text-green-600'
                    : 'bg-blue-50 text-blue-600'
                }`}>
                  {sketchbook.status === 'completed' ? '완료' : '진행중'}
                </span>
              </div>
              <p className="text-xs md:text-sm text-gray-500">
                {sketchbook.started_at} ~ {sketchbook.completed_at || '진행중'}
              </p>
              <p className="text-xs md:text-sm text-gray-500 mt-0.5">
                {student.classes?.name || '-'} · 총 {works.length}작품
              </p>
            </div>
          </div>
        </div>

        {/* ── 완료 체크리스트 ── 버튼을 텍스트 아래 별도 줄로 배치 */}
        {sketchbook.status === 'completed' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-5 mb-4 md:mb-6">
            <h3 className="font-semibold text-gray-800 mb-3 md:mb-4">✅ 완료 체크리스트</h3>
            <div className="space-y-2.5 md:space-y-3">
              {/* 1) 진도 기록 확인 */}
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <span className="text-lg md:text-xl flex-shrink-0">📝</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-800 text-sm md:text-base">진도 기록 확인</p>
                  <p className="text-xs text-gray-500">{works.length}개 작품 기록됨</p>
                </div>
                <span className="text-green-500 text-lg flex-shrink-0">✓</span>
              </div>
              
              {/* 2) 작품 설명 출력 */}
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <span className="text-lg md:text-xl flex-shrink-0">🖨️</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-800 text-sm md:text-base">작품 설명 출력</p>
                  <p className="text-xs text-gray-500 hidden md:block">A4 2단으로 출력하여 스케치북에 부착</p>
                </div>
                <button
                  onClick={() => router.push(`/students/${studentId}/sketchbook/${sketchbookId}/print`)}
                  className="px-3 py-1.5 md:px-4 md:py-2 bg-teal-500 text-white rounded-lg text-xs font-medium hover:bg-teal-600 transition active:scale-95 flex-shrink-0"
                >
                  출력
                </button>
              </div>
              
              {/* 3) 성장 리포트 작성 */}
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <span className="text-lg md:text-xl flex-shrink-0">📊</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-800 text-sm md:text-base">성장 리포트 작성</p>
                  <p className="text-xs text-gray-500 hidden md:block">첫 작품 ↔ 마지막 작품 비교 분석</p>
                </div>
                <button
                  onClick={() => router.push(`/reports/new?studentId=${studentId}&sketchbookId=${sketchbookId}`)}
                  className="px-3 py-1.5 md:px-4 md:py-2 bg-purple-500 text-white rounded-lg text-xs font-medium hover:bg-purple-600 transition active:scale-95 flex-shrink-0"
                >
                  작성
                </button>
              </div>

              {/* 4) 후속 작업 완료 */}
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <span className="text-lg md:text-xl flex-shrink-0">✅</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-800 text-sm md:text-base">후속 작업 완료</p>
                  <p className="text-xs text-gray-500">출력·리포트 완료 시 체크하면 관리 목록에서 제외됩니다</p>
                </div>
                {sketchbook.followup_done ? (
                  <span className="px-3 py-1.5 bg-green-50 text-green-600 rounded-lg text-xs font-medium">완료됨 ✓</span>
                ) : (
                  <button
                    onClick={handleFollowupDone}
                    className="px-3 py-1.5 md:px-4 md:py-2 bg-green-500 text-white rounded-lg text-xs font-medium hover:bg-green-600 transition active:scale-95 flex-shrink-0"
                  >
                    완료
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── 진도 목록 ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-visible">
          <div className="px-4 md:px-5 py-3 md:py-4 border-b border-gray-100 flex items-center justify-between gap-2">
            <h3 className="font-semibold text-gray-800 text-sm md:text-base min-w-0 truncate">📋 작품 목록 ({works.length}개)</h3>
            <div className="flex items-center gap-2 flex-shrink-0">
              {editMode ? (
                <>
                  <button
                    onClick={() => setEditMode(false)}
                    className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs md:text-sm font-medium hover:bg-gray-200 transition whitespace-nowrap"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleSaveEdits}
                    disabled={saving}
                    className="px-3 py-1.5 bg-teal-500 text-white rounded-lg text-xs md:text-sm font-medium hover:bg-teal-600 transition disabled:opacity-50 whitespace-nowrap"
                  >
                    {saving ? '저장 중...' : '저장'}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setEditMode(true)}
                  className="px-3 py-1.5 bg-amber-50 text-amber-600 rounded-lg text-xs md:text-sm font-medium hover:bg-amber-100 transition whitespace-nowrap"
                >
                  수정
                </button>
              )}
            </div>
          </div>

          <div className="divide-y divide-gray-100">
            {works.map((work, index) => (
              <div key={work.id} className="p-4 md:p-5">
                <div className="flex items-start gap-3 md:gap-4">
                  <div className="w-7 h-7 md:w-8 md:h-8 bg-teal-100 rounded-lg flex items-center justify-center text-teal-700 font-bold text-xs md:text-sm flex-shrink-0 mt-0.5">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    {/* 제목 + 태그 + 수정/삭제 버튼 */}
                    <div className="flex items-start justify-between gap-2 mb-0.5">
                      <div className="flex flex-wrap items-center gap-1.5 min-w-0 flex-1">
                        <p className="font-medium text-gray-800 text-sm md:text-base break-all">{getWorkTitle(work)}</p>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] md:text-xs font-medium flex-shrink-0 ${
                          work.is_custom ? 'bg-purple-100 text-purple-700' : 'bg-teal-100 text-teal-700'
                        }`}>
                          {work.is_custom ? '자율' : '커리큘럼'}
                        </span>
                      </div>
                      {!editMode && (
                        <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto">
                          {otherSketchbooks.length > 0 && (
                            <button
                              onClick={() => openMoveModal(work)}
                              className="px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 rounded-lg whitespace-nowrap active:bg-blue-100"
                            >
                              이동
                            </button>
                          )}
                          <button
                            onClick={() => setEditMode(true)}
                            className="px-2.5 py-1 text-xs font-medium text-teal-700 bg-teal-50 rounded-lg whitespace-nowrap active:bg-teal-100"
                          >
                            수정
                          </button>
                          <button
                            onClick={() => handleDeleteWork(work.id, getWorkTitle(work))}
                            disabled={deleting === work.id}
                            className="px-2.5 py-1 text-xs font-medium text-red-600 bg-red-50 rounded-lg whitespace-nowrap active:bg-red-100 disabled:opacity-50"
                          >
                            {deleting === work.id ? '...' : '삭제'}
                          </button>
                        </div>
                      )}
                    </div>
                    {/* 날짜: 별도 줄 */}
                    <p className="text-[11px] md:text-xs text-gray-400 mb-2">{work.work_date}</p>
                    
                    {editMode ? (
                      <textarea
                        value={editedWorks[work.id] || ''}
                        onChange={(e) => setEditedWorks({
                          ...editedWorks,
                          [work.id]: e.target.value
                        })}
                        rows={3}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm resize-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                      />
                    ) : (
                      <p className="text-xs md:text-sm text-gray-600 leading-relaxed">
                        {getWorkDescription(work) || '(설명 없음)'}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {works.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <p className="text-4xl mb-3">📝</p>
              <p className="font-medium">작품이 없습니다</p>
            </div>
          )}
        </div>
        </div>

{/* 진도 이동 모달 */}
{showMoveModal && movingWork && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-800">진도 이동</h2>
        <button onClick={() => setShowMoveModal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
      </div>

      <div className="p-6 space-y-4">
        {isCompleted && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
            <p className="text-xs font-medium text-amber-800">⚠️ 완료된 스케치북입니다. 이동 시 진도 기록에서 사라집니다.</p>
          </div>
        )}
        <div className="bg-gray-50 rounded-xl p-3">
          <p className="text-xs text-gray-400 mb-1">이동할 진도</p>
          <p className="text-sm font-semibold text-gray-800">
            {movingWork.is_custom ? movingWork.custom_title : movingWork.curriculum?.title}
          </p>
          <p className="text-xs text-gray-500 mt-1">{movingWork.work_date}</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">이동할 스케치북 선택 *</label>
          <select
            value={moveTargetId}
            onChange={(e) => setMoveTargetId(e.target.value)}
            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm"
          >
            <option value="">선택해주세요</option>
            {otherSketchbooks.map(sb => (
              <option key={sb.id} value={sb.id}>
                스케치북 #{sb.book_number} ({sb.started_at} ~ {sb.completed_at || '진행중'})
                {sb.status === 'active' ? ' [현재]' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="px-6 py-4 border-t border-gray-100 flex gap-2">
        <button
          onClick={() => setShowMoveModal(false)}
          className="flex-1 py-3 rounded-xl text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition"
        >
          취소
        </button>
        <button
          onClick={handleMoveWork}
          disabled={saving || !moveTargetId}
          className="flex-1 py-3 rounded-xl text-sm font-medium bg-blue-500 text-white hover:bg-blue-600 transition disabled:opacity-50"
        >
          {saving ? '이동 중...' : '이동'}
        </button>
      </div>
    </div>
  </div>
)}
</div>
)
}
