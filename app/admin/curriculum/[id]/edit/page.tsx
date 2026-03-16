'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useUserContext } from '@/lib/UserContext'

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

interface StageMessage {
  label: string
  message: string
}

const STAGE_PRESETS: { [key: string]: StageMessage[] } = {
  drawing: [
    { label: '스케치', message: '' },
    { label: '채색', message: '' },
    { label: '디테일', message: '' },
    { label: '완성', message: '' },
  ],
  crafting: [
    { label: '도안', message: '' },
    { label: '조립', message: '' },
    { label: '꾸미기', message: '' },
    { label: '완성', message: '' },
  ],
  mixed: [
    { label: '스케치', message: '' },
    { label: '채색', message: '' },
    { label: '조립', message: '' },
    { label: '꾸미기', message: '' },
    { label: '완성', message: '' },
  ],
}

const LESSON_CATEGORY_OPTIONS = [
  { key: 'drawing', label: '드로잉' },
  { key: 'crafting', label: '만들기' },
  { key: 'mixed', label: '혼합' },
]

export default function EditCurriculumPage() {
  const router = useRouter()
  const params = useParams()
  const curriculumId = params.id as string
  const { userRole, isLoading: userLoading } = useUserContext()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const formChangedRef = useRef(false)

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
    parent_message_template: '',
    lesson_category: 'drawing' as string,
    stage_messages: [] as StageMessage[],
  })

  // 권한 체크: admin만 접근 가능
  useEffect(() => {
    if (!userLoading && userRole && userRole !== 'none' && userRole !== 'admin' && userRole !== 'staff') {
      alert('관리자 권한이 필요합니다.')
      router.push('/dashboard')
    }
  }, [userLoading, userRole, router])

  useEffect(() => {
    if (!userLoading && (userRole === 'admin' || userRole === 'staff') && curriculumId) {
      loadCurriculum()
    }
  }, [userLoading, userRole, curriculumId])

  // formData 변경 추적
  useEffect(() => {
    formChangedRef.current = true
  }, [formData])

  // 페이지 이탈 경고
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (formChangedRef.current) {
        e.preventDefault()
        e.returnValue = '작성 중인 내용이 있습니다. 페이지를 떠나시겠습니까?'
        return e.returnValue
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

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
      teaching_points: (data.teaching_points || []).map((p: any) => ({
        title: p.title || '',
        description: p.description || '',
        image_url: p.image_url || '',
        image_urls: p.image_urls && p.image_urls.length > 0 ? p.image_urls : (p.image_url ? [p.image_url] : [])
      })),
      cautions: data.cautions || '',
      material_sources: data.material_sources || '',
      variation_description: data.variation_guide?.description || '',
      variation_references: data.variation_guide?.references || [],
      status: data.status,
      parent_message_template: data.parent_message_template || '',
      lesson_category: data.lesson_category || 'drawing',
      stage_messages: data.stage_messages || [],
    })

    setLoading(false)
  }

  const compressImage = async (file: File): Promise<Blob> => {
    const bitmap = await createImageBitmap(file)
    const canvas = document.createElement('canvas')
    const maxSize = 800
    let { width, height } = bitmap
    
    if (width > maxSize || height > maxSize) {
      if (width > height) {
        height = Math.round((height / width) * maxSize)
        width = maxSize
      } else {
        width = Math.round((width / height) * maxSize)
        height = maxSize
      }
    }
    
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()
    
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob!), 'image/jpeg', 0.7)
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

    const uploads = Array.from(files).map(file => 
      uploadImage(file, `main/${formData.year}/${formData.month}`)
    )
    const urls = (await Promise.all(uploads)).filter((url): url is string => url !== null)
    
    if (urls.length > 0) {
      setFormData(prev => ({
        ...prev,
        main_images: [...prev.main_images, ...urls]
      }))
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

  const handleTeachingPointImages = async (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const files = e.target.files
    if (!files) return

    for (const file of Array.from(files)) {
      const url = await uploadImage(file, `points/${formData.year}/${formData.month}`)
      if (url) {
        setFormData(prev => ({
          ...prev,
          teaching_points: prev.teaching_points.map((point, i) =>
            i === index ? { ...point, image_urls: [...point.image_urls, url] } : point
          )
        }))
      }
    }
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

  // === 단계별 멘트 관리 ===
  const handleLessonCategoryChange = (category: string) => {
    setFormData(prev => {
      const hasCustomMessages = prev.stage_messages.some(s => s.message.trim() !== '')
      if (hasCustomMessages) {
        if (!confirm('수업 유형을 변경하면 기존 단계가 초기화됩니다. 계속하시겠습니까?')) {
          return prev
        }
      }
      return {
        ...prev,
        lesson_category: category,
        stage_messages: STAGE_PRESETS[category] || STAGE_PRESETS.drawing,
      }
    })
  }

  const updateStageMessage = (index: number, field: 'label' | 'message', value: string) => {
    setFormData(prev => ({
      ...prev,
      stage_messages: prev.stage_messages.map((s, i) =>
        i === index ? { ...s, [field]: value } : s
      ),
    }))
  }

  const addStage = () => {
    if (formData.stage_messages.length >= 5) {
      alert('최대 5개까지 등록할 수 있습니다.')
      return
    }
    setFormData(prev => ({
      ...prev,
      stage_messages: [...prev.stage_messages, { label: '', message: '' }],
    }))
  }

  const removeStage = (index: number) => {
    if (formData.stage_messages.length <= 3) {
      alert('최소 3개의 단계가 필요합니다.')
      return
    }
    setFormData(prev => ({
      ...prev,
      stage_messages: prev.stage_messages.filter((_, i) => i !== index),
    }))
  }

  const handleSubmit = async (status: string) => {
    if (!formData.title.trim()) {
      alert('제목을 입력해주세요.')
      return
    }

    if (status === 'active' && formData.main_images.length === 0) {
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
        teaching_points: formData.teaching_points
          .filter(p => p.title.trim() || p.description.trim() || p.image_urls.length > 0)
          .map(p => ({
            title: p.title,
            description: p.description,
            image_url: p.image_urls[0] || '',
            image_urls: p.image_urls
          })),
        cautions: formData.cautions || null,
        material_sources: formData.material_sources || null,
        variation_guide: {
          description: formData.variation_description || null,
          references: formData.variation_references.filter(r => r.title.trim() && r.image_url)
        },
        status: status,
        updated_at: new Date().toISOString(),
        parent_message_template: formData.parent_message_template || null,
        age_group: formData.target_group === '유치부' ? 'kindergarten' : 'elementary',
        lesson_category: formData.lesson_category,
        stage_messages: formData.stage_messages.filter(s => s.label.trim()),
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

          {/* 수업 유형 */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <h2 className="font-bold text-gray-800 mb-4">🎯 수업 유형</h2>
            <div className="grid grid-cols-3 gap-2">
              {LESSON_CATEGORY_OPTIONS.map(opt => (
                <button
                  key={opt.key}
                  onClick={() => handleLessonCategoryChange(opt.key)}
                  className={`py-2.5 rounded-xl text-sm font-medium transition ${
                    formData.lesson_category === opt.key
                      ? 'bg-teal-500 text-white'
                      : 'bg-gray-50 text-gray-600 border border-gray-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 작품 소개 */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <h2 className="font-bold text-gray-800 mb-2">📝 작품 소개</h2>
            <p className="text-sm text-gray-500 mb-3">작품 시작 시 학부모에게 보내는 작품 설명입니다</p>
            <textarea
              value={formData.parent_message_template}
              onChange={(e) => setFormData(prev => ({ ...prev, parent_message_template: e.target.value }))}
              placeholder="예: 차가운 색과 따뜻한 색의 대비를 통해 겨울 느낌을 살려보는 수채화 작품입니다."
              rows={3}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl"
            />
          </div>

          {/* 단계별 학부모 안내멘트 */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-bold text-gray-800">💬 단계별 학부모 안내멘트</h2>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              선생님이 단계를 선택하면 해당 멘트가 학부모에게 전달됩니다 (최소 3개 ~ 최대 5개)
            </p>

            {formData.stage_messages.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-gray-400 text-sm mb-3">수업 유형을 선택하면 기본 단계가 세팅됩니다</p>
                <button
                  onClick={() => handleLessonCategoryChange(formData.lesson_category || 'drawing')}
                  className="px-4 py-2 bg-teal-500 text-white rounded-xl text-sm"
                >
                  기본 단계 불러오기
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {formData.stage_messages.map((stage, idx) => (
                  <div key={idx} className="bg-gray-50 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 bg-teal-500 text-white rounded-full text-xs flex items-center justify-center font-medium">
                          {idx + 1}
                        </span>
                        <input
                          type="text"
                          value={stage.label}
                          onChange={(e) => updateStageMessage(idx, 'label', e.target.value)}
                          placeholder="단계명"
                          disabled={idx === formData.stage_messages.length - 1 && stage.label === '완성'}
                          className={`px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-medium w-32 ${
                            idx === formData.stage_messages.length - 1 && stage.label === '완성' ? 'bg-gray-100 text-gray-500' : ''
                          }`}
                        />
                      </div>
                      {formData.stage_messages.length > 3 && idx !== formData.stage_messages.length - 1 && (
                        <button
                          onClick={() => removeStage(idx)}
                          className="text-red-500 text-sm"
                        >
                          삭제
                        </button>
                      )}
                    </div>
                    <textarea
                      value={stage.message}
                      onChange={(e) => updateStageMessage(idx, 'message', e.target.value)}
                      placeholder={`이 단계에서 학부모에게 보낼 멘트를 입력하세요\n예: 오늘은 겨울 풍경의 구도를 잡고 연필로 스케치를 진행해보았어요.`}
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    />
                  </div>
                ))}
              </div>
            )}
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
                      placeholder="설명"
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg mb-2"
                    />
                    <div className="grid grid-cols-4 gap-2">
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
                          onChange={(e) => handleTeachingPointImages(e, idx)}
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
                  <div className="relative">
                    <img src={ref.image_url} alt="" className="w-16 h-16 object-cover rounded-lg" />
                    <label className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-lg cursor-pointer opacity-0 hover:opacity-100 transition">
                      <span className="text-white text-xs">변경</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleVariationImage(e, idx)}
                        className="hidden"
                      />
                    </label>
                  </div>
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
                <span className="flex-1 text-sm text-gray-400">참고 이미지 {idx + 1}</span>
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
