'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface TeachingPoint {
  title: string
  description: string
  image_url?: string
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

  // 현재 월과 다음 월 계산
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1
  const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1
  const nextYear = currentMonth === 12 ? currentYear + 1 : currentYear

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
        `and(year.eq.${currentYear},month.eq.${currentMonth}),and(year.eq.${nextYear},month.eq.${nextMonth})`
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
    if (year === currentYear && month === currentMonth) {
      return '이번 달'
    }
    return '다음 달'
  }

  // 숨겨진 iframe으로 출력 (현재 페이지 유지)
  const printViaIframe = (html: string) => {
    const existingFrame = document.getElementById('print-frame') as HTMLIFrameElement
    if (existingFrame) existingFrame.remove()

    const iframe = document.createElement('iframe')
    iframe.id = 'print-frame'
    iframe.style.position = 'fixed'
    iframe.style.top = '-10000px'
    iframe.style.left = '-10000px'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = 'none'
    document.body.appendChild(iframe)

    const doc = iframe.contentDocument || iframe.contentWindow?.document
    if (!doc) return

    doc.open()
    doc.write(html)
    doc.close()

    // 이미지 로딩 대기 후 출력
    const images = doc.querySelectorAll('img')
    if (images.length === 0) {
      iframe.contentWindow?.print()
      setTimeout(() => iframe.remove(), 1000)
    } else {
      let loaded = 0
      const total = images.length
      images.forEach(img => {
        if (img.complete) {
          loaded++
          if (loaded === total) {
            iframe.contentWindow?.print()
            setTimeout(() => iframe.remove(), 1000)
          }
        } else {
          img.onload = img.onerror = () => {
            loaded++
            if (loaded === total) {
              iframe.contentWindow?.print()
              setTimeout(() => iframe.remove(), 1000)
            }
          }
        }
      })
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
        </style></head><body><img src="${imageUrl}" alt="${title}" /></body></html>`)
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

    printViaIframe(`<!DOCTYPE html><html><head><title>${c.title}</title>
      <style>
        @page { size: A4; margin: 15mm; }
        * { margin:0;padding:0;box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,sans-serif; }
        body { padding:20px;color:#1f2937; }
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
      </body></html>`)
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
      <header className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-40 border-b border-gray-200/50 no-print">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <button 
              onClick={() => {
                if (selectedCurriculum) {
                  setSelectedCurriculum(null)
                } else {
                  router.back()
                }
              }} 
              className="text-gray-600"
            >
              ← 뒤로
            </button>
            <h1 className="text-lg font-bold text-gray-800">월별 운영 콘텐츠</h1>
            <div className="w-16">
              {userRole === 'admin' && (
                <button 
                  onClick={() => router.push('/admin/curriculum')}
                  className="text-sm text-teal-600"
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
            {groupedData.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
                <p className="text-4xl mb-3">📚</p>
                <p className="text-gray-500">등록된 콘텐츠가 없습니다.</p>
              </div>
            ) : (
              groupedData.map(group => (
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
                  🖨️ 전체 출력
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
                      selectedCurriculum.main_images.forEach((url, i) => {
                        printImage(url, `${selectedCurriculum.title}_완성작품_${i + 1}`)
                      })
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 hover:bg-gray-50 text-gray-600 rounded-lg text-xs font-medium transition"
                  >
                    🖨️ 작품 출력
                  </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {selectedCurriculum.main_images.map((url, index) => (
                    <img 
                      key={index}
                      src={url} 
                      alt={`완성작품 ${index + 1}`}
                      className="w-full aspect-square object-cover rounded-xl cursor-pointer hover:opacity-90"
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

            {/* 학부모 안내멘트 */}
            {selectedCurriculum.parent_message_template && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                <h3 className="font-bold text-gray-800 mb-3">💬 학부모 안내멘트</h3>
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-gray-600 whitespace-pre-line">{selectedCurriculum.parent_message_template}</p>
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(selectedCurriculum.parent_message_template || '')
                    alert('클립보드에 복사되었습니다!')
                  }}
                  className="mt-3 px-4 py-2 bg-teal-50 text-teal-600 rounded-lg text-sm font-medium"
                >
                  📋 복사하기
                </button>
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
                      {point.image_url && (
                        <img 
                          src={point.image_url} 
                          alt={point.title}
                          className="mt-3 rounded-lg max-w-xs cursor-pointer"
                          onClick={() => setSelectedImage(point.image_url!)}
                        />
                      )}
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
                        selectedCurriculum.variation_guide!.references!.forEach((r, i) => {
                          if (r.image_url) {
                            printImage(r.image_url, `${selectedCurriculum.title}_Variation_${i + 1}`)
                          }
                        })
                      }}
                      className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 hover:bg-gray-50 text-gray-600 rounded-lg text-xs font-medium transition"
                    >
                      🖨️ 가이드 출력
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
                            className="w-full aspect-square object-cover rounded-lg mb-2 cursor-pointer"
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
