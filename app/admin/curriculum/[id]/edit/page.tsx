'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useUserContext } from '@/lib/UserContext'

interface TeachingPoint {
  title: string
  description: string
  image_url: string
}

interface VariationReference {
  title: string
  image_url: string
}

export default function EditCurriculumPage() {
  const router = useRouter()
  const params = useParams()
  const curriculumId = params.id as string
  const { userRole, isLoading: userLoading } = useUserContext()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  const [formData, setFormData] = useState({
    year: 2025,
    month: 1,
    week: 1,  // 주차 필드 추가
    target_group: '유치부',
    title: '',
    main_images: [] as string[],
    main_materials: '',
    teaching_points: [] as TeachingPoint[],
    cautions: '',
    material_sources: '',
    variation_description: '',
    variation_references: [] as VariationReference[],
    status: 'draft',
    parent_message_template: ''
  })

  // 권한 체크: admin만 접근 가능
  useEffect(() => {
    if (!userLoading && userRole !== 'admin' && userRole !== 'staff') {
      alert('관리자 권한이 필요합니다.')
      router.push('/dashboard')
    }
  }, [userLoading, userRole, router])

  useEffect(() => {
    if (!userLoading && (userRole === 'admin' || userRole === 'staff') && curriculumId) {
      loadCurriculum()
    }
  }, [userLoading, userRole, curriculumId])

  async function loadCurriculum() {
    // 기존 데이터 로드
    const { data, error } = await supabase
      .from('monthly_curriculum')
      .select('*')
      .eq('id', curriculumId)
      .single()

    if (error || !data) {
      alert('콘텐츠를 찾을 수 없습니다.')
      router.push('/admin/curriculum')
      return
    }

    setFormData({
      year: data.year,
      month: data.month,
      week: data.week || 1,  // 주차 데이터 로드
      target_group: data.target_group,
      title: data.title,
      main_images: data.main_images || [],
      main_materials: data.main_materials || '',
      teaching_points: data.teaching_points || [],
      cautions: data.cautions || '',
      material_sources: data.material_sources || '',
      variation_description: data.variation_guide?.description || '',
      variation_references: data.variation_guide?.references || [],
      status: data.status,
      parent_message_template: data.parent_message_template || ''
    })

    setLoading(false)
  }

  const compressImage = async (file: File): Promise<Blob> => {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const maxSize = 800
        let { width, height } = img
        
        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = (height / width) * maxSize
            width = maxSize
          } else {
            width = (width / height) * maxSize
            height = maxSize
          }
        }
        
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx?.drawImage(img, 0, 0, width, height)
        
        canvas.toBlob((blob) => resolve(blob!), 'image/jpeg', 0.7)
      }
      img.src = URL.createObjectURL(file)
    })
  }

  const uploadImage = async (file: File, folder: string): Promise<string | null> => {
    setUploading(true)
    try {
      const compressedBlob = await compressImage(file)
      const fileName = `${folder}/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.jpg`

      const { error } = await supabase.storage
        .from('curriculum-images')
        .upload(fileName, compressedBlob, { contentType: 'image/jpeg' })

      if (error) {
        console.error('Upload error:', error)
        return null
      }

      const { data } = supabase.storage
        .from('curriculum-images')
        .getPublicUrl(fileName)

      return data.publicUrl
    } finally {
      setUploading(false)
    }
  }

  const handleMainImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    for (const file of Array.from(files)) {
      const url = await uploadImage(file, `main/${formData.year}/${formData.month}`)
      if (url) {
        setFormData(prev => ({
          ...prev,
          main_images: [...prev.main_images, url]
        }))
      }
    }
  }

  const removeMainImage = (index: number) => {
    setFormData(prev => ({
      ...prev,
      main_images: prev.main_images.filter((_, i) => i !== index)
    }))
  }

  const addTeachingPoint = () => {
    setFormData(prev => ({
      ...prev,
      teaching_points: [...prev.teaching_points, { title: '', description: '', image_url: '' }]
    }))
  }

  const updateTeachingPoint = (index: number, field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      teaching_points: prev.teaching_points.map((point, i) =>
        i === index ? { ...point, [field]: value } : point
      )
    }))
  }

  const handleTeachingPointImage = async (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const file = e.target.files?.[0]
    if (!file) return

    const url = await uploadImage(file, `points/${formData.year}/${formData.month}`)
    if (url) {
      updateTeachingPoint(index, 'image_url', url)
    }
  }

  const removeTeachingPoint = (index: number) => {
    setFormData(prev => ({
      ...prev,
      teaching_points: prev.teaching_points.filter((_, i) => i !== index)
    }))
  }

  const addVariationReference = () => {
    setFormData(prev => ({
      ...prev,
      variation_references: [...prev.variation_references, { title: '', image_url: '' }]
    }))
  }

  const updateVariationReference = (index: number, field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      variation_references: prev.variation_references.map((ref, i) =>
        i === index ? { ...ref, [field]: value } : ref
      )
    }))
  }

  const handleVariationImage = async (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const file = e.target.files?.[0]
    if (!file) return

    const url = await uploadImage(file, `variation/${formData.year}/${formData.month}`)
    if (url) {
      updateVariationReference(index, 'image_url', url)
    }
  }

  const removeVariationReference = (index: number) => {
    setFormData(prev => ({
      ...prev,
      variation_references: prev.variation_references.filter((_, i) => i !== index)
    }))
  }

  const handleSubmit = async (status: string) => {
    if (!formData.title.trim()) {
      alert('제목을 입력해주세요.')
      return
    }

    if (formData.main_images.length === 0) {
      alert('완성작품 사진을 1장 이상 등록해주세요.')
      return
    }

    setSaving(true)

    try {
      const updateData = {
        year: formData.year,
        month: formData.month,
        week: formData.week,  // 주차 저장
        target_group: formData.target_group,
        title: formData.title,
        thumbnail_url: formData.main_images[0] || null,
        main_images: formData.main_images,
        main_materials: formData.main_materials || null,
        teaching_points: formData.teaching_points.filter(p => p.title.trim()),
        cautions: formData.cautions || null,
        material_sources: formData.material_sources || null,
        variation_guide: {
          description: formData.variation_description || null,
          references: formData.variation_references.filter(r => r.title.trim() && r.image_url)
        },
        status: status,
        updated_at: new Date().toISOString(),
        parent_message_template: formData.parent_message_template || null,
        age_group: formData.target_group === '유치부' ? 'kindergarten' : 'elementary'
      }

      const { error } = await supabase
        .from('monthly_curriculum')
        .update(updateData)
        .eq('id', curriculumId)

      if (error) {
        alert('저장에 실패했습니다: ' + error.message)
        return
      }

      alert('수정되었습니다!')
      router.push('/admin/curriculum')

    } catch (error) {
      console.error('Error:', error)
      alert('저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  // admin 아니면 로딩 표시 (리다이렉트 전)
  if (userLoading || (userRole !== 'admin' && userRole !== 'staff')) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-500 mx-auto mb-4"></div>
          <p className="text-gray-500">로딩 중...</p>
        </div>
      </div>
    )
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
      <header className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-40 border-b border-gray-200/50">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <button onClick={() => router.back()} className="text-gray-600">
              ← 뒤로
            </button>
            <h1 className="text-lg font-bold text-gray-800">콘텐츠 수정</h1>
            <div className="w-12"></div>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="space-y-6">
          {/* 기본 정보 */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <h2 className="font-bold text-gray-800 mb-4">📌 기본 정보</h2>
            
            <div className="grid grid-cols-4 gap-3 mb-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">연도</label>
                <select
                  value={formData.year}
                  onChange={(e) => setFormData(prev => ({ ...prev, year: Number(e.target.value) }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl"
                >
                  {[2024, 2025, 2026].map(y => (
                    <option key={y} value={y}>{y}년</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">월</label>
                <select
                  value={formData.month}
                  onChange={(e) => setFormData(prev => ({ ...prev, month: Number(e.target.value) }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl"
                >
                  {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
                    <option key={m} value={m}>{m}월</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">주차</label>
                <select
                  value={formData.week}
                  onChange={(e) => setFormData(prev => ({ ...prev, week: Number(e.target.value) }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl"
                >
                  {[1,2,3,4,5].map(w => (
                    <option key={w} value={w}>{w}주차</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">대상</label>
                <select
                  value={formData.target_group}
                  onChange={(e) => setFormData(prev => ({ ...prev, target_group: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl"
                >
                  <option value="유치부">유치부</option>
                  <option value="초등부">초등부</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-1">제목 *</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="예: 겨울 풍경화"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl"
              />
            </div>
          </div>

          {/* 완성작품 사진 */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <h2 className="font-bold text-gray-800 mb-4">🖼️ 완성작품 사진 *</h2>
            
            <div className="grid grid-cols-3 gap-3 mb-3">
              {formData.main_images.map((url, idx) => (
                <div key={idx} className="relative">
                  <img src={url} alt="" className="w-full h-24 object-cover rounded-xl" />
                  <button
                    onClick={() => removeMainImage(idx)}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full text-sm"
                  >
                    ×
                  </button>
                </div>
              ))}
              <label className="w-full h-24 border-2 border-dashed border-gray-300 rounded-xl flex items-center justify-center cursor-pointer hover:border-teal-400">
                <span className="text-gray-400">{uploading ? '...' : '+ 추가'}</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleMainImageUpload}
                  className="hidden"
                  disabled={uploading}
                />
              </label>
            </div>
          </div>

          {/* 주재료 */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <h2 className="font-bold text-gray-800 mb-4">🎨 주재료</h2>
            <textarea
              value={formData.main_materials}
              onChange={(e) => setFormData(prev => ({ ...prev, main_materials: e.target.value }))}
              placeholder="예: 수채화 물감, 8절 도화지, 둥근 붓"
              rows={3}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl"
            />
          </div>

          {/* 학부모 안내멘트 */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <h2 className="font-bold text-gray-800 mb-2">💬 학부모 안내멘트</h2>
            <p className="text-sm text-gray-500 mb-3">일일 메시지 생성 시 사용됩니다</p>
            <textarea
              value={formData.parent_message_template}
              onChange={(e) => setFormData(prev => ({ ...prev, parent_message_template: e.target.value }))}
              placeholder="예: 오늘은 겨울 풍경을 수채화로 표현해보았습니다. 차가운 색과 따뜻한 색의 대비를 통해 겨울의 느낌을 살려보았어요."
              rows={4}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl"
            />
          </div>

          {/* 지도 포인트 */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-800">📌 지도 포인트</h2>
              <button
                onClick={addTeachingPoint}
                className="px-3 py-1 bg-teal-100 text-teal-700 rounded-lg text-sm"
              >
                + 추가
              </button>
            </div>

            {formData.teaching_points.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-4">지도 포인트를 추가해주세요</p>
            ) : (
              <div className="space-y-4">
                {formData.teaching_points.map((point, idx) => (
                  <div key={idx} className="bg-gray-50 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium text-gray-700">포인트 {idx + 1}</span>
                      <button
                        onClick={() => removeTeachingPoint(idx)}
                        className="text-red-500 text-sm"
                      >
                        삭제
                      </button>
                    </div>
                    <input
                      type="text"
                      value={point.title}
                      onChange={(e) => updateTeachingPoint(idx, 'title', e.target.value)}
                      placeholder="제목 (예: 1. 큰 붓으로 배경 채우기)"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg mb-2"
                    />
                    <textarea
                      value={point.description}
                      onChange={(e) => updateTeachingPoint(idx, 'description', e.target.value)}
                      placeholder="설명"
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg mb-2"
                    />
                    <div className="flex items-center gap-2">
                      {point.image_url ? (
                        <img src={point.image_url} alt="" className="w-16 h-16 object-cover rounded-lg" />
                      ) : null}
                      <label className="px-3 py-2 bg-gray-200 text-gray-600 rounded-lg text-sm cursor-pointer">
                        {point.image_url ? '이미지 변경' : '과정 사진 추가'}
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleTeachingPointImage(e, idx)}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 유의사항 */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <h2 className="font-bold text-gray-800 mb-4">⚠️ 유의사항</h2>
            <textarea
              value={formData.cautions}
              onChange={(e) => setFormData(prev => ({ ...prev, cautions: e.target.value }))}
              placeholder="예: 물감 농도가 너무 진하지 않도록 주의"
              rows={3}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl"
            />
          </div>

          {/* 재료 구입처 */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <h2 className="font-bold text-gray-800 mb-4">🛒 재료 구입처</h2>
            <textarea
              value={formData.material_sources}
              onChange={(e) => setFormData(prev => ({ ...prev, material_sources: e.target.value }))}
              placeholder="예: 화방넷 www.hwabang.net"
              rows={2}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl"
            />
          </div>

          {/* Variation Guide */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <h2 className="font-bold text-gray-800 mb-4">💡 Variation Guide</h2>
            
            <textarea
              value={formData.variation_description}
              onChange={(e) => setFormData(prev => ({ ...prev, variation_description: e.target.value }))}
              placeholder="예: 배경색을 바꿔서 봄/여름 버전으로 응용 가능"
              rows={3}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl mb-4"
            />

            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-gray-600">참고 자료</span>
              <button
                onClick={addVariationReference}
                className="px-3 py-1 bg-gray-100 text-gray-600 rounded-lg text-sm"
              >
                + 추가
              </button>
            </div>

            {formData.variation_references.map((ref, idx) => (
              <div key={idx} className="flex items-center gap-3 mb-3 bg-gray-50 p-3 rounded-xl">
                {ref.image_url ? (
                  <img src={ref.image_url} alt="" className="w-16 h-16 object-cover rounded-lg" />
                ) : (
                  <label className="w-16 h-16 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center cursor-pointer">
                    <span className="text-gray-400 text-xs">사진</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleVariationImage(e, idx)}
                      className="hidden"
                    />
                  </label>
                )}
                <input
                  type="text"
                  value={ref.title}
                  onChange={(e) => updateVariationReference(idx, 'title', e.target.value)}
                  placeholder="제목 (예: 모네의 수련)"
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg"
                />
                <button
                  onClick={() => removeVariationReference(idx)}
                  className="text-red-500"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          {/* 저장 버튼 */}
          <div className="flex gap-3">
            <button
              onClick={() => handleSubmit('draft')}
              disabled={saving}
              className="flex-1 py-3 bg-gray-200 text-gray-700 rounded-xl font-medium"
            >
              {saving ? '저장 중...' : '임시저장'}
            </button>
            <button
              onClick={() => handleSubmit('active')}
              disabled={saving}
              className="flex-1 py-3 bg-teal-500 text-white rounded-xl font-medium"
            >
              {saving ? '저장 중...' : '저장하기'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
