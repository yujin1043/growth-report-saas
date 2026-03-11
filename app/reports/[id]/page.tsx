'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Report {
  id: string
  period_start: string
  period_end: string
  image_before_url: string
  image_after_url: string
  content_form: string
  content_color: string
  content_expression: string
  content_strength: string
  content_attitude: string
  content_direction: string
  created_at: string
  student_id: string
  created_by: string
}

interface Student {
  id: string
  student_code: string
  name: string
  birth_year: number
  branch_id: string
  classes: {
    name: string
  } | null
}

// Storage URL에서 파일 경로 추출
function extractStoragePath(url: string | null): string | null {
  if (!url) return null
  try {
    const match = url.match(/\/storage\/v1\/object\/public\/artworks\/(.+)/)
    return match ? match[1] : null
  } catch {
    return null
  }
}

export default function ReportDetailPage() {
  const router = useRouter()
  const params = useParams()
  const reportId = params.id as string

  const [report, setReport] = useState<Report | null>(null)
  const [student, setStudent] = useState<Student | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)

  const currentYear = new Date().getFullYear()
  const mainColor = '#49AECD'

  useEffect(() => {
    if (reportId) loadReport()
  }, [reportId])

  async function loadReport() {
    const { data: reportData } = await supabase
      .from('reports')
      .select('*')
      .eq('id', reportId)
      .single()

    if (!reportData) {
      setLoading(false)
      return
    }

    setReport(reportData)

    if (reportData.student_id) {
      const { data: studentData } = await supabase
        .from('students')
        .select('id, student_code, name, birth_year, branch_id, classes(name)')
        .eq('id', reportData.student_id)
        .single()

      if (studentData) {
        setStudent({
          ...studentData,
          classes: Array.isArray(studentData.classes)
            ? studentData.classes[0] || null
            : studentData.classes
        })
      }
    }

    setLoading(false)
  }

  // ✅ Storage 이미지도 함께 삭제
  async function handleDelete() {
    if (!confirm('이 리포트를 삭제하시겠습니까?\n\n⚠️ 삭제된 리포트와 작품 이미지는 복구할 수 없습니다.')) return

    setDeleting(true)

    try {
      const imagePaths: string[] = []
      const beforePath = extractStoragePath(report?.image_before_url || null)
      const afterPath = extractStoragePath(report?.image_after_url || null)
      if (beforePath) imagePaths.push(beforePath)
      if (afterPath) imagePaths.push(afterPath)

      if (imagePaths.length > 0) {
        const { error: storageError } = await supabase.storage
          .from('artworks')
          .remove(imagePaths)
        if (storageError) {
          console.warn('이미지 삭제 실패 (리포트 삭제는 계속 진행):', storageError)
        }
      }

      const { error } = await supabase
        .from('reports')
        .delete()
        .eq('id', reportId)

      if (error) {
        alert('삭제 실패: ' + error.message)
        setDeleting(false)
        return
      }

      alert('리포트가 삭제되었습니다.')
      if (report?.student_id) {
        router.push(`/students/${report.student_id}`)
      } else {
        router.push('/reports')
      }
    } catch (err) {
      console.error('삭제 오류:', err)
      alert('삭제 중 오류가 발생했습니다. 다시 시도해주세요.')
      setDeleting(false)
    }
  }

  const getAge = (birthYear: number) => currentYear - birthYear + 1

  const handlePrint = () => {
    const reportDate = new Date(report?.created_at || new Date())
    const dateStr = `${reportDate.getFullYear()}${String(reportDate.getMonth() + 1).padStart(2, '0')}${String(reportDate.getDate()).padStart(2, '0')}`
    const fileName = `${student?.name || '학생'}_${dateStr}`
    document.title = fileName
    window.print()
    document.title = '그리마노트'
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto mb-4" style={{ borderColor: mainColor }}></div>
          <p className="text-gray-500">로딩 중...</p>
        </div>
      </div>
    )
  }

  if (!report) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-4xl mb-3">😢</p>
          <p className="text-gray-500">리포트를 찾을 수 없습니다</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <style jsx global>{`
        @media print {
          body * { visibility: hidden; }
          #print-area, #print-area * { visibility: visible; }
          #print-area { position: absolute; left: 0; top: 0; width: 210mm; }
          .no-print { display: none !important; }
          .print-page { 
            width: 210mm !important; 
            min-height: 297mm !important; 
            padding: 15mm 20mm !important;
            margin: 0 !important;
            box-shadow: none !important;
          }
          @page { size: A4; margin: 0; }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
        }
        body { font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; }
      `}</style>

      <div className="min-h-screen bg-gradient-to-br from-gray-100 to-gray-200">

        {/* 헤더 */}
        <header className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-40 border-b border-gray-200/50 no-print">
          <div className="max-w-4xl mx-auto px-4 py-3 md:py-4">
            <div className="flex items-center justify-between">
              <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700 transition text-sm md:text-base">
                ← 뒤로
              </button>
              <h1 className="text-base md:text-lg font-bold text-gray-800">성장 리포트</h1>
              <div className="flex gap-3">
                <button
                  onClick={() => router.push(`/reports/${reportId}/edit`)}
                  style={{ color: mainColor }}
                  className="hover:opacity-80 text-sm font-medium transition"
                >
                  수정
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-gray-400 hover:text-red-500 text-sm font-medium transition"
                >
                  {deleting ? '삭제 중...' : '삭제'}
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* 프린트 영역 */}
        <div id="print-area" className="mx-auto my-4 md:my-6 px-4" style={{ maxWidth: '210mm' }}>

          {/* 1페이지 */}
          <div className="print-page bg-white shadow-lg rounded-lg" style={{ padding: '28px' }}>

            {/* 로고 & 타이틀 */}
            <div className="mb-6">
              <div className="mb-3">
                <img
                  loading="lazy" decoding="async" src="/logo.jpg"
                  alt="그리마미술 로고"
                  style={{ height: '28px', width: 'auto' }}
                />
              </div>
              <div className="text-center">
                <h1 className="font-bold" style={{ color: mainColor, fontSize: '20pt' }}>성장 리포트</h1>
              </div>
            </div>

            {/* 학생 정보 카드 */}
            <div className="mb-5">
              <h3 className="font-semibold mb-2 flex items-center gap-1" style={{ color: mainColor, fontSize: '14pt' }}>
                <span>👤</span> 학생 정보
              </h3>
              <div className="rounded-xl p-4" style={{ backgroundColor: `${mainColor}10`, border: `1px solid ${mainColor}30` }}>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div>
                    <p className="font-medium text-gray-600 mb-0.5" style={{ fontSize: '11pt' }}>이름</p>
                    <p className="font-semibold text-gray-800" style={{ fontSize: '11pt' }}>{student?.name || '-'}</p>
                  </div>
                  <div>
                    <p className="font-medium text-gray-600 mb-0.5" style={{ fontSize: '11pt' }}>연령</p>
                    <p className="font-semibold text-gray-800" style={{ fontSize: '11pt' }}>{student?.birth_year ? getAge(student.birth_year) + '세' : '-'}</p>
                  </div>
                  <div>
                    <p className="font-medium text-gray-600 mb-0.5" style={{ fontSize: '11pt' }}>반</p>
                    <p className="font-semibold text-gray-800" style={{ fontSize: '11pt' }}>{student?.classes?.name || '-'}</p>
                  </div>
                  <div>
                    <p className="font-medium text-gray-600 mb-0.5" style={{ fontSize: '11pt' }}>지도 기간</p>
                    <p className="font-semibold text-gray-800" style={{ fontSize: '11pt' }}>{report.period_start} ~ {report.period_end}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* 작품 비교 */}
            <div className="mb-5">
              <h3 className="font-semibold mb-2 flex items-center gap-1" style={{ color: mainColor, fontSize: '14pt' }}>
                <span>📷</span> 작품 비교
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center">
                  <p className="font-medium text-gray-600 mb-1" style={{ fontSize: '11pt' }}>이전</p>
                  <div className="bg-gray-50 rounded-lg overflow-hidden border border-gray-100 flex items-center justify-center" style={{ height: '240px' }}>
                    {report.image_before_url ? (
                      <img loading="lazy" decoding="async" src={report.image_before_url} alt="이전" style={{ maxHeight: '230px', maxWidth: '100%', objectFit: 'contain' }} />
                    ) : (
                      <span className="text-3xl text-gray-300">🖼️</span>
                    )}
                  </div>
                </div>
                <div className="text-center">
                  <p className="font-medium text-gray-600 mb-1" style={{ fontSize: '11pt' }}>최근</p>
                  <div className="bg-gray-50 rounded-lg overflow-hidden border border-gray-100 flex items-center justify-center" style={{ height: '240px' }}>
                    {report.image_after_url ? (
                      <img loading="lazy" decoding="async" src={report.image_after_url} alt="최근" style={{ maxHeight: '230px', maxWidth: '100%', objectFit: 'contain' }} />
                    ) : (
                      <span className="text-3xl text-gray-300">🖼️</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 작품 변화 */}
            <div className="mb-5">
              <h3 className="font-semibold mb-2 flex items-center gap-1" style={{ color: mainColor, fontSize: '14pt' }}>
                <span>✨</span> 작품 변화
              </h3>
              <div className="space-y-2">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="font-semibold text-gray-700 mb-1" style={{ fontSize: '11pt' }}>형태</p>
                  <p className="text-gray-600 leading-relaxed" style={{ fontSize: '11pt' }}>{report.content_form || '-'}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="font-semibold text-gray-700 mb-1" style={{ fontSize: '11pt' }}>색채</p>
                  <p className="text-gray-600 leading-relaxed" style={{ fontSize: '11pt' }}>{report.content_color || '-'}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="font-semibold text-gray-700 mb-1" style={{ fontSize: '11pt' }}>표현</p>
                  <p className="text-gray-600 leading-relaxed" style={{ fontSize: '11pt' }}>{report.content_expression || '-'}</p>
                </div>
              </div>
            </div>

            {/* 선생님 코멘트 */}
            <div className="mb-5">
              <h3 className="font-semibold mb-2 flex items-center gap-1" style={{ color: mainColor, fontSize: '14pt' }}>
                <span>💬</span> 선생님 코멘트
              </h3>
              <div className="space-y-2">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="font-semibold text-gray-700 mb-1" style={{ fontSize: '11pt' }}>강점</p>
                  <p className="text-gray-600 leading-relaxed" style={{ fontSize: '11pt' }}>{report.content_strength || '-'}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="font-semibold text-gray-700 mb-1" style={{ fontSize: '11pt' }}>수업 태도 및 감성</p>
                  <p className="text-gray-600 leading-relaxed" style={{ fontSize: '11pt' }}>{report.content_attitude || '-'}</p>
                </div>
                <div className="rounded-lg p-3" style={{ backgroundColor: `${mainColor}10`, border: `1px solid ${mainColor}30` }}>
                  <p className="font-semibold mb-1" style={{ color: mainColor, fontSize: '11pt' }}>향후 지도 방향</p>
                  <p className="text-gray-600 leading-relaxed" style={{ fontSize: '11pt' }}>{report.content_direction || '-'}</p>
                </div>
              </div>
            </div>

            {/* 푸터 */}
            <div className="text-center text-gray-300 mt-6" style={{ fontSize: '9pt' }}>
              ⓒ 2026. 그리마미술 INC. All rights reserved.
            </div>
          </div>

        </div>

        {/* 하단 버튼 */}
        <div className="max-w-4xl mx-auto px-4 py-6 no-print">
          <div className="flex gap-3">
            <button
              onClick={() => router.back()}
              className="flex-1 bg-white text-gray-600 py-3 rounded-2xl font-medium hover:bg-gray-50 transition border border-gray-200"
            >
              ← 돌아가기
            </button>
            <button
              onClick={handlePrint}
              className="flex-1 text-white py-3 rounded-2xl font-medium hover:opacity-90 transition shadow-lg"
              style={{ backgroundColor: mainColor }}
            >
              🖨️ 인쇄 / PDF 저장
            </button>
          </div>
        </div>

      </div>
    </>
  )
}
