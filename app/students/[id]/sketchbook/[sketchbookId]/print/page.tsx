'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Student {
  id: string
  name: string
  classes: { name: string } | null
  branches: { name: string } | null
}

interface Sketchbook {
  id: string
  book_number: number
  started_at: string
  completed_at: string | null
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

export default function SketchbookPrintPage() {
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
  const [editedWorks, setEditedWorks] = useState<{[key: string]: { title: string, description: string }}>({})

  useEffect(() => {
    if (studentId && sketchbookId) loadData()
  }, [studentId, sketchbookId])

  async function loadData() {
    // 학생 정보
    const { data: studentData } = await supabase
      .from('students')
      .select('id, name, classes(name), branches(name)')
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
      const initialEdits: {[key: string]: { title: string, description: string }} = {}
      worksWithCurriculum.forEach(work => {
        initialEdits[work.id] = {
          title: work.is_custom ? work.custom_title || '' : work.curriculum?.title || '',
          description: work.is_custom 
            ? work.custom_description || ''
            : work.curriculum?.parent_message_template || ''
        }
      })
      setEditedWorks(initialEdits)
    }

    setLoading(false)
  }

  // 인쇄
  const handlePrint = () => {
    window.print()
  }

  // 작품 제목/설명 가져오기
  const getWorkTitle = (work: SketchbookWork) => {
    return editedWorks[work.id]?.title || 
      (work.is_custom ? work.custom_title : work.curriculum?.title) || ''
  }

  const getWorkDescription = (work: SketchbookWork) => {
    return editedWorks[work.id]?.description || 
      (work.is_custom ? work.custom_description : work.curriculum?.parent_message_template) || ''
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

  // 페이지당 10개 작품 (2단 × 5행)
  const worksPerPage = 10
  const totalPages = Math.ceil(works.length / worksPerPage)
  const pages = Array.from({ length: totalPages }, (_, i) => 
    works.slice(i * worksPerPage, (i + 1) * worksPerPage)
  )

  return (
    <div className="min-h-screen bg-gray-100">
      {/* 컨트롤 바 (인쇄 시 숨김) */}
      <div className="print:hidden sticky top-0 bg-white border-b border-gray-200 px-4 py-3 z-10">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between">
            <button
              onClick={() => router.back()}
              className="text-gray-500 hover:text-gray-700 font-medium text-sm shrink-0"
            >
              ← 뒤로
            </button>
            <h1 className="font-bold text-gray-800 text-sm md:text-base truncate mx-2">작품 설명 출력 미리보기</h1>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => setEditMode(!editMode)}
                className={`px-3 py-1.5 rounded-lg text-xs md:text-sm font-medium transition ${
                  editMode 
                    ? 'bg-amber-500 text-white' 
                    : 'bg-amber-50 text-amber-600 hover:bg-amber-100'
                }`}
              >
                {editMode ? '수정 완료' : '수정'}
              </button>
              <button
                onClick={handlePrint}
                className="px-3 py-1.5 bg-teal-500 text-white rounded-lg text-xs md:text-sm font-medium hover:bg-teal-600 transition"
              >
                🖨️ 인쇄
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 안내 메시지 */}
      <div className="print:hidden max-w-4xl mx-auto px-4 py-4">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-sm text-amber-800">
            ⚠️ <strong>인쇄 전 확인:</strong> 필요시 "수정" 버튼을 눌러 내용을 수정할 수 있습니다. 
            인쇄 시 A4 용지에 2단으로 출력됩니다.
          </p>
        </div>
      </div>

      {/* 출력 영역 */}
      <div className="print:p-0 p-4">
        {pages.map((pageWorks, pageIndex) => (
          <div 
            key={pageIndex}
            className="print-page bg-white mx-auto mb-8 print:mb-0 print:page-break-after-always shadow-lg print:shadow-none max-w-full"
            style={{ 
              width: '210mm', 
              minHeight: 'auto',
              padding: '15mm'
            }}
          >
            {/* 페이지 헤더 */}
            <div className="text-center mb-6 pb-4 border-b-2 border-teal-500">
              <h1 className="text-xl font-bold text-gray-800 mb-1">📒 스케치북 작품 설명</h1>
              <p className="text-sm text-gray-600">
                {student.name} | {student.classes?.name || '-'} | 스케치북 #{sketchbook.book_number}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {sketchbook.started_at} ~ {sketchbook.completed_at || '진행중'}
                {totalPages > 1 && ` (${pageIndex + 1}/${totalPages})`}
              </p>
            </div>

            {/* 2단 레이아웃 */}
            <div className="grid grid-cols-2 gap-4">
              {pageWorks.map((work, index) => {
                const workNumber = pageIndex * worksPerPage + index + 1
                return (
                  <div 
                    key={work.id} 
                    className="border border-gray-200 rounded-lg p-3"
                    style={{ minHeight: '45mm' }}
                  >
                    {/* 작품 번호 & 제목 */}
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-6 h-6 bg-teal-100 rounded flex items-center justify-center text-xs font-bold text-teal-700">
                        {workNumber}
                      </span>
                      {editMode ? (
                        <input
                          type="text"
                          value={editedWorks[work.id]?.title || ''}
                          onChange={(e) => setEditedWorks({
                            ...editedWorks,
                            [work.id]: { ...editedWorks[work.id], title: e.target.value }
                          })}
                          className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm font-semibold"
                        />
                      ) : (
                        <span className="font-semibold text-gray-800 text-sm flex-1 truncate">
                          {getWorkTitle(work)}
                        </span>
                      )}
                    </div>
                    
                    {/* 작품 설명 */}
                    {editMode ? (
                      <textarea
                        value={editedWorks[work.id]?.description || ''}
                        onChange={(e) => setEditedWorks({
                          ...editedWorks,
                          [work.id]: { ...editedWorks[work.id], description: e.target.value }
                        })}
                        rows={4}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-xs resize-none"
                      />
                    ) : (
                      <p className="text-xs text-gray-600 leading-relaxed">
                        {getWorkDescription(work) || '(설명 없음)'}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>

            {/* 페이지 푸터 */}
            <div className="mt-6 pt-4 border-t border-gray-200 text-center">
              <p className="text-xs text-gray-400">
                © {student.branches?.name || '그리마미술'} | 본 자료의 무단 복제를 금합니다.
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* 인쇄 스타일 */}
      <style jsx global>{`
        @media screen and (max-width: 768px) {
          .print-page {
            width: 100% !important;
            min-height: auto !important;
            padding: 16px !important;
          }
        }
        @media print {
          @page {
            size: A4;
            margin: 0;
          }
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .print-page {
            width: 210mm !important;
            min-height: 297mm !important;
            padding: 15mm !important;
          }
          .print\\:hidden {
            display: none !important;
          }
          .print\\:page-break-after-always {
            page-break-after: always;
          }
          .print\\:page-break-after-always:last-child {
            page-break-after: avoid;
          }
        }
      `}</style>
    </div>
  )
}
