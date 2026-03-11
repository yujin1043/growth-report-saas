'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface TeachingPoint {
  title: string
  description: string
  image_url: string
  image_urls: string[]
}

interface VariationReference {
  title: string
  image_url: string
}

export default function EditCurriculumPage() {
  const router = useRouter()
  const params = useParams()
  const curriculumId = params.id as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [draftSavedMsg, setDraftSavedMsg] = useState('')
  const formChangedRef = useRef(false)

  const [formData, setFormData] = useState({
    year: 2025,
    month: 1,
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

  // 드래그 상태
  const [dragOverMain, setDragOverMain] = useState(false)
  const [dragOverPointIndex, setDragOverPointIndex] = useState<number | null>(null)

  useEffect(() => {
    checkAuthAndLoad()
  }, [curriculumId])

  // 페이지 이탈 경고
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (formChangedRef.current) {
        e.preventDefault()
        e.returnValue = '수정 중인 내용이 있습니다. 페이지를 떠나시겠습니까?'
        return e.returnValue
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  // formData 변경 추적
  useEffect(() => {
    if (!loading) formChangedRef.current = true
  }, [formData, loading])

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

    if (!profile || profile.role !== 'admin') {
      alert('관리자 권한이 필요합니다.')
      router.push('/dashboard')
      return
    }

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

    // teaching_points 호환성 처리: image_url → image_urls
    const migratedPoints = (data.teaching_points || []).map((p: any) => ({
      title: p.title || '',
      description: p.description || '',
      image_url: p.image_url || '',
      image_urls: p.image_urls || (p.image_url ? [p.image_url] : [])
    }))

    setFormData({
      year: data.year,
      month: data.month,
      target_group: data.target_group,
      title: data.title,
      main_images: data.main_images || [],
      main_materials: data.main_materials || '',
      teaching_points: migratedPoints,
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

  const processImageFiles = async (files: File[], folder: string): Promise<string[]> => {
    const urls: string[] = []
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue
      const url = await uploadImage(file, folder)
      if (url) urls.push(url)
    }
    return urls
  }

  // === 메인 이미지 ===
  const handleMainImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    const urls = await processImageFiles(Array.from(files), `main/${formData.year}/${formData.month}`)
    if (urls.length > 0) {
      setFormData(prev => ({ ...prev, main_images: [...prev.main_images, ...urls] }))
    }
  }

  const handleMainImageDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOverMain(false)
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
    if (files.length === 0) return
    const urls = await processImageFiles(files, `main/${formData.year}/${formData.month}`)
    if (urls.length > 0) {
      setFormData(prev => ({ ...prev, main_images: [...prev.main_images, ...urls] }))
    }
  }

  const removeMainImage = (index: number) => {
    setFormData(prev => ({
      ...prev,
      main_images: prev.main_images.filter((_, i) => i !== index)
    }))
  }

  // === 지도 포인트 ===
  const addTeachingPoint = () => {
    setFormData(prev => ({
      ...prev,
      teaching_points: [...prev.teaching_points, { title: '', description: '', image_url: '', image_urls: [] }]
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

  const handleTeachingPointImages = async (files: File[], index: number) => {
    const urls = await processImageFiles(files, `points/${formData.year}/${formData.month}`)
    if (urls.length > 0) {
      setFormData(prev => ({
        ...prev,
        teaching_points: prev.teaching_points.map((point, i) =>
          i === index ? { ...point, image_urls: [...point.image_urls, ...urls] } : point
        )
      }))
    }
  }

  const handleTeachingPointImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const files = e.target.files
    if (!files) return
    await handleTeachingPointImages(Array.from(files), index)
  }

  const handleTeachingPointImageDrop = async (e: React.DragEvent, index: number) => {
    e.preventDefault()
    setDragOverPointIndex(null)
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
    if (files.length === 0) return
    await handleTeachingPointImages(files, index)
  }

  const removeTeachingPointImage = (pointIndex: number, imageIndex: number) => {
    setFormData(prev => ({
      ...prev,
      teaching_points: prev.teaching_points.map((point, i) =>
        i === pointIndex ? { ...point, image_urls: point.image_urls.filter((_, j) => j !== imageIndex) } : point
      )
    }))
  }

  const removeTeachingPoint = (index: number) => {
    setFormData(prev => ({
      ...prev,
      teaching_points: prev.teaching_points.filter((_, i) => i !== index)
    }))
  }

  // === Variation ===
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
    if (url) updateVariationReference(index, 'image_url', url)
  }

  const removeVariationReference = (index: number) => {
    setFormData(prev => ({
      ...prev,
      variation_references: prev.variation_references.filter((_, i) => i !== index)
    }))
  }

  // === 저장 ===
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
    setDraftSavedMsg('')

    try {
      const cleanedPoints = formData.teaching_points
        .filter(p => p.description.trim() || p.image_urls.length > 0)
        .map(p => ({
          title: '',
          description: p.description,
          image_url: p.image_urls[0] || '',
          image_urls: p.image_urls
        }))

      const updateData = {
        year: formData.year,
        month: formData.month,
        target_group: formData.target_group,
        title: formData.title,
        thumbnail_url: formData.main_images[0] || null,
        main_images: formData.main_images,
        main_materials: formData.main_materials || null,
        teaching_points: cleanedPoints,
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

      formChangedRef.current = false

      if (status === 'active') {
        alert('수정되었습니다!')
        router.push('/admin/curriculum')
      } else {
        // 임시저장: 페이지 유지
        setDraftSavedMsg('임시저장 되었습니다!')
        setTimeout(() => setDraftSavedMsg(''), 3000)
      }

    } catch (error) {
      console.error('Error:', error)
      alert('저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
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

      {/* 임시저장 성공 메시지 */}
      {draftSavedMsg && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-green-500 text-white px-6 py-3 rounded-xl shadow-lg animate-bounce">
          ✓ {draftSavedMsg}
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="space-y-6">
          {/* 기본 정보 */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <h2 className="font-bold text-gray-800 mb-4">📌 기본 정보</h2>
            
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">연도</label>
                <select
                  value={formData.year}
                  onChange={(e) => setFormData(prev => ({ ...prev, year: Number(e.target.value) }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl"
                >
                  {[2024, 2025, 2026, 2027].map(y => (
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
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                    <option key={m} value={m}>{m}월</option>
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
              <label className="block text-sm text-gray-600 mb-1">제목</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="예: 겨울 풍경 수채화"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl"
              />
            </div>
          </div>

          {/* 완성작품 사진 */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <h2 className="font-bold text-gray-800 mb-4">📷 완성작품 사진</h2>
            <div
              className={`grid grid-cols-3 gap-3 p-3 rounded-xl border-2 border-dashed transition-colors ${
                dragOverMain ? 'border-teal-400 bg-teal-50' : 'border-gray-200'
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragOverMain(true) }}
              onDragLeave={() => setDragOverMain(false)}
              onDrop={handleMainImageDrop}
            >
              {formData.main_images.map((url, idx) => (
                <div key={idx} className="relative aspect-square">
                  <img src={url} alt="" className="w-full h-full object-cover rounded-lg" />
                  <button
                    onClick={() => removeMainImage(idx)}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full text-xs flex items-center justify-center shadow"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <label className="aspect-square border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 transition">
                <span className="text-2xl text-gray-300 mb-1">+</span>
                <span className="text-xs text-gray-400">{uploading ? '...' : '추가'}</span>
                <span className="text-xs text-gray-300 mt-1">또는 끌어다 놓기</span>
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
              placeholder="예: 오늘은 겨울 풍경을 수채화로 표현해보았습니다."
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

                    <textarea
                      value={point.description}
                      onChange={(e) => updateTeachingPoint(idx, 'description', e.target.value)}
                      placeholder="설명을 입력해주세요"
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg mb-3"
                    />

                    {/* 복수 이미지 영역 */}
                    <div
                      className={`grid grid-cols-4 gap-2 p-2 rounded-lg border-2 border-dashed transition-colors ${
                        dragOverPointIndex === idx ? 'border-teal-400 bg-teal-50' : 'border-gray-200'
                      }`}
                      onDragOver={(e) => { e.preventDefault(); setDragOverPointIndex(idx) }}
                      onDragLeave={() => setDragOverPointIndex(null)}
                      onDrop={(e) => handleTeachingPointImageDrop(e, idx)}
                    >
                      {point.image_urls.map((url, imgIdx) => (
                        <div key={imgIdx} className="relative aspect-square">
                          <img src={url} alt="" className="w-full h-full object-cover rounded-lg" />
                          <button
                            onClick={() => removeTeachingPointImage(idx, imgIdx)}
                            className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                      <label className="aspect-square border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:bg-white transition">
                        <span className="text-lg text-gray-300">+</span>
                        <span className="text-xs text-gray-400">사진</span>
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={(e) => handleTeachingPointImageUpload(e, idx)}
                          className="hidden"
                        />
                      </label>
                    </div>
                    {point.image_urls.length === 0 && (
                      <p className="text-xs text-gray-400 mt-1 text-center">이미지를 끌어다 놓거나 + 버튼으로 추가</p>
                    )}
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
