'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface TeachingPoint {
  title: string
  description: string
  image_url: string
}

interface VariationReference {
  title: string
  image_url: string
}

interface VariationGuide {
  description: string
  references: VariationReference[]
}

interface Curriculum {
  id: string
  year: number
  month: number
  week: number
  target_group: string
  title: string
  thumbnail_url: string
  main_images: string[]
  main_materials: string
  teaching_points: TeachingPoint[]
  cautions: string
  material_sources: string
  variation_guide: VariationGuide
  parent_message_template: string
  status: string
}

export default function CurriculumDetailPage() {
  const router = useRouter()
  const params = useParams()
  const curriculumId = params.id as string

  const [loading, setLoading] = useState(true)
  const [curriculum, setCurriculum] = useState<Curriculum | null>(null)
  const [userRole, setUserRole] = useState<string>('')
  const [selectedImage, setSelectedImage] = useState<string | null>(null)

  useEffect(() => {
    checkAuthAndLoad()
  }, [curriculumId])

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

    // 커리큘럼 데이터 로드
    const { data, error } = await supabase
      .from('monthly_curriculum')
      .select('*')
      .eq('id', curriculumId)
      .single()

    if (error || !data) {
      alert('콘텐츠를 찾을 수 없습니다.')
      router.push('/curriculum')
      return
    }

    setCurriculum(data)
    setLoading(false)
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

  if (!curriculum) {
    return null
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-40 border-b border-gray-200/50">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <button onClick={() => router.push('/curriculum')} className="text-gray-600">
              ← 뒤로
            </button>
            <h1 className="text-lg font-bold text-gray-800">커리큘럼 상세</h1>
            {userRole === 'admin' && (
              <button
                onClick={() => router.push(`/admin/curriculum/${curriculumId}/edit`)}
                className="text-teal-600 text-sm font-medium"
              >
                수정
              </button>
            )}
            {userRole !== 'admin' && <div className="w-12"></div>}
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="space-y-6">
          {/* 기본 정보 + 전체 출력 버튼 */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className={`px-2 py-1 text-xs font-medium rounded-lg ${
                    curriculum.target_group === '유치부' 
                      ? 'bg-pink-100 text-pink-700' 
                      : 'bg-blue-100 text-blue-700'
                  }`}>
                    {curriculum.target_group}
                  </span>
                  <span className="text-sm text-gray-500">
                    {curriculum.year}년 {curriculum.month}월 {curriculum.week}주차
                  </span>
                  {curriculum.status === 'draft' && (
                    <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs rounded-lg">
                      임시저장
                    </span>
                  )}
                </div>
                <h2 className="text-xl font-bold text-gray-800">{curriculum.title}</h2>
              </div>
            </div>
          </div>

          {/* 완성작품 사진 */}
          {curriculum.main_images && curriculum.main_images.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-800">🖼️ 완성작품</h3>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {curriculum.main_images.map((url, idx) => (
                  <div key={idx} className="relative group">
                    <img
                      src={url}
                      alt={`완성작품 ${idx + 1}`}
                      className="w-full aspect-square object-cover rounded-xl cursor-pointer hover:opacity-90"
                      onClick={() => setSelectedImage(url)}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 주재료 */}
          {curriculum.main_materials && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <h3 className="font-bold text-gray-800 mb-3">🎨 주재료</h3>
              <p className="text-gray-600 whitespace-pre-line">{curriculum.main_materials}</p>
            </div>
          )}

          {/* 학부모 안내멘트 */}
          {curriculum.parent_message_template && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <h3 className="font-bold text-gray-800 mb-3">💬 학부모 안내멘트</h3>
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-gray-600 whitespace-pre-line">{curriculum.parent_message_template}</p>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(curriculum.parent_message_template)
                  alert('클립보드에 복사되었습니다!')
                }}
                className="mt-3 px-4 py-2 bg-teal-50 text-teal-600 rounded-lg text-sm font-medium"
              >
                📋 복사하기
              </button>
            </div>
          )}

          {/* 지도 포인트 */}
          {curriculum.teaching_points && curriculum.teaching_points.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <h3 className="font-bold text-gray-800 mb-4">📌 지도 포인트</h3>
              <div className="space-y-4">
                {curriculum.teaching_points.map((point, idx) => (
                  <div key={idx} className="bg-gray-50 rounded-xl p-4">
                    <h4 className="font-medium text-gray-800 mb-2">{point.title}</h4>
                    {point.description && (
                      <p className="text-gray-600 text-sm mb-3">{point.description}</p>
                    )}
                    {point.image_url && (
                      <img
                        src={point.image_url}
                        alt={point.title}
                        className="w-full max-w-xs rounded-lg cursor-pointer"
                        onClick={() => setSelectedImage(point.image_url)}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 유의사항 */}
          {curriculum.cautions && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <h3 className="font-bold text-gray-800 mb-3">⚠️ 유의사항</h3>
              <p className="text-gray-600 whitespace-pre-line">{curriculum.cautions}</p>
            </div>
          )}

          {/* 재료 구입처 */}
          {curriculum.material_sources && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <h3 className="font-bold text-gray-800 mb-3">🛒 재료 구입처</h3>
              <p className="text-gray-600 whitespace-pre-line">{curriculum.material_sources}</p>
            </div>
          )}

          {/* Variation Guide */}
          {curriculum.variation_guide && (curriculum.variation_guide.description || curriculum.variation_guide.references?.length > 0) && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-800">💡 Variation Guide</h3>
              </div>
              
              {curriculum.variation_guide.description && (
                <p className="text-gray-600 whitespace-pre-line mb-4">
                  {curriculum.variation_guide.description}
                </p>
              )}

              {curriculum.variation_guide.references && curriculum.variation_guide.references.length > 0 && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-500 font-medium">참고 자료</p>
                  <div className="grid grid-cols-2 gap-3">
                    {curriculum.variation_guide.references.map((ref, idx) => (
                      <div key={idx} className="bg-gray-50 rounded-xl p-3 relative group">
                        {ref.image_url && (
                          <>
                            <img
                              src={ref.image_url}
                              alt={ref.title}
                              className="w-full aspect-square object-cover rounded-lg mb-2 cursor-pointer"
                              onClick={() => setSelectedImage(ref.image_url)}
                            />
                          </>
                        )}
                        <p className="text-sm text-gray-700 font-medium">{ref.title}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 이미지 모달 */}
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
