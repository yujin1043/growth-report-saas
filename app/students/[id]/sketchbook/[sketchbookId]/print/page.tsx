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

  useEffect(() => {
    if (studentId && sketchbookId) loadData()
  }, [studentId, sketchbookId])

  async function loadData() {
    try {
      const [studentResult, sketchbookResult, worksResult] = await Promise.all([
        supabase.from('students').select('id, name, classes(name), branches(name)').eq('id', studentId).single(),
        supabase.from('sketchbooks').select('*').eq('id', sketchbookId).single(),
        supabase.from('sketchbook_works').select('id, work_date, curriculum_id, is_custom, custom_title, custom_description, sort_order').eq('sketchbook_id', sketchbookId).order('sort_order', { ascending: true })
      ])

      if (studentResult.data) {
        setStudent({
          ...studentResult.data,
          classes: Array.isArray(studentResult.data.classes) 
            ? studentResult.data.classes[0] || null 
            : studentResult.data.classes,
          branches: Array.isArray(studentResult.data.branches) 
            ? studentResult.data.branches[0] || null 
            : studentResult.data.branches
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

        setWorks(worksResult.data.map(work => ({
          ...work,
          curriculum: work.curriculum_id ? curriculumMap.get(work.curriculum_id) : null
        })))
      }
    } catch (error) {
      console.error('Load error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handlePrint = () => {
    const today = new Date()
    const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`
    document.title = `작품설명_${student?.name || '학생'}_${dateStr}`
    window.print()
    document.title = '작품 설명 출력'
  }

  const getWorkTitle = (work: SketchbookWork) => {
    return (work.is_custom ? work.custom_title : work.curriculum?.title) || ''
  }

  const getWorkDescription = (work: SketchbookWork) => {
    if (work.custom_description) return work.custom_description
    return (work.is_custom ? '' : work.curriculum?.parent_message_template) || ''
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
    <div className="min-h-screen bg-gray-100 print:bg-white print:min-h-0">
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
            <button
              onClick={handlePrint}
              className="px-3 py-1.5 bg-teal-500 text-white rounded-lg text-xs md:text-sm font-medium hover:bg-teal-600 transition shrink-0"
            >
              🖨️ 인쇄
            </button>
          </div>
        </div>
      </div>

      {/* 안내 메시지 */}
      <div className="print:hidden max-w-4xl mx-auto px-4 py-4">
        <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
          <p className="text-sm text-teal-800">
            💡 <strong>안내:</strong> 내용 수정은 학생 상세페이지의 스케치북 관리에서 할 수 있습니다. 
            인쇄 시 A4 용지에 2단으로 출력됩니다.
          </p>
        </div>
      </div>

      {/* 출력 영역 */}
      <div className="print:p-0 p-4">
        <div 
          className="print-area bg-white mx-auto shadow-lg print:shadow-none max-w-full"
          style={{ 
            width: '210mm',
            padding: '12mm 15mm'
          }}
        >
          {/* 헤더 - 1회만 */}
          <div className="text-center mb-5 pb-3 border-b-2 border-teal-500">
            <h1 className="text-xl font-bold text-gray-800 mb-1">📒 스케치북 작품 설명</h1>
            <p className="text-sm text-gray-600">
              {student.name} | {student.classes?.name || '-'} | 스케치북 #{sketchbook.book_number}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {sketchbook.started_at} ~ {sketchbook.completed_at || '진행중'} ({Math.ceil(works.length / 2)}장)
            </p>
          </div>

          {/* 2단 레이아웃 - 연속 흐름 */}
          <div className="print-grid">
            {works.map((work, index) => (
              <div 
                key={work.id} 
                className="print-card border border-gray-300 rounded-lg p-3"
              >
                {/* 작품 제목 */}
                <div className="mb-2">
                  <span className="font-semibold text-gray-800 text-sm break-words leading-snug">
                    {getWorkTitle(work)}
                  </span>
                </div>
                
                {/* 작품 설명 */}
                <p className="text-xs text-gray-600 leading-relaxed">
                  {getWorkDescription(work) || '(설명 없음)'}
                </p>
              </div>
            ))}
          </div>

          {/* 푸터 - 1회만 */}
          <div className="mt-5 pt-3 border-t border-gray-200 text-center">
            <p className="text-xs text-gray-400">
              © {student.branches?.name || '그리마미술'} | 본 자료의 무단 복제를 금합니다.
            </p>
          </div>
        </div>
      </div>

      {/* 인쇄 스타일 */}
      <style jsx global>{`
        .print-grid {
          columns: 2;
          column-gap: 16px;
        }
        .print-card {
          break-inside: avoid;
          margin-bottom: 12px;
        }
        @media screen and (max-width: 768px) {
          .print-area {
            width: 100% !important;
            padding: 16px !important;
          }
          .print-grid {
            columns: 1;
          }
        }
        @media print {
          @page {
            size: A4;
            margin: 10mm 15mm;
          }
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            background: white !important;
          }
          .print\\:hidden {
            display: none !important;
          }
          nav, header, .sidebar, [class*="AdminLayout"] {
            display: none !important;
          }
          html, body, div {
            background: white !important;
            background-color: white !important;
          }
          .print-area {
            width: 100% !important;
            padding: 0 !important;
            box-shadow: none !important;
          }
          .print-grid {
            columns: 2;
            column-gap: 14px;
          }
          .print-card {
            break-inside: avoid;
            margin-bottom: 10px;
            border-width: 1px;
          }
        }
      `}</style>
    </div>
  )
}
