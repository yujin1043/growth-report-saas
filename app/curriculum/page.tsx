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
  const [selectedGroup, setSelectedGroup] = useState<'유치부' | '초등부'>('유치부')
  const [selectedCurriculum, setSelectedCurriculum] = useState<Curriculum | null>(null)
  const [userRole, setUserRole] = useState('')

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
  }, [curriculums, selectedGroup])

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
    // 선택된 대상 그룹으로 필터
    const filtered = curriculums.filter(c => c.target_group === selectedGroup)

    // 그룹핑
    const groups: { [key: string]: GroupedCurriculum } = {}

    filtered.forEach(item => {
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* 헤더 */}
      <header className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-40 border-b border-gray-200/50 no-print">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <button onClick={() => router.push('/dashboard')} className="text-gray-600">
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
                          <p className="font-medium text-gray-800 truncate">{item.title}</p>
                          <p className="text-sm text-gray-500 mt-1 truncate">
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
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {/* 상세 헤더 */}
            <div className="bg-teal-50 px-6 py-4 border-b border-teal-100 no-print">
              <button 
                onClick={() => setSelectedCurriculum(null)}
                className="text-teal-600 text-sm mb-2"
              >
                ← 목록으로
              </button>
              <h2 className="text-xl font-bold text-gray-800">{selectedCurriculum.title}</h2>
              <p className="text-sm text-teal-600 mt-1">
                {selectedCurriculum.year}년 {selectedCurriculum.month}월
                {selectedCurriculum.week && ` ${selectedCurriculum.week}주차`} · {selectedCurriculum.target_group}
              </p>
            </div>

            {/* 완성작품 */}
            {selectedCurriculum.main_images && selectedCurriculum.main_images.length > 0 && (
              <div className="p-6 border-b border-gray-100">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-gray-800 flex items-center gap-2">
                    🖼️ 완성작품
                  </h3>
                  <button
                    onClick={handlePrint}
                    className="text-sm text-teal-600 hover:underline no-print"
                  >
                    🖨️ 인쇄
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {selectedCurriculum.main_images.map((url, index) => (
                    <img 
                      key={index}
                      src={url} 
                      alt={`완성작품 ${index + 1}`}
                      className="w-full rounded-xl object-cover"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* 재료 */}
            {selectedCurriculum.main_materials && (
              <div className="p-6 border-b border-gray-100">
                <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                  🎨 재료
                </h3>
                <p className="text-gray-700 whitespace-pre-wrap">{selectedCurriculum.main_materials}</p>
              </div>
            )}

            {/* 지도 포인트 */}
            {selectedCurriculum.teaching_points && selectedCurriculum.teaching_points.length > 0 && (
              <div className="p-6 border-b border-gray-100">
                <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                  📝 지도 포인트
                </h3>
                <div className="space-y-4">
                  {selectedCurriculum.teaching_points.map((point, index) => (
                    <div key={index} className="bg-gray-50 rounded-xl p-4">
                      <p className="font-medium text-gray-800 mb-2">{point.title}</p>
                      <p className="text-gray-600 text-sm whitespace-pre-wrap">{point.description}</p>
                      {point.image_url && (
                        <img 
                          src={point.image_url} 
                          alt={point.title}
                          className="mt-3 rounded-lg max-w-full"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 유의사항 */}
            {selectedCurriculum.cautions && (
              <div className="p-6 border-b border-gray-100">
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
              <div className="p-6 border-b border-gray-100">
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
              <div className="p-6 border-b border-gray-100">
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
                  <div className="grid grid-cols-2 gap-3">
                    {selectedCurriculum.variation_guide.references.map((ref, index) => (
                      <div key={index} className="bg-gray-50 rounded-xl p-3">
                        {ref.image_url && (
                          <img 
                            src={ref.image_url} 
                            alt={ref.title}
                            className="w-full rounded-lg mb-2"
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
    </div>
  )
}
