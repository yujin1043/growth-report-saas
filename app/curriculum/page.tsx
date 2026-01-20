'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import BranchLayout from '@/components/BranchLayout'

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

export default function CurriculumPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [curriculums, setCurriculums] = useState<Curriculum[]>([])
  const [selectedGroup, setSelectedGroup] = useState<'유치부' | '초등부'>('유치부')
  const [selectedCurriculum, setSelectedCurriculum] = useState<Curriculum | null>(null)
  const [userRole, setUserRole] = useState('')
  const [userName, setUserName] = useState('')
  const [userBranchName, setUserBranchName] = useState('')

  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1
  const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1
  const nextYear = currentMonth === 12 ? currentYear + 1 : currentYear

  useEffect(() => {
    checkAuthAndLoad()
  }, [])

  async function checkAuthAndLoad() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    const [profileResult, branchesResult] = await Promise.all([
      supabase.from('user_profiles').select('name, role, branch_id').eq('id', user.id).single(),
      supabase.from('branches').select('id, name')
    ])

    if (profileResult.data) {
      setUserRole(profileResult.data.role)
      setUserName(profileResult.data.name || '')
      const branchName = branchesResult.data?.find(b => b.id === profileResult.data.branch_id)?.name || ''
      setUserBranchName(branchName)
    }

    const { data, error } = await supabase
      .from('monthly_curriculum')
      .select('*')
      .in('status', ['active'])
      .or(
        `and(year.eq.${currentYear},month.eq.${currentMonth}),and(year.eq.${nextYear},month.eq.${nextMonth})`
      )
      .order('year', { ascending: true })
      .order('month', { ascending: true })

    if (!error && data) {
      setCurriculums(data)
    }

    setLoading(false)
  }

  const filteredCurriculums = curriculums.filter(c => c.target_group === selectedGroup)

  const getMonthLabel = (year: number, month: number) => {
    if (year === currentYear && month === currentMonth) {
      return `${month}월 (이번 달)`
    }
    return `${month}월 (다음 달)`
  }

  const handlePrint = () => {
    window.print()
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

  // 공통 콘텐츠 렌더링
  const renderContent = () => (
    <>
      {/* 안내 문구 */}
      <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 mb-6 no-print">
        <p className="text-teal-800 text-sm">
          📌 <strong>이 기준으로 리포트/메시지가 생성됩니다.</strong>
        </p>
      </div>

      {/* 대상 그룹 탭 */}
      <div className="flex gap-2 mb-6 no-print">
        {['유치부', '초등부'].map((group) => (
          <button
            key={group}
            onClick={() => {
              setSelectedGroup(group as '유치부' | '초등부')
              setSelectedCurriculum(null)
            }}
            className={`flex-1 py-3 rounded-xl font-medium transition ${
              selectedGroup === group
                ? 'bg-teal-500 text-white'
                : 'bg-white text-gray-600 border border-gray-200'
            }`}
          >
            {group}
          </button>
        ))}
      </div>

      {/* 콘텐츠 목록 또는 상세 */}
      {!selectedCurriculum ? (
        <div className="space-y-4">
          {filteredCurriculums.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <p className="text-4xl mb-3">📚</p>
              <p>{selectedGroup} 콘텐츠가 없습니다</p>
            </div>
          ) : (
            filteredCurriculums.map((curriculum) => (
              <div
                key={curriculum.id}
                onClick={() => setSelectedCurriculum(curriculum)}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 cursor-pointer hover:shadow-md transition"
              >
                <div className="flex gap-4">
                  {curriculum.thumbnail_url || curriculum.main_images?.[0] ? (
                    <img
                      src={curriculum.thumbnail_url || curriculum.main_images[0]}
                      alt={curriculum.title}
                      className="w-24 h-24 object-cover rounded-xl"
                    />
                  ) : (
                    <div className="w-24 h-24 bg-gray-100 rounded-xl flex items-center justify-center">
                      <span className="text-3xl">🎨</span>
                    </div>
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2 py-0.5 bg-teal-100 text-teal-700 rounded text-xs font-medium">
                        {getMonthLabel(curriculum.year, curriculum.month)}
                      </span>
                    </div>
                    <h3 className="font-bold text-gray-900 mb-1">{curriculum.title}</h3>
                    <p className="text-sm text-gray-500">{curriculum.target_group}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        /* 상세 보기 */
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-100" id="print-area">
          {/* 뒤로 버튼 */}
          <div className="p-4 border-b no-print">
            <button
              onClick={() => setSelectedCurriculum(null)}
              className="text-gray-600 text-sm"
            >
              ← 목록으로
            </button>
          </div>

          {/* 헤더 */}
          <div className="p-6 bg-gradient-to-r from-teal-50 to-cyan-50">
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2 py-0.5 bg-teal-500 text-white rounded text-xs font-medium">
                {selectedCurriculum.year}년 {selectedCurriculum.month}월
              </span>
              <span className="px-2 py-0.5 bg-gray-200 text-gray-700 rounded text-xs">
                {selectedCurriculum.target_group}
              </span>
            </div>
            <h2 className="text-xl font-bold text-gray-900">{selectedCurriculum.title}</h2>
          </div>

          {/* 완성작품 사진 */}
          {selectedCurriculum.main_images && selectedCurriculum.main_images.length > 0 && (
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                  🖼️ 완성작품
                </h3>
                <button
                  onClick={() => {
                    const printWindow = window.open('', '_blank')
                    if (printWindow) {
                      printWindow.document.write(`
                        <html>
                          <head>
                            <title>완성작품 - ${selectedCurriculum.title}</title>
                            <style>
                              * { margin: 0; padding: 0; box-sizing: border-box; }
                              @page { size: A4; margin: 0; }
                              html, body { width: 210mm; height: 297mm; }
                              .page { 
                                width: 210mm; 
                                height: 297mm; 
                                display: flex; 
                                align-items: center; 
                                justify-content: center;
                                page-break-after: always;
                                overflow: hidden;
                              }
                              .page:last-child { page-break-after: auto; }
                              .page img { 
                                width: 210mm;
                                height: 297mm;
                                object-fit: contain;
                              }
                            </style>
                          </head>
                          <body>
                            ${selectedCurriculum.main_images.map(url => `
                              <div class="page">
                                <img src="${url}" />
                              </div>
                            `).join('')}
                            <script>
                              window.onload = function() { 
                                setTimeout(() => window.print(), 500);
                              }
                            </script>
                          </body>
                        </html>
                      `)
                      printWindow.document.close()
                    }
                  }}
                  className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200 no-print"
                >
                  🖨️ 사진만 인쇄
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {selectedCurriculum.main_images.map((url, idx) => (
                  <img
                    key={idx}
                    src={url}
                    alt={`완성작품 ${idx + 1}`}
                    className="w-full rounded-xl object-cover"
                  />
                ))}
              </div>
            </div>
          )}

          {/* 주재료 */}
          {selectedCurriculum.main_materials && (
            <div className="p-6">
              <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                🎨 주재료
              </h3>
              <p className="text-gray-700 whitespace-pre-wrap">{selectedCurriculum.main_materials}</p>
            </div>
          )}

          {/* 지도 포인트 */}
          {selectedCurriculum.teaching_points && selectedCurriculum.teaching_points.length > 0 && (
            <div className="p-6">
              <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                📌 지도 포인트
              </h3>
              <div className="space-y-4">
                {selectedCurriculum.teaching_points.map((point, idx) => (
                  <div key={idx} className="bg-gray-50 rounded-xl p-4">
                    <h4 className="font-medium text-gray-900 mb-2">{point.title}</h4>
                    {point.image_url && (
                      <img
                        src={point.image_url}
                        alt={point.title}
                        className="w-full max-w-md rounded-lg mb-3"
                      />
                    )}
                    <p className="text-gray-600 text-sm whitespace-pre-wrap">{point.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 유의사항 */}
          {selectedCurriculum.cautions && (
            <div className="p-6">
              <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                ⚠️ 유의사항
              </h3>
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                <p className="text-gray-700 whitespace-pre-wrap">{selectedCurriculum.cautions}</p>
              </div>
            </div>
          )}

          {/* 학부모 안내멘트 */}
          {selectedCurriculum.parent_message_template && (
            <div className="p-6">
              <div className="bg-blue-50 rounded-2xl p-4">
                <h3 className="font-bold text-blue-800 mb-2 flex items-center gap-2">
                  💬 학부모 안내멘트
                </h3>
                <p className="text-blue-700 whitespace-pre-wrap text-sm leading-relaxed">
                  {selectedCurriculum.parent_message_template}
                </p>
              </div>
            </div>
          )}

          {/* 재료 구입처 */}
          {selectedCurriculum.material_sources && (
            <div className="p-6">
              <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                🛒 재료 구입처
              </h3>
              <p className="text-gray-700 whitespace-pre-wrap">{selectedCurriculum.material_sources}</p>
            </div>
          )}

          {/* Variation Guide */}
          {selectedCurriculum.variation_guide && 
           (selectedCurriculum.variation_guide.description || 
            (selectedCurriculum.variation_guide.references && selectedCurriculum.variation_guide.references.length > 0)) && (
            <div className="p-6">
              <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                💡 Variation Guide
              </h3>
              {selectedCurriculum.variation_guide.description && (
                <p className="text-gray-700 mb-4 whitespace-pre-wrap">
                  {selectedCurriculum.variation_guide.description}
                </p>
              )}
              {selectedCurriculum.variation_guide.references && 
               selectedCurriculum.variation_guide.references.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm text-gray-600">참고 자료</span>
                    <button
                      onClick={() => {
                        const refs = selectedCurriculum.variation_guide?.references || []
                        const printWindow = window.open('', '_blank')
                        if (printWindow) {
                          printWindow.document.write(`
                            <html>
                              <head>
                                <title>참고자료 - ${selectedCurriculum.title}</title>
                                <style>
                                  * { margin: 0; padding: 0; box-sizing: border-box; }
                                  @page { size: A4; margin: 0; }
                                  html, body { width: 210mm; height: 297mm; }
                                  .page { 
                                    width: 210mm; 
                                    height: 297mm; 
                                    display: flex; 
                                    flex-direction: column;
                                    align-items: center; 
                                    justify-content: center;
                                    page-break-after: always;
                                    overflow: hidden;
                                  }
                                  .page:last-child { page-break-after: auto; }
                                  .page img { 
                                    width: 210mm;
                                    height: 280mm;
                                    object-fit: contain;
                                  }
                                  .page p { 
                                    margin-top: 5mm; 
                                    font-size: 14px; 
                                    color: #666; 
                                  }
                                </style>
                              </head>
                              <body>
                                ${refs.map(ref => `
                                  <div class="page">
                                    <img src="${ref.image_url}" />
                                    <p>${ref.title}</p>
                                  </div>
                                `).join('')}
                                <script>
                                  window.onload = function() { 
                                    setTimeout(() => window.print(), 500);
                                  }
                                </script>
                              </body>
                            </html>
                          `)
                          printWindow.document.close()
                        }
                      }}
                      className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200 no-print"
                    >
                      🖨️ 참고자료 인쇄
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {selectedCurriculum.variation_guide.references.map((ref, idx) => (
                      <div key={idx} className="bg-gray-50 rounded-xl p-3">
                        <img
                          src={ref.image_url}
                          alt={ref.title}
                          className="w-full rounded-lg mb-2"
                        />
                        <p className="text-sm text-gray-600 text-center">{ref.title}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 푸터 */}
          <div className="p-6 bg-gray-50 text-center">
            <p className="text-xs text-gray-400">© {currentYear} 그리마미술 All rights reserved.</p>
          </div>

          {/* 인쇄 버튼 */}
          <div className="p-4 border-t no-print">
            <button
              onClick={handlePrint}
              className="w-full py-3 bg-teal-500 text-white rounded-xl font-medium hover:bg-teal-600 transition"
            >
              🖨️ 인쇄하기
            </button>
          </div>
        </div>
      )}

      {/* 인쇄 스타일 */}
      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          #print-area { 
            box-shadow: none !important; 
            border: none !important;
          }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
    </>
  )

  // 지점 계정이면 BranchLayout 적용
  if (userRole && userRole !== 'admin') {
    return (
      <BranchLayout userName={userName} branchName={userBranchName}>
        <div className="p-6 max-w-4xl">
          {renderContent()}
        </div>
      </BranchLayout>
    )
  }

  // 본사 계정이면 기존 UI
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <header className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-40 border-b border-gray-200/50 no-print">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <button onClick={() => router.push('/dashboard')} className="text-gray-600">
              ← 뒤로
            </button>
            <h1 className="text-lg font-bold text-gray-800">월별 운영 콘텐츠</h1>
            <div className="w-16">
              <button 
                onClick={() => router.push('/admin/curriculum')}
                className="text-sm text-teal-600"
              >
                관리
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {renderContent()}
      </div>
    </div>
  )
}
