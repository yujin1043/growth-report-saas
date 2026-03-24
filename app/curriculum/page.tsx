﻿'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface TeachingPoint {
  title: string
  description: string
  image_url: string
  image_urls?: string[]
}

interface VariationGuide {
  description?: string
  references?: { title: string; image_url: string }[]
}

interface Curriculum {
  id: string
  year: number
  month: number
  week?: number
  target_group: string
  title: string
  thumbnail_url: string | null
  main_images: string[]
  main_materials: string | null
  teaching_points: TeachingPoint[]
  cautions: string | null
  material_sources: string | null
  variation_guide: VariationGuide | null
  status: string
  created_at: string
  parent_message_template: string | null
  age_group: string | null
  stage_messages: { label: string; message: string }[] | null
  lesson_category: string | null
}

interface GroupedCurriculum {
  label: string
  year: number
  month: number
  week: number
  items: Curriculum[]
}

export default function CurriculumPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [curriculums, setCurriculums] = useState<Curriculum[]>([])
  const [groupedData, setGroupedData] = useState<GroupedCurriculum[]>([])
  const [selectedCurriculum, setSelectedCurriculum] = useState<Curriculum | null>(null)
  const [userRole, setUserRole] = useState('')
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent))
  }, [])

  // 현재 월과 다음 월 계산
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1
  const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1
  const nextYear = currentMonth === 12 ? currentYear + 1 : currentYear
  const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1
  const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear

  useEffect(() => {
    checkAuthAndLoad()
  }, [])

  useEffect(() => {
    if (curriculums.length > 0) {
      groupByWeek()
    } else {
      setGroupedData([])
    }
  }, [curriculums])

  async function checkAuthAndLoad() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile) {
      setUserRole(profile.role)
    }

    // 이번 달 + 다음 달 콘텐츠 조회 (활성 상태만)
    const { data, error } = await supabase
      .from('monthly_curriculum')
      .select('*')
      .in('status', ['active'])
      .or(
        `and(year.eq.${prevYear},month.eq.${prevMonth}),and(year.eq.${currentYear},month.eq.${currentMonth}),and(year.eq.${nextYear},month.eq.${nextMonth})`
      )
      .order('year', { ascending: true })
      .order('month', { ascending: true })
      .order('week', { ascending: true })

    if (!error && data) {
      setCurriculums(data)
    }

    setLoading(false)
  }

  function groupByWeek() {
    // 주차별 그루핑 (유치부+초등부 함께)
    const groups: { [key: string]: GroupedCurriculum } = {}

    curriculums.forEach(item => {
      const week = item.week || 1
      const key = `${item.year}-${item.month}-${week}`
      if (!groups[key]) {
        groups[key] = {
          label: `${item.month}월 ${week}주차`,
          year: item.year,
          month: item.month,
          week: week,
          items: []
        }
      }
      groups[key].items.push(item)
    })

    // 정렬: 월 오름차순 → 주차 오름차순
    const sorted = Object.values(groups).sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year
      if (a.month !== b.month) return a.month - b.month
      return a.week - b.week
    })

    setGroupedData(sorted)
  }

  const getMonthLabel = (year: number, month: number) => {
    if (year === prevYear && month === prevMonth) return '지난 달'
    if (year === currentYear && month === currentMonth) return '이번 달'
    return '다음 달'
  }

  // 숨겨진 iframe으로 출력 (현재 페이지 유지)
  const printViaIframe = async (html: string, pdfName?: string) => {
    const isMobilePrint = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    const existingFrame = document.getElementById('print-frame') as HTMLIFrameElement
    if (existingFrame) existingFrame.remove()

    const iframe = document.createElement('iframe')
    iframe.id = 'print-frame'
    iframe.style.position = 'fixed'
    iframe.style.border = 'none'

    if (isMobilePrint) {
      iframe.style.left = '0'
      iframe.style.top = '0'
      iframe.style.width = '794px'
      iframe.style.height = '1123px'
      iframe.style.zIndex = '-1'
      iframe.style.opacity = '0'
    } else {
      iframe.style.top = '-10000px'
      iframe.style.left = '-10000px'
      iframe.style.width = '0'
      iframe.style.height = '0'
    }
    document.body.appendChild(iframe)

    const doc = iframe.contentDocument || iframe.contentWindow?.document
    if (!doc) { iframe.remove(); return }

    doc.open()
    doc.write(html)
    doc.close()

    iframe.onload = async () => {
      // 이미지 로딩 대기
      const images = doc.querySelectorAll('img')
      await Promise.all(Array.from(images).map(img =>
        img.complete ? Promise.resolve() : new Promise(resolve => { img.onload = resolve; img.onerror = resolve })
      ))
      await new Promise(resolve => setTimeout(resolve, 300))

      if (isMobilePrint) {
        try {
          const { default: html2canvas } = await import('html2canvas-pro')
          const { default: jsPDF } = await import('jspdf')

          const pages = doc.querySelectorAll('.page')

          if (pages.length > 1) {
            // 여러 페이지 (작품/가이드): 각 .page를 개별 캡처, 이미지 비율에 맞춰 가로/세로 자동
            let pdf: any = null
            for (let i = 0; i < pages.length; i++) {
              const target = pages[i] as HTMLElement
              const canvas = await html2canvas(target, { scale: 2, useCORS: true, backgroundColor: '#ffffff' })
              const imgData = canvas.toDataURL('image/jpeg', 0.9)
              const isLandscape = canvas.width > canvas.height * 1.1
              if (!pdf) {
                pdf = new jsPDF(isLandscape ? 'l' : 'p', 'mm', 'a4')
              } else {
                pdf.addPage('a4', isLandscape ? 'l' : 'p')
              }
              const pageW = isLandscape ? 297 : 210
              const pageH = isLandscape ? 210 : 297
              const pdfH = (canvas.height * pageW) / canvas.width
              pdf.addImage(imgData, 'JPEG', 0, 0, pageW, Math.min(pdfH, pageH))
            }
            if (pdf) pdf.save(`${pdfName || 'document'}.pdf`)
          } else {
            // 전체 출력: body 통째로 캡처 → A4 높이로 자동 분할 (축소 없이 여러 장)
            const target = pages.length === 1 ? pages[0] as HTMLElement : doc.body
            const canvas = await html2canvas(target, { scale: 2, useCORS: true, backgroundColor: '#ffffff', width: 794, windowWidth: 794 })
            const imgData = canvas.toDataURL('image/jpeg', 0.9)
            const pdfW = 210
            const fullH = canvas.height * pdfW / canvas.width
            const pageH = 297
            const totalPages = Math.ceil(fullH / pageH)
            const pdf = new jsPDF('p', 'mm', 'a4')
            for (let i = 0; i < totalPages; i++) {
              if (i > 0) pdf.addPage()
              pdf.addImage(imgData, 'JPEG', 0, -(i * pageH), pdfW, fullH)
            }
            pdf.save(`${pdfName || 'document'}.pdf`)
          }
        } catch (e) {
          console.error('PDF 생성 실패:', e)
          alert('PDF 생성에 실패했습니다. 다시 시도해주세요.')
        } finally {
          iframe.remove()
        }
      } else {
        iframe.contentWindow?.print()
        setTimeout(() => iframe.remove(), 1000)
      }
    }
  }

  const saveImagesPdf = async (imageUrls: string[], pdfName: string) => {
    try {
      const { default: jsPDF } = await import('jspdf')
      let pdf: any = null

      for (let i = 0; i < imageUrls.length; i++) {
        const imgUrl = imageUrls[i]
        const img = new Image()
        img.crossOrigin = 'anonymous'
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve()
          img.onerror = () => reject()
          img.src = imgUrl
        })

        const naturalW = img.naturalWidth
        const naturalH = img.naturalHeight
        const isLandscape = naturalW > naturalH * 1.1
        const pageW = isLandscape ? 297 : 210
        const pageH = isLandscape ? 210 : 297
        const margin = 5
        const availW = pageW - margin * 2
        const availH = pageH - margin * 2
        const scale = Math.min(availW / naturalW, availH / naturalH)
        const w = naturalW * scale
        const h = naturalH * scale
        const x = (pageW - w) / 2
        const y = (pageH - h) / 2

        const c = document.createElement('canvas')
        c.width = naturalW; c.height = naturalH
        c.getContext('2d')!.drawImage(img, 0, 0)
        const imgData = c.toDataURL('image/jpeg', 0.9)

        if (!pdf) {
          pdf = new jsPDF(isLandscape ? 'l' : 'p', 'mm', 'a4')
        } else {
          pdf.addPage('a4', isLandscape ? 'l' : 'p')
        }
        pdf.addImage(imgData, 'JPEG', x, y, w, h)
      }
      if (pdf) pdf.save(`${pdfName}.pdf`)
    } catch (e) {
      console.error('PDF 생성 실패:', e)
      alert('PDF 생성에 실패했습니다. 다시 시도해주세요.')
    }
  }

  // 이미지 출력 (A4 꽉 차게, 가로/세로 자동 감지)
  const printImage = (imageUrl: string, title: string) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const isLandscape = img.width > img.height
      printViaIframe(`<!DOCTYPE html><html><head><title>${title}</title>
        <style>
          @page { size: ${isLandscape ? 'A4 landscape' : 'A4 portrait'}; margin: 0; }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { width: 100vw; height: 100vh; display: flex; align-items: center; justify-content: center; background: white; }
          img { width: 100%; height: 100%; object-fit: contain; }
        </style></head><body><img src="${imageUrl}" alt="${title}" /></body></html>`, title)
    }
    img.src = imageUrl
  }

  // 전체 콘텐츠 출력
  const printAll = (c: Curriculum) => {
    const teachingHtml = c.teaching_points?.map(p => `
      <div style="margin-bottom:16px;padding:12px;background:#f9fafb;border-radius:8px;">
        <h4 style="font-size:14px;font-weight:600;margin-bottom:6px;">${p.title}</h4>
        ${p.description ? `<p style="font-size:13px;color:#4b5563;">${p.description}</p>` : ''}
        ${p.image_url ? `<img src="${p.image_url}" style="max-width:200px;border-radius:8px;margin-top:8px;" />` : ''}
      </div>`).join('') || ''

    const variationHtml = c.variation_guide?.references?.map(r => `
      <div style="text-align:center;">
        ${r.image_url ? `<img src="${r.image_url}" style="width:140px;height:140px;object-fit:cover;border-radius:8px;margin-bottom:6px;" />` : ''}
        <p style="font-size:12px;">${r.title}</p>
      </div>`).join('') || ''

    printViaIframe(`<!DOCTYPE html><html><head><meta name="viewport" content="width=794"><title>${c.title}</title>
      <style>
        @page { size: A4; margin: 15mm; }
        * { margin:0;padding:0;box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,sans-serif; }
        body { width:794px;color:#1f2937; }
        .page { width:794px;padding:40px;background:white; }
        .header { text-align:center;margin-bottom:30px;padding-bottom:20px;border-bottom:2px solid #0d9488; }
        .badge { display:inline-block;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;margin-right:8px; }
        .badge-pink { background:#fce7f3;color:#be185d; }
        .badge-blue { background:#dbeafe;color:#1d4ed8; }
        .title { font-size:22px;font-weight:700;margin-top:12px; }
        .section { margin-bottom:22px; }
        .section-title { font-size:15px;font-weight:700;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #e5e7eb; }
        .content { font-size:13px;line-height:1.6;color:#374151;white-space:pre-line; }
        .images { display:flex;gap:10px;flex-wrap:wrap; }
        .images img { width:140px;height:140px;object-fit:cover;border-radius:8px; }
        .var-grid { display:grid;grid-template-columns:repeat(4,1fr);gap:12px; }
      </style></head><body>
      <div class="page">
      <div class="header">
        <span class="badge ${c.target_group === '유치부' ? 'badge-pink' : 'badge-blue'}">${c.target_group}</span>
        <span class="badge" style="background:#f3f4f6;color:#374151;">${c.year}년 ${c.month}월 ${c.week || 1}주차</span>
        <h1 class="title">${c.title}</h1>
      </div>
      ${c.main_images?.length > 0 ? `<div class="section"><h3 class="section-title">🖼️ 완성작품</h3><div class="images">${c.main_images.map(u => `<img src="${u}" />`).join('')}</div></div>` : ''}
      ${c.main_materials ? `<div class="section"><h3 class="section-title">🎨 주재료</h3><p class="content">${c.main_materials}</p></div>` : ''}
      ${c.parent_message_template ? `<div class="section"><h3 class="section-title">💬 학부모 안내멘트</h3><div style="background:#f9fafb;padding:12px;border-radius:8px;"><p class="content">${c.parent_message_template}</p></div></div>` : ''}
      ${c.teaching_points?.length > 0 ? `<div class="section"><h3 class="section-title">📌 지도 포인트</h3>${teachingHtml}</div>` : ''}
      ${c.cautions ? `<div class="section"><h3 class="section-title">⚠️ 유의사항</h3><p class="content">${c.cautions}</p></div>` : ''}
      ${c.material_sources ? `<div class="section"><h3 class="section-title">🛒 재료 구입처</h3><p class="content">${c.material_sources}</p></div>` : ''}
      ${c.variation_guide?.description || c.variation_guide?.references?.length ? `<div class="section"><h3 class="section-title">💡 Variation Guide</h3>${c.variation_guide.description ? `<p class="content" style="margin-bottom:12px;">${c.variation_guide.description}</p>` : ''}${c.variation_guide.references?.length ? `<div class="var-grid">${variationHtml}</div>` : ''}</div>` : ''}
      </div>
      </body></html>`, c.title)
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
      {/* 헤더 */}
      <header className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-40 border-b border-gray-200/50">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between min-h-[40px]">
            <div className="w-16">
              {selectedCurriculum && (
                <button
                  onClick={() => setSelectedCurriculum(null)}
                  className="text-sm text-gray-600 hover:text-gray-800 font-medium"
                >
                  ← 뒤로
                </button>
              )}
            </div>
            <h1 className="text-lg font-bold text-gray-800">📚 커리큘럼</h1>
            <div className="w-16 text-right">
              {userRole === 'admin' && !selectedCurriculum && (
                <button
                  onClick={() => router.push('/admin/curriculum')}
                  className="text-sm text-teal-600 hover:text-teal-700 font-medium"
                >
                  관리
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* 콘텐츠 목록 또는 상세 */}
        {!selectedCurriculum ? (
          <div className="space-y-6">
            <div>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="🔍 커리큘럼 검색"
                className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 outline-none shadow-sm"
              />
            </div>
            {groupedData.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
                <p className="text-4xl mb-3">📚</p>
                <p className="text-gray-500">등록된 콘텐츠가 없습니다.</p>
              </div>
            ) : (
              groupedData
                .map(group => ({
                  ...group,
                  items: group.items.filter(item => !searchQuery || item.title.includes(searchQuery))
                }))
                .filter(group => group.items.length > 0)
                .map(group => (
                <div key={`${group.year}-${group.month}-${group.week}`} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                  {/* 주차 헤더 */}
                  <div className="bg-teal-50 px-4 py-3 border-b border-teal-100">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-teal-700">
                        📅 {group.month}월 {group.week}주차
                      </span>
                      <span className="text-xs text-teal-500 bg-teal-100 px-2 py-1 rounded-full">
                        {getMonthLabel(group.year, group.month)}
                      </span>
                    </div>
                  </div>

                  {/* 해당 주차 콘텐츠 */}
                  <div className="divide-y divide-gray-100">
                    {group.items.map(item => (
                      <div 
                        key={item.id} 
                        onClick={() => setSelectedCurriculum(item)}
                        className="px-4 py-4 flex items-center gap-4 cursor-pointer hover:bg-gray-50 transition"
                      >
                        {/* 썸네일 */}
                        {item.thumbnail_url ? (
                          <img 
                            src={item.thumbnail_url} 
                            alt={item.title}
                            className="w-16 h-16 rounded-xl object-cover shrink-0"
                          />
                        ) : (
                          <div className="w-16 h-16 rounded-xl bg-gray-100 flex items-center justify-center text-2xl shrink-0">
                            🎨
                          </div>
                        )}

                        {/* 정보 */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-medium text-gray-800 truncate">{item.title}</p>
                            <span className={`px-2 py-0.5 text-xs font-bold rounded-lg shrink-0 ${
                              item.target_group === '유치부' 
                                ? 'bg-pink-100 text-pink-600' 
                                : 'bg-blue-100 text-blue-600'
                            }`}>
                              {item.target_group === '유치부' ? '유치' : '초등'}
                            </span>
                          </div>
                          <p className="text-sm text-gray-500 truncate">
                            {item.main_materials || '재료 정보 없음'}
                          </p>
                        </div>

                        {/* 화살표 */}
                        <span className="text-gray-400 text-xl shrink-0">›</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          /* 상세 보기 */
          <div className="space-y-6">
            {/* 상세 헤더 */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`px-2 py-1 text-xs font-medium rounded-lg ${
                      selectedCurriculum.target_group === '유치부' 
                        ? 'bg-pink-100 text-pink-700' 
                        : 'bg-blue-100 text-blue-700'
                    }`}>
                      {selectedCurriculum.target_group}
                    </span>
                    <span className="text-sm text-gray-500">
                      {selectedCurriculum.year}년 {selectedCurriculum.month}월
                      {selectedCurriculum.week && ` ${selectedCurriculum.week}주차`}
                    </span>
                  </div>
                  <h2 className="text-xl font-bold text-gray-800">{selectedCurriculum.title}</h2>
                </div>
                <button
                  onClick={() => printAll(selectedCurriculum)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white rounded-xl text-sm font-medium transition shrink-0 shadow-sm"
                >
                  {isMobile ? '📄 PDF 저장' : '🖨️ 전체 출력'}
                </button>
              </div>
            </div>

            {/* 완성작품 */}
            {selectedCurriculum.main_images && selectedCurriculum.main_images.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-gray-800">🖼️ 완성작품</h3>
                  <button
                    onClick={() => {
                      const imgs = selectedCurriculum.main_images
                      if (!imgs.length) return
                      saveImagesPdf(imgs, `완성작품_${selectedCurriculum.title}`)
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 hover:bg-gray-50 text-gray-600 rounded-lg text-xs font-medium transition"
                    >
                    {isMobile ? '📄 작품 PDF' : '🖨️ 작품 출력'}
                  </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {selectedCurriculum.main_images.map((url, index) => (
                    <img 
                      key={index}
                      src={url} 
                      alt={`완성작품 ${index + 1}`}
                      className="w-full object-contain rounded-xl cursor-pointer hover:opacity-90 bg-gray-50"
                      style={{ maxHeight: '280px' }}
                      onClick={() => setSelectedImage(url)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* 재료 */}
            {selectedCurriculum.main_materials && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                <h3 className="font-bold text-gray-800 mb-3">🎨 주재료</h3>
                <p className="text-gray-700 whitespace-pre-wrap">{selectedCurriculum.main_materials}</p>
              </div>
            )}

            {/* 작품 소개 */}
            {selectedCurriculum.parent_message_template && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                <h3 className="font-bold text-gray-800 mb-3">📝 작품 소개</h3>
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-gray-600 whitespace-pre-line">{selectedCurriculum.parent_message_template}</p>
                </div>
              </div>
            )}

            {/* 지도 포인트 */}
            {selectedCurriculum.teaching_points && selectedCurriculum.teaching_points.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                <h3 className="font-bold text-gray-800 mb-4">📌 지도 포인트</h3>
                <div className="space-y-4">
                  {selectedCurriculum.teaching_points.map((point, index) => (
                    <div key={index} className="bg-gray-50 rounded-xl p-4">
                      <h4 className="font-medium text-gray-800 mb-2">{point.title}</h4>
                      {point.description && (
                        <p className="text-gray-600 text-sm whitespace-pre-wrap">{point.description}</p>
                      )}
                      {(() => {
                        const images = point.image_urls && point.image_urls.length > 0
                          ? point.image_urls
                          : (point.image_url ? [point.image_url] : [])
                        if (images.length === 0) return null
                        return (
                          <div className="mt-3 flex flex-col gap-3">
                            {images.map((url, imgIdx) => (
                              <img
                                key={imgIdx}
                                src={url}
                                alt={`포인트 ${index + 1} 이미지 ${imgIdx + 1}`}
                                className="w-full object-contain rounded-lg cursor-pointer bg-gray-100"
                                style={{ maxHeight: '320px' }}
                                onClick={() => setSelectedImage(url)}
                              />
                            ))}
                          </div>
                        )
                      })()}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 유의사항 */}
            {selectedCurriculum.cautions && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                <h3 className="font-bold text-gray-800 mb-3">⚠️ 유의사항</h3>
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                  <p className="text-gray-700 whitespace-pre-wrap">{selectedCurriculum.cautions}</p>
                </div>
              </div>
            )}

            {/* 재료 구입처 */}
            {selectedCurriculum.material_sources && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                <h3 className="font-bold text-gray-800 mb-3">🛒 재료 구입처</h3>
                <p className="text-gray-700 whitespace-pre-wrap">{selectedCurriculum.material_sources}</p>
              </div>
            )}

            {/* Variation Guide */}
            {selectedCurriculum.variation_guide && 
             (selectedCurriculum.variation_guide.description || 
              (selectedCurriculum.variation_guide.references && selectedCurriculum.variation_guide.references.length > 0)) && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-gray-800">💡 Variation Guide</h3>
                  {selectedCurriculum.variation_guide.references && selectedCurriculum.variation_guide.references.some(r => r.image_url) && (
                    <button
                    onClick={() => {
                      const refs = selectedCurriculum.variation_guide!.references!.filter(r => r.image_url)
                      if (!refs.length) return
                      saveImagesPdf(refs.map(r => r.image_url), `가이드_${selectedCurriculum.title}`)
                    }}
                      className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 hover:bg-gray-50 text-gray-600 rounded-lg text-xs font-medium transition"
                      >
                      {isMobile ? '📄 가이드 PDF' : '🖨️ 가이드 출력'}
                    </button>
                  )}
                </div>
                {selectedCurriculum.variation_guide.description && (
                  <p className="text-gray-700 mb-4 whitespace-pre-wrap">
                    {selectedCurriculum.variation_guide.description}
                  </p>
                )}
                {selectedCurriculum.variation_guide.references && 
                 selectedCurriculum.variation_guide.references.length > 0 && (
                  <div className="grid grid-cols-2 gap-3">
                    {selectedCurriculum.variation_guide.references.map((ref, index) => (
                      <div key={index} className="bg-gray-50 rounded-xl p-3">
                        {ref.image_url && (
                          <img 
                            src={ref.image_url} 
                            alt={ref.title}
                            className="w-full object-contain rounded-lg mb-2 cursor-pointer bg-gray-50"
                            style={{ maxHeight: '200px' }}
                            onClick={() => setSelectedImage(ref.image_url)}
                          />
                        )}
                        <p className="text-sm text-gray-600">{ref.title}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 이미지 확대 모달 */}
      {selectedImage && (
        <div 
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedImage(null)}
        >
          <img
            src={selectedImage}
            alt="확대 이미지"
            className="max-w-full max-h-full object-contain rounded-lg"
          />
          <button
            className="absolute top-4 right-4 text-white text-2xl"
            onClick={() => setSelectedImage(null)}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}