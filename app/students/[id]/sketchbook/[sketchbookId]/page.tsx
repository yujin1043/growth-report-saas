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

  useEffect(() => {
    if (studentId && sketchbookId) loadData()
  }, [studentId, sketchbookId])

  async function loadData() {
    // 학생 정보
    const { data: studentData } = await supabase
      .from('students')
      .select('id, name, birth_year, classes(name)')
      .eq('id', studentId)
      .single()

    if (studentData) {
      setStudent({
        ...studentData,
        classes: Array.isArray(studentData.classes) 
          ? studentData.classes[0] || null 
          : studentData.classes
      })
    }

    // 스케치북 정보
    const { data: sketchbookData } = await supabase
      .from('sketchbooks')
      .select('*')
      .eq('id', sketchbookId)
      .single()

    if (sketchbookData) setSketchbook(sketchbookData)

    // 진도 목록
    const { data: worksData } = await supabase
      .from('sketchbook_works')
      .select('id, work_date, curriculum_id, is_custom, custom_title, custom_description')
      .eq('sketchbook_id', sketchbookId)
      .order('work_date', { ascending: true })

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

      setWorks(worksWithCurriculum)

      // 편집용 초기값 설정
      const initialEdits: {[key: string]: string} = {}
      worksWithCurriculum.forEach(work => {
        initialEdits[work.id] = work.is_custom 
          ? work.custom_description || ''
          : work.curriculum?.parent_message_template || ''
      })
      setEditedWorks(initialEdits)
    }

    setLoading(false)
  }

  // 편집 내용 저장
  async function handleSaveEdits() {
    setSaving(true)
    
    try {
      for (const work of works) {
        if (work.is_custom) {
          // 자율 수업은 custom_description 업데이트
          await supabase
            .from('sketchbook_works')
            .update({ custom_description: editedWorks[work.id] })
            .eq('id', work.id)
        }
        // 커리큘럼 수업은 원본 유지 (출력 시 editedWorks 값 사용)
      }
      
      setEditMode(false)
      alert('저장되었습니다!')
    } catch (error) {
      console.error('Save error:', error)
      alert('저장에 실패했습니다')
    }
    
    setSaving(false)
  }

  // 작품 설명 가져오기
  const getWorkDescription = (work: SketchbookWork) => {
    if (editMode) {
      return editedWorks[work.id] || ''
    }
    return work.is_custom 
      ? work.custom_description || ''
      : work.curriculum?.parent_message_template || ''
  }

  // 작품 제목 가져오기
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
        {/* 스케치북 정보 카드 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 md:p-6 mb-4 md:mb-6">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 bg-gradient-to-br from-purple-400 to-pink-500 rounded-2xl flex items-center justify-center text-white text-2xl shadow-lg">
              📒
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-xl font-bold text-gray-800">
                  {student.name} - 스케치북 #{sketchbook.book_number}
                </h2>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  sketchbook.status === 'completed' 
                    ? 'bg-green-50 text-green-600'
                    : 'bg-blue-50 text-blue-600'
                }`}>
                  {sketchbook.status === 'completed' ? '완료' : '진행중'}
                </span>
              </div>
              <p className="text-sm text-gray-500">
                {sketchbook.started_at} ~ {sketchbook.completed_at || '진행중'}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {student.classes?.name || '-'} · 총 {works.length}작품
              </p>
            </div>
          </div>
        </div>

        {/* 완료 체크리스트 (완료된 스케치북만) */}
        {sketchbook.status === 'completed' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-4 md:mb-6">
            <h3 className="font-semibold text-gray-800 mb-4">✅ 완료 체크리스트</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <span className="text-xl">📝</span>
                  <div>
                    <p className="font-medium text-gray-800">진도 기록 확인</p>
                    <p className="text-xs text-gray-500">{works.length}개 작품 기록됨</p>
                  </div>
                </div>
                <span className="text-green-500 text-xl">✓</span>
              </div>
              
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <span className="text-xl">🖨️</span>
                  <div>
                    <p className="font-medium text-gray-800">작품 설명 출력</p>
                    <p className="text-xs text-gray-500">A4 2단으로 출력하여 스케치북에 부착</p>
                  </div>
                </div>
                <button
                  onClick={() => router.push(`/students/${studentId}/sketchbook/${sketchbookId}/print`)}
                  className="px-4 py-2 bg-teal-500 text-white rounded-lg text-sm font-medium hover:bg-teal-600 transition"
                >
                  출력하기
                </button>
              </div>
              
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <span className="text-xl">📊</span>
                  <div>
                    <p className="font-medium text-gray-800">성장 리포트 작성</p>
                    <p className="text-xs text-gray-500">첫 작품 ↔ 마지막 작품 비교 분석</p>
                  </div>
                </div>
                <button
                  onClick={() => router.push(`/reports/new?studentId=${studentId}&sketchbookId=${sketchbookId}`)}
                  className="px-4 py-2 bg-purple-500 text-white rounded-lg text-sm font-medium hover:bg-purple-600 transition"
                >
                  작성하기
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 진도 목록 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">📋 작품 목록 ({works.length}개)</h3>
            <div className="flex items-center gap-2">
              {editMode ? (
                <>
                  <button
                    onClick={() => setEditMode(false)}
                    className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200 transition"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleSaveEdits}
                    disabled={saving}
                    className="px-3 py-1.5 bg-teal-500 text-white rounded-lg text-sm font-medium hover:bg-teal-600 transition disabled:opacity-50"
                  >
                    {saving ? '저장 중...' : '저장'}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setEditMode(true)}
                  className="px-3 py-1.5 bg-amber-50 text-amber-600 rounded-lg text-sm font-medium hover:bg-amber-100 transition"
                >
                  수정
                </button>
              )}
            </div>
          </div>

          <div className="divide-y divide-gray-100">
            {works.map((work, index) => (
              <div key={work.id} className="p-5">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-teal-100 rounded-lg flex items-center justify-center text-teal-700 font-bold text-sm flex-shrink-0">
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <p className="font-medium text-gray-800">{getWorkTitle(work)}</p>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        work.is_custom ? 'bg-purple-100 text-purple-700' : 'bg-teal-100 text-teal-700'
                      }`}>
                        {work.is_custom ? '자율' : '커리큘럼'}
                      </span>
                      <span className="text-xs text-gray-400">{work.work_date}</span>
                    </div>
                    
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
                      <p className="text-sm text-gray-600 leading-relaxed">
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
    </div>
  )
}
