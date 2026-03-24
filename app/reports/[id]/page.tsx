'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import html2canvas from 'html2canvas-pro'
import jsPDF from 'jspdf'

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

function extractStoragePath(url: string | null): string | null {
  if (!url) return null
  try {
    const match = url.match(/\/storage\/v1\/object\/public\/artworks\/(.+)/)
    return match ? match[1] : null
  } catch {
    return null
  }
}

// 이미지를 압축 dataURL로 변환
function compressToPrintSrc(url: string, maxSize: number, quality: number): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      let { width, height } = img
      if (width > maxSize || height > maxSize) {
        if (width > height) { height = Math.round(height * maxSize / width); width = maxSize }
        else { width = Math.round(width * maxSize / height); height = maxSize }
      }
      const c = document.createElement('canvas')
      c.width = width; c.height = height
      const ctx = c.getContext('2d')
      if (ctx) { ctx.drawImage(img, 0, 0, width, height); resolve(c.toDataURL('image/jpeg', quality)) }
      else resolve(url)
    }
    img.onerror = () => resolve(url)
    img.src = url
  })
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

    if (!reportData) { setLoading(false); return }
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
            ? studentData.classes[0] || null : studentData.classes
        })
      }
    }
    setLoading(false)
  }

  async function handleDelete() {
    if (!confirm('이 리포트를 삭제하시겠습니까?\n\n⚠️ 삭제된 리포트와 작품 이미지는 복구할 수 없습니다.')) return
    setDeleting(true)
    try {
      const imagePaths: string[] = []
      const bp = extractStoragePath(report?.image_before_url || null)
      const ap = extractStoragePath(report?.image_after_url || null)
      if (bp) imagePaths.push(bp)
      if (ap) imagePaths.push(ap)
      if (imagePaths.length > 0) {
        await supabase.storage.from('artworks').remove(imagePaths)
      }
      const { error } = await supabase.from('reports').delete().eq('id', reportId)
      if (error) { alert('삭제 실패: ' + error.message); setDeleting(false); return }
      alert('리포트가 삭제되었습니다.')
      report?.student_id ? router.push(`/students/${report.student_id}`) : router.push('/reports')
    } catch {
      alert('삭제 중 오류가 발생했습니다.')
      setDeleting(false)
    }
  }

  const getAge = (birthYear: number) => currentYear - birthYear + 1

  const handlePrint = async () => {
    if (!report) return

    let imgBefore = ''
    let imgAfter = ''
    if (report.image_before_url) {
      imgBefore = await compressToPrintSrc(report.image_before_url, 700, 0.65)
    }
    if (report.image_after_url) {
      imgAfter = await compressToPrintSrc(report.image_after_url, 700, 0.65)
    }

    const studentName = student?.name || '-'
    const studentAge = student?.birth_year ? getAge(student.birth_year) + '세' : '-'
    const cn = student?.classes?.name || '-'
    const reportDate = new Date(report.created_at || new Date())
    const dateStr = `${reportDate.getFullYear()}${String(reportDate.getMonth() + 1).padStart(2, '0')}${String(reportDate.getDate()).padStart(2, '0')}`
    const fileName = `${studentName}_${dateStr}`

    const imgTag = (src: string, alt: string) => src
      ? `<img src="${src}" alt="${alt}" style="max-height:200px;max-width:100%;object-fit:contain;" />`
      : `<div style="color:#ccc;font-size:24px;">🖼️</div>`

    const section = (label: string, text: string, highlight?: boolean) => `
      <div style="background:${highlight ? mainColor + '10' : '#f9fafb'};${highlight ? 'border:1px solid ' + mainColor + '30;' : ''}border-radius:4px;padding:5px 10px;margin-bottom:3px;">
        <p style="font-weight:600;color:${highlight ? mainColor : '#374151'};font-size:10pt;margin:0 0 1px;">${label}</p>
        <p style="color:#4b5563;font-size:10pt;line-height:1.45;margin:0;font-weight:600;">${text || '-'}</p>
      </div>`

    const html = `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=794">
<title>${fileName}</title>
<style>
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
  @page { size: A4; margin: 0; }
  html, body { margin: 0; padding: 0; width: 210mm; font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { width: 210mm; padding: 12mm 16mm 10mm 16mm; margin: 0 auto; }

  .info-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; text-align: center; }
  .info-label { font-size: 9pt; color: #6b7280; margin-bottom: 1px; }
  .info-value { font-size: 10pt; font-weight: 700; color: #1f2937; }
  .photo-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .photo-box {
    background: #f9fafb; border: 1px solid #f3f4f6; border-radius: 6px;
    height: 210px; display: flex; align-items: center; justify-content: center; overflow: hidden;
  }
  .photo-label { text-align: center; font-size: 9pt; color: #6b7280; margin-bottom: 2px; }
  .section-title {
    font-size: 12pt; font-weight: 600; color: ${mainColor};
    margin-bottom: 3px; display: flex; align-items: center; gap: 4px;
  }
  </style>

  </head>
  <body>
  <div class="page">
  <div style="margin-bottom:8px;">
    <img src="/logo.jpg" style="height:24px;margin-bottom:4px;" />
    <div style="text-align:center;">
      <h1 style="font-size:18pt;font-weight:700;color:${mainColor};margin:0;">성장 리포트</h1>
    </div>
  </div>
  <div style="margin-bottom:8px;">
    <div class="section-title"><span>👤</span> 학생 정보</div>
    <div style="background:${mainColor}10;border:1px solid ${mainColor}30;border-radius:6px;padding:6px 10px;">
      <div class="info-grid">
        <div><p class="info-label">이름</p><p class="info-value">${studentName}</p></div>
        <div><p class="info-label">연령</p><p class="info-value">${studentAge}</p></div>
        <div><p class="info-label">반</p><p class="info-value">${cn}</p></div>
        <div><p class="info-label">지도 기간</p><p class="info-value">${report.period_start} ~ ${report.period_end}</p></div>
      </div>
    </div>
  </div>
  <div style="margin-bottom:8px;">
    <div class="section-title"><span>📷</span> 작품 비교</div>
    <div class="photo-grid">
      <div><p class="photo-label">이전</p><div class="photo-box">${imgTag(imgBefore, '이전')}</div></div>
      <div><p class="photo-label">최근</p><div class="photo-box">${imgTag(imgAfter, '최근')}</div></div>
    </div>
  </div>
  <div style="margin-bottom:8px;">
    <div class="section-title"><span>✨</span> 작품 변화</div>
    ${section('형태', report.content_form)}
    ${section('색채', report.content_color)}
    ${section('표현', report.content_expression)}
  </div>
  <div style="margin-bottom:4px;">
    <div class="section-title"><span>💬</span> 선생님 코멘트</div>
    ${section('강점', report.content_strength)}
    ${section('수업 태도 및 감성', report.content_attitude)}
    ${section('향후 지도 방향', report.content_direction, true)}
  </div>
  <div style="text-align:center;color:#d1d5db;font-size:7.5pt;margin-top:6px;">
    ⓒ 2026. 그리마미술 INC. All rights reserved.
  </div>
  </div>

</body>
</html>`

const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)

if (isMobile) {
  const pdfIframe = document.createElement('iframe')
  pdfIframe.style.position = 'fixed'
  pdfIframe.style.left = '0'
  pdfIframe.style.top = '0'
  pdfIframe.style.width = '794px'
  pdfIframe.style.height = '1123px'
  pdfIframe.style.zIndex = '-1'
  pdfIframe.style.opacity = '0'
  document.body.appendChild(pdfIframe)

  const pdfDoc = pdfIframe.contentDocument || pdfIframe.contentWindow?.document
  if (!pdfDoc) { document.body.removeChild(pdfIframe); return }

  pdfDoc.open()
  pdfDoc.write(html)
  pdfDoc.close()

  pdfIframe.onload = async () => {
    await new Promise(resolve => setTimeout(resolve, 500))

    try {
      const page = pdfDoc.querySelector('.page') as HTMLElement
      if (!page) throw new Error('page not found')

      const canvas = await html2canvas(page, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        width: 794,
        windowWidth: 794,
      })
      const imgData = canvas.toDataURL('image/jpeg', 0.9)
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pdfW = 210
      const pdfH = (canvas.height * pdfW) / canvas.width
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfW, Math.min(pdfH, 297))
      pdf.save(`${fileName}.pdf`)
    } catch (e) {
      console.error('PDF 생성 실패:', e)
      alert('PDF 생성에 실패했습니다. 다시 시도해주세요.')
    } finally {
      document.body.removeChild(pdfIframe)
    }
  }
  return
} else {
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.left = '0'
  iframe.style.top = '0'
  iframe.style.width = '100vw'
  iframe.style.height = '100vh'
  iframe.style.border = 'none'
  iframe.style.zIndex = '99999'
  iframe.style.background = 'white'
  iframe.style.opacity = '0'
  document.body.appendChild(iframe)

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document
  if (!iframeDoc) { document.body.removeChild(iframe); return }

  iframeDoc.open()
  iframeDoc.write(html)
  iframeDoc.close()

  iframe.onload = () => {
    setTimeout(() => {
      try {
        const iframeInnerDoc = iframe.contentWindow?.document
        if (iframeInnerDoc) {
          const page = iframeInnerDoc.querySelector('.page') as HTMLElement
          if (page) {
            const maxH = 1050
            const realH = page.scrollHeight
            if (realH > maxH) {
              const scale = maxH / realH
              page.style.transform = `scale(${scale})`
              page.style.transformOrigin = 'top left'
              page.style.width = `${210 / scale}mm`
            }
            page.style.height = '297mm'
            page.style.maxHeight = '297mm'
            page.style.overflow = 'hidden'
          }
          iframeInnerDoc.body.style.height = '297mm'
          iframeInnerDoc.body.style.maxHeight = '297mm'
          iframeInnerDoc.body.style.overflow = 'hidden'
          iframeInnerDoc.documentElement.style.height = '297mm'
          iframeInnerDoc.documentElement.style.maxHeight = '297mm'
          iframeInnerDoc.documentElement.style.overflow = 'hidden'
        }
      } catch (e) {
        console.error('Print scaling error:', e)
      }

      iframe.style.opacity = '1'
      document.title = fileName
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
      document.title = '그리마노트'
      setTimeout(() => document.body.removeChild(iframe), 1000)
    }, 800)
  }
}
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
    <div className="min-h-screen bg-gradient-to-br from-gray-100 to-gray-200">
      <style jsx global>{`
        body { font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; }
      `}</style>

      <header className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-40 border-b border-gray-200/50">
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

      <div className="mx-auto my-4 md:my-6 px-4" style={{ maxWidth: '210mm' }}>
        <div id="report-card" className="bg-white shadow-lg rounded-lg" style={{ padding: '24px' }}>

          {/* 로고 & 타이틀 */}
          <div style={{ marginBottom: '12px' }}>
            <div style={{ marginBottom: '6px' }}>
              <img loading="lazy" decoding="async" src="/logo.jpg" alt="그리마미술 로고" style={{ height: '28px', width: 'auto' }} />
            </div>
            <div className="text-center">
              <h1 className="font-bold" style={{ color: mainColor, fontSize: '20pt' }}>성장 리포트</h1>
            </div>
          </div>

          {/* 학생 정보 */}
          <div style={{ marginBottom: '10px' }}>
            <h3 className="font-semibold flex items-center gap-1" style={{ color: mainColor, fontSize: '13pt', marginBottom: '4px' }}>
              <span>👤</span> 학생 정보
            </h3>
            <div className="rounded-xl" style={{ backgroundColor: `${mainColor}10`, border: `1px solid ${mainColor}30`, padding: '8px 10px' }}>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div>
                  <p className="font-medium text-gray-500" style={{ fontSize: '10pt' }}>이름</p>
                  <p className="font-semibold text-gray-800" style={{ fontSize: '10pt' }}>{student?.name || '-'}</p>
                </div>
                <div>
                  <p className="font-medium text-gray-500" style={{ fontSize: '10pt' }}>연령</p>
                  <p className="font-semibold text-gray-800" style={{ fontSize: '10pt' }}>{student?.birth_year ? getAge(student.birth_year) + '세' : '-'}</p>
                </div>
                <div>
                  <p className="font-medium text-gray-500" style={{ fontSize: '10pt' }}>반</p>
                  <p className="font-semibold text-gray-800" style={{ fontSize: '10pt' }}>{student?.classes?.name || '-'}</p>
                </div>
                <div>
                  <p className="font-medium text-gray-500" style={{ fontSize: '10pt' }}>지도 기간</p>
                  <p className="font-semibold text-gray-800" style={{ fontSize: '10pt' }}>{report.period_start} ~ {report.period_end}</p>
                </div>
              </div>
            </div>
          </div>

          {/* 작품 비교 */}
          <div style={{ marginBottom: '10px' }}>
            <h3 className="font-semibold flex items-center gap-1" style={{ color: mainColor, fontSize: '13pt', marginBottom: '4px' }}>
              <span>📷</span> 작품 비교
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center">
                <p className="font-medium text-gray-500" style={{ fontSize: '10pt', marginBottom: '3px' }}>이전</p>
                <div className="bg-gray-50 rounded-lg overflow-hidden border border-gray-100 flex items-center justify-center" style={{ height: '200px' }}>
                  {report.image_before_url ? (
                    <img loading="lazy" decoding="async" src={report.image_before_url} alt="이전" style={{ maxHeight: '190px', maxWidth: '100%', objectFit: 'contain' }} />
                  ) : <span className="text-3xl text-gray-300">🖼️</span>}
                </div>
              </div>
              <div className="text-center">
                <p className="font-medium text-gray-500" style={{ fontSize: '10pt', marginBottom: '3px' }}>최근</p>
                <div className="bg-gray-50 rounded-lg overflow-hidden border border-gray-100 flex items-center justify-center" style={{ height: '200px' }}>
                  {report.image_after_url ? (
                    <img loading="lazy" decoding="async" src={report.image_after_url} alt="최근" style={{ maxHeight: '190px', maxWidth: '100%', objectFit: 'contain' }} />
                  ) : <span className="text-3xl text-gray-300">🖼️</span>}
                </div>
              </div>
            </div>
          </div>

          {/* 작품 변화 */}
          <div style={{ marginBottom: '10px' }}>
            <h3 className="font-semibold flex items-center gap-1" style={{ color: mainColor, fontSize: '13pt', marginBottom: '4px' }}>
              <span>✨</span> 작품 변화
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {[
                { label: '형태', text: report.content_form },
                { label: '색채', text: report.content_color },
                { label: '표현', text: report.content_expression },
              ].map((item) => (
                <div key={item.label} className="bg-gray-50 rounded-lg" style={{ padding: '6px 10px' }}>
                  <p className="font-semibold text-gray-700" style={{ fontSize: '10pt', marginBottom: '2px' }}>{item.label}</p>
                  <p className="text-gray-600" style={{ fontSize: '10pt', lineHeight: '1.45' }}>{item.text || '-'}</p>
                </div>
              ))}
            </div>
          </div>

          {/* 선생님 코멘트 */}
          <div style={{ marginBottom: '6px' }}>
            <h3 className="font-semibold flex items-center gap-1" style={{ color: mainColor, fontSize: '13pt', marginBottom: '4px' }}>
              <span>💬</span> 선생님 코멘트
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div className="bg-gray-50 rounded-lg" style={{ padding: '6px 10px' }}>
                <p className="font-semibold text-gray-700" style={{ fontSize: '10pt', marginBottom: '2px' }}>강점</p>
                <p className="text-gray-600" style={{ fontSize: '10pt', lineHeight: '1.45' }}>{report.content_strength || '-'}</p>
              </div>
              <div className="bg-gray-50 rounded-lg" style={{ padding: '6px 10px' }}>
                <p className="font-semibold text-gray-700" style={{ fontSize: '10pt', marginBottom: '2px' }}>수업 태도 및 감성</p>
                <p className="text-gray-600" style={{ fontSize: '10pt', lineHeight: '1.45' }}>{report.content_attitude || '-'}</p>
              </div>
              <div className="rounded-lg" style={{ backgroundColor: `${mainColor}10`, border: `1px solid ${mainColor}30`, padding: '6px 10px' }}>
                <p className="font-semibold" style={{ color: mainColor, fontSize: '10pt', marginBottom: '2px' }}>향후 지도 방향</p>
                <p className="text-gray-600" style={{ fontSize: '10pt', lineHeight: '1.45' }}>{report.content_direction || '-'}</p>
              </div>
            </div>
          </div>

          {/* 푸터 */}
          <div className="text-center text-gray-300" style={{ fontSize: '8pt', marginTop: '8px' }}>
            ⓒ 2026. 그리마미술 INC. All rights reserved.
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
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
            {/iPhone|iPad|iPod|Android/i.test(typeof window !== 'undefined' ? navigator.userAgent : '') ? '📄 PDF 저장' : '🖨️ 인쇄 / PDF 저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
