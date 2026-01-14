'use client'

import { useEffect, useState, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import ReactCrop, { Crop, PixelCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'

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

interface ReportContent {
  content_form: string
  content_color: string
  content_expression: string
  content_strength: string
  content_attitude: string
  content_direction: string
}

interface ImageEditState {
  originalFile: File | null
  originalUrl: string | null
  rotation: number
  crop?: Crop
  croppedUrl: string | null
}

function NewReportPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const studentId = searchParams.get('studentId')

  const [student, setStudent] = useState<Student | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)

  const [periodStart, setPeriodStart] = useState('25.01')
  const [periodEnd, setPeriodEnd] = useState('25.03')
  const [teacherMemo, setTeacherMemo] = useState('')
  const [parentRequest, setParentRequest] = useState('')
  
  // 이미지 편집 상태
  const [imageBefore, setImageBefore] = useState<ImageEditState>({
    originalFile: null, originalUrl: null, rotation: 0, croppedUrl: null
  })
  const [imageAfter, setImageAfter] = useState<ImageEditState>({
    originalFile: null, originalUrl: null, rotation: 0, croppedUrl: null
  })
  
  // 편집 모달 상태
  const [editingImage, setEditingImage] = useState<'before' | 'after' | null>(null)
  const [tempCrop, setTempCrop] = useState<Crop>()
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>()
  const imgRef = useRef<HTMLImageElement>(null)

  const [reportContent, setReportContent] = useState<ReportContent | null>(null)
  const [showResult, setShowResult] = useState(false)
  const [editingField, setEditingField] = useState<string | null>(null)

  const currentYear = new Date().getFullYear()

  useEffect(() => {
    if (studentId) {
      loadStudent()
    }
  }, [studentId])

  async function loadStudent() {
    const { data, error } = await supabase
      .from('students')
      .select('id, student_code, name, birth_year, branch_id, classes(name)')
      .eq('id', studentId)
      .single()

    if (!error && data) {
      setStudent({
        ...data,
        classes: Array.isArray(data.classes) 
          ? data.classes[0] || null 
          : data.classes
      })
    }
    setLoading(false)
  }

  const getAge = (birthYear: number) => currentYear - birthYear + 1

  // 이미지 선택 핸들러
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>, type: 'before' | 'after') => {
    const file = e.target.files?.[0]
    if (file) {
      const url = URL.createObjectURL(file)
      const newState: ImageEditState = {
        originalFile: file,
        originalUrl: url,
        rotation: 0,
        croppedUrl: url
      }
      if (type === 'before') {
        setImageBefore(newState)
      } else {
        setImageAfter(newState)
      }
    }
  }

  // 편집 모달 열기
  const openEditModal = (type: 'before' | 'after') => {
    setEditingImage(type)
    setTempCrop(undefined)
    setCompletedCrop(undefined)
  }

  // 회전
  const handleRotate = (direction: 'left' | 'right') => {
    if (!editingImage) return
    const current = editingImage === 'before' ? imageBefore : imageAfter
    const newRotation = direction === 'right' 
      ? (current.rotation + 90) % 360 
      : (current.rotation - 90 + 360) % 360
    
    if (editingImage === 'before') {
      setImageBefore({ ...current, rotation: newRotation })
    } else {
      setImageAfter({ ...current, rotation: newRotation })
    }
  }

  // 자르기 적용
  const applyCrop = async () => {
    if (!editingImage || !imgRef.current || !completedCrop) {
      closeEditModal()
      return
    }

    const image = imgRef.current
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const scaleX = image.naturalWidth / image.width
    const scaleY = image.naturalHeight / image.height

    canvas.width = completedCrop.width * scaleX
    canvas.height = completedCrop.height * scaleY

    ctx.drawImage(
      image,
      completedCrop.x * scaleX,
      completedCrop.y * scaleY,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY,
      0,
      0,
      canvas.width,
      canvas.height
    )

    const croppedUrl = canvas.toDataURL('image/jpeg', 0.9)
    
    if (editingImage === 'before') {
      setImageBefore(prev => ({ ...prev, croppedUrl }))
    } else {
      setImageAfter(prev => ({ ...prev, croppedUrl }))
    }

    closeEditModal()
  }

  // 회전 적용 (자르기 없이)
  const applyRotationOnly = async () => {
    if (!editingImage) return
    
    const current = editingImage === 'before' ? imageBefore : imageAfter
    if (!current.originalUrl || current.rotation === 0) {
      closeEditModal()
      return
    }

    const image = new Image()
    image.src = current.originalUrl
    await new Promise(resolve => image.onload = resolve)

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rotation = current.rotation
    if (rotation === 90 || rotation === 270) {
      canvas.width = image.height
      canvas.height = image.width
    } else {
      canvas.width = image.width
      canvas.height = image.height
    }

    ctx.translate(canvas.width / 2, canvas.height / 2)
    ctx.rotate((rotation * Math.PI) / 180)
    ctx.drawImage(image, -image.width / 2, -image.height / 2)

    const rotatedUrl = canvas.toDataURL('image/jpeg', 0.9)
    
    if (editingImage === 'before') {
      setImageBefore(prev => ({ ...prev, croppedUrl: rotatedUrl }))
    } else {
      setImageAfter(prev => ({ ...prev, croppedUrl: rotatedUrl }))
    }

    closeEditModal()
  }

  // 모달 닫기
  const closeEditModal = () => {
    setEditingImage(null)
    setTempCrop(undefined)
    setCompletedCrop(undefined)
  }

  // 편집 완료
  const handleEditComplete = () => {
    if (completedCrop && completedCrop.width > 0 && completedCrop.height > 0) {
      applyCrop()
    } else {
      applyRotationOnly()
    }
  }

  // 최종 이미지 파일 생성
  const getFinalImageFile = async (imageState: ImageEditState): Promise<File | null> => {
    if (!imageState.croppedUrl) return null
    
    const response = await fetch(imageState.croppedUrl)
    const blob = await response.blob()
    return new File([blob], 'image.jpg', { type: 'image/jpeg' })
  }

  // 이미지를 Base64로 변환
  const convertToBase64 = async (url: string): Promise<string> => {
    const response = await fetch(url)
    const blob = await response.blob()
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  }

  async function handleGenerate() {
    if (!student) return

    if (!imageBefore.croppedUrl || !imageAfter.croppedUrl) {
      alert('이전 작품과 최근 작품 사진을 모두 업로드해주세요.')
      return
    }
    if (!teacherMemo.trim()) {
      alert('교사 관찰 메모를 입력해주세요.')
      return
    }

    setGenerating(true)

    try {
      // 이미지를 Base64로 변환
      const imageBeforeBase64 = await convertToBase64(imageBefore.croppedUrl)
      const imageAfterBase64 = await convertToBase64(imageAfter.croppedUrl)

      const response = await fetch('/api/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentName: student.name,
          studentAge: getAge(student.birth_year),
          className: student.classes?.name,
          teacherMemo,
          parentRequest,
          imageBeforeBase64,
          imageAfterBase64
        })
      })

      if (!response.ok) {
        throw new Error('AI 생성 실패')
      }

      const data = await response.json()
      setReportContent(data)
      setShowResult(true)

    } catch (error) {
      console.error('Error:', error)
      alert('AI 리포트 생성에 실패했습니다. 다시 시도해주세요.')
    } finally {
      setGenerating(false)
    }
  }

  const handleFieldChange = (field: string, value: string) => {
    if (reportContent) {
      setReportContent({
        ...reportContent,
        [field]: value
      })
    }
  }

  async function uploadImage(file: File, studentId: string, type: string): Promise<string | null> {
    const timestamp = Date.now()
    const fileExt = 'jpg'
    const fileName = `${studentId}/${timestamp}_${type}.${fileExt}`

    const { data, error } = await supabase.storage
      .from('artworks')
      .upload(fileName, file)

    if (error) {
      console.error('Upload error:', error)
      return null
    }

    const { data: urlData } = supabase.storage
      .from('artworks')
      .getPublicUrl(fileName)

    return urlData.publicUrl
  }

  async function handleSave() {
    if (!student || !reportContent) return

    setSaving(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        alert('로그인이 필요합니다.')
        router.push('/login')
        return
      }

      let imageBeforeUrl = null
      let imageAfterUrl = null

      const beforeFile = await getFinalImageFile(imageBefore)
      const afterFile = await getFinalImageFile(imageAfter)

      if (beforeFile) {
        imageBeforeUrl = await uploadImage(beforeFile, student.id, 'before')
      }
      if (afterFile) {
        imageAfterUrl = await uploadImage(afterFile, student.id, 'after')
      }

      let branchId = student.branch_id
      if (!branchId) {
        const { data: branches } = await supabase
          .from('branches')
          .select('id')
          .limit(1)
          .single()
        branchId = branches?.id
      }

      const insertData = {
        student_id: student.id,
        branch_id: branchId,
        created_by: user.id,
        period_start: periodStart,
        period_end: periodEnd,
        teacher_memo: teacherMemo,
        parent_request: parentRequest || null,
        image_before_url: imageBeforeUrl,
        image_after_url: imageAfterUrl,
        content_form: reportContent.content_form,
        content_color: reportContent.content_color,
        content_expression: reportContent.content_expression,
        content_strength: reportContent.content_strength,
        content_attitude: reportContent.content_attitude,
        content_direction: reportContent.content_direction
      }

      const { data, error } = await supabase
        .from('reports')
        .insert(insertData)
        .select()

      if (error) {
        console.error('Supabase error:', error)
        alert(`저장 실패: ${error.message}`)
        return
      }

      alert('리포트가 저장되었습니다!')
      router.push(`/students/${student.id}`)

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

  if (!student) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-4xl mb-3">😢</p>
          <p className="text-gray-500">학생을 찾을 수 없습니다</p>
        </div>
      </div>
    )
  }

  // 현재 편집 중인 이미지 데이터
  const currentEditImage = editingImage === 'before' ? imageBefore : imageAfter

  // AI 생성 결과 화면
  if (showResult && reportContent) {
    const sections = [
      { key: 'content_form', label: '형태', icon: '📐' },
      { key: 'content_color', label: '색채', icon: '🎨' },
      { key: 'content_expression', label: '표현', icon: '✨' },
      { key: 'content_strength', label: '강점', icon: '💪' },
      { key: 'content_attitude', label: '수업태도 및 감성', icon: '💫' },
      { key: 'content_direction', label: '향후 지도방향', icon: '🎯' },
    ]

    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <header className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-40 border-b border-gray-200/50">
          <div className="max-w-2xl mx-auto px-4 py-3 md:py-4">
            <div className="flex items-center justify-between">
              <button onClick={() => setShowResult(false)} className="text-gray-500 hover:text-gray-700 transition text-sm md:text-base">
                ← 뒤로
              </button>
              <h1 className="text-base md:text-lg font-bold text-gray-800">리포트 확인</h1>
              <div className="w-10"></div>
            </div>
          </div>
        </header>

        <div className="max-w-2xl mx-auto px-4 py-4 md:py-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-5 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-teal-400 to-cyan-500 rounded-xl flex items-center justify-center text-white text-lg font-bold shadow-lg shadow-teal-500/30">
                {student.name.charAt(0)}
              </div>
              <div>
                <p className="font-bold text-gray-800">{student.name}</p>
                <p className="text-sm text-gray-500">{periodStart} ~ {periodEnd} · {student.classes?.name} · {getAge(student.birth_year)}세</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-5 mb-4">
            <h3 className="font-semibold text-gray-800 mb-3">📷 작품 비교</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-gray-400 text-center mb-2">이전</p>
                {imageBefore.croppedUrl && (
                  <img src={imageBefore.croppedUrl} alt="이전" className="w-full rounded-xl" style={{ maxHeight: '150px', objectFit: 'contain' }} />
                )}
              </div>
              <div>
                <p className="text-xs text-gray-400 text-center mb-2">최근</p>
                {imageAfter.croppedUrl && (
                  <img src={imageAfter.croppedUrl} alt="최근" className="w-full rounded-xl" style={{ maxHeight: '150px', objectFit: 'contain' }} />
                )}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {sections.map((section) => (
              <div key={section.key} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-800">{section.icon} {section.label}</h3>
                  <button
                    onClick={() => setEditingField(editingField === section.key ? null : section.key)}
                    className="text-sm text-gray-400 hover:text-teal-600 transition"
                  >
                    {editingField === section.key ? '완료' : '수정'}
                  </button>
                </div>
                
                {editingField === section.key ? (
                  <textarea
                    value={reportContent[section.key as keyof ReportContent]}
                    onChange={(e) => handleFieldChange(section.key, e.target.value)}
                    rows={4}
                    className="w-full px-4 py-3 bg-gray-50 border-0 rounded-xl focus:ring-2 focus:ring-teal-500 text-sm"
                  />
                ) : (
                  <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">
                    {reportContent[section.key as keyof ReportContent]}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="mt-6 space-y-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full bg-gradient-to-r from-teal-500 to-cyan-500 text-white py-4 rounded-2xl font-medium hover:from-teal-600 hover:to-cyan-600 transition shadow-lg shadow-teal-500/30 disabled:opacity-50"
            >
              {saving ? '저장 중...' : '💾 저장하기'}
            </button>
            
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="w-full bg-gradient-to-r from-purple-500 to-indigo-500 text-white py-3 rounded-2xl font-medium hover:from-purple-600 hover:to-indigo-600 transition shadow-lg shadow-purple-500/30 disabled:opacity-50"
            >
              {generating ? '생성 중...' : '🔄 AI 다시 생성'}
            </button>
            
            <button
              onClick={() => setShowResult(false)}
              className="w-full bg-gray-100 text-gray-600 py-3 rounded-2xl font-medium hover:bg-gray-200 transition"
            >
              ← 입력 화면으로
            </button>
          </div>
        </div>
      </div>
    )
  }

  // 입력 화면
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <header className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-40 border-b border-gray-200/50">
        <div className="max-w-2xl mx-auto px-4 py-3 md:py-4">
          <div className="flex items-center justify-between">
            <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700 transition text-sm md:text-base">
              ← 뒤로
            </button>
            <h1 className="text-base md:text-lg font-bold text-gray-800">리포트 작성</h1>
            <div className="w-10"></div>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-4 md:py-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-5 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-teal-400 to-cyan-500 rounded-xl flex items-center justify-center text-white text-lg font-bold shadow-lg shadow-teal-500/30">
              {student.name.charAt(0)}
            </div>
            <div>
              <p className="font-bold text-gray-800">{student.name}</p>
              <p className="text-sm text-gray-500">{student.student_code} · {student.classes?.name} · {getAge(student.birth_year)}세</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-5 mb-4">
          <h2 className="font-semibold text-gray-800 mb-3">📅 지도 기간</h2>
          <div className="flex items-center gap-3">
            <input 
              type="text" 
              value={periodStart} 
              onChange={(e) => setPeriodStart(e.target.value)} 
              className="flex-1 px-4 py-3 bg-gray-50 border-0 rounded-xl text-center focus:ring-2 focus:ring-teal-500 text-sm" 
            />
            <span className="text-gray-400">~</span>
            <input 
              type="text" 
              value={periodEnd} 
              onChange={(e) => setPeriodEnd(e.target.value)} 
              className="flex-1 px-4 py-3 bg-gray-50 border-0 rounded-xl text-center focus:ring-2 focus:ring-teal-500 text-sm" 
            />
          </div>
        </div>

        {/* 작품 사진 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-5 mb-4">
          <h2 className="font-semibold text-gray-800 mb-3">📷 작품 사진</h2>
          <div className="grid grid-cols-2 gap-3">
            {/* 이전 작품 */}
            <div>
              <p className="text-xs text-gray-400 mb-2 text-center">이전 작품</p>
              {imageBefore.croppedUrl ? (
                <div className="relative">
                  <img 
                    src={imageBefore.croppedUrl} 
                    alt="이전" 
                    className="w-full rounded-xl border border-gray-100" 
                    style={{ maxHeight: '150px', objectFit: 'contain' }}
                  />
                  <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-2">
                    <button
                      onClick={() => openEditModal('before')}
                      className="px-3 py-1.5 bg-white/90 text-gray-700 rounded-lg text-xs font-medium shadow hover:bg-white transition"
                    >
                      ✏️ 편집
                    </button>
                    <label className="px-3 py-1.5 bg-white/90 text-gray-700 rounded-lg text-xs font-medium shadow hover:bg-white transition cursor-pointer">
                      🔄 변경
                      <input type="file" accept="image/*" onChange={(e) => handleImageSelect(e, 'before')} className="hidden" />
                    </label>
                  </div>
                </div>
              ) : (
                <label className="block cursor-pointer">
                  <div className="aspect-square border-2 border-dashed border-gray-200 rounded-2xl flex items-center justify-center overflow-hidden bg-gray-50 hover:bg-gray-100 transition">
                    <div className="text-center text-gray-400">
                      <p className="text-3xl mb-1">📷</p>
                      <p className="text-xs">사진 추가</p>
                    </div>
                  </div>
                  <input type="file" accept="image/*" onChange={(e) => handleImageSelect(e, 'before')} className="hidden" />
                </label>
              )}
            </div>

            {/* 최근 작품 */}
            <div>
              <p className="text-xs text-gray-400 mb-2 text-center">최근 작품</p>
              {imageAfter.croppedUrl ? (
                <div className="relative">
                  <img 
                    src={imageAfter.croppedUrl} 
                    alt="최근" 
                    className="w-full rounded-xl border border-gray-100" 
                    style={{ maxHeight: '150px', objectFit: 'contain' }}
                  />
                  <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-2">
                    <button
                      onClick={() => openEditModal('after')}
                      className="px-3 py-1.5 bg-white/90 text-gray-700 rounded-lg text-xs font-medium shadow hover:bg-white transition"
                    >
                      ✏️ 편집
                    </button>
                    <label className="px-3 py-1.5 bg-white/90 text-gray-700 rounded-lg text-xs font-medium shadow hover:bg-white transition cursor-pointer">
                      🔄 변경
                      <input type="file" accept="image/*" onChange={(e) => handleImageSelect(e, 'after')} className="hidden" />
                    </label>
                  </div>
                </div>
              ) : (
                <label className="block cursor-pointer">
                  <div className="aspect-square border-2 border-dashed border-gray-200 rounded-2xl flex items-center justify-center overflow-hidden bg-gray-50 hover:bg-gray-100 transition">
                    <div className="text-center text-gray-400">
                      <p className="text-3xl mb-1">📷</p>
                      <p className="text-xs">사진 추가</p>
                    </div>
                  </div>
                  <input type="file" accept="image/*" onChange={(e) => handleImageSelect(e, 'after')} className="hidden" />
                </label>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-5 mb-4">
          <h2 className="font-semibold text-gray-800 mb-3">📝 교사 관찰 메모</h2>
          <textarea 
            value={teacherMemo} 
            onChange={(e) => setTeacherMemo(e.target.value)} 
            placeholder="형태 표현, 색채 사용, 수업 태도 등 관찰한 내용을 자유롭게 입력해주세요." 
            rows={5} 
            className="w-full px-4 py-3 bg-gray-50 border-0 rounded-xl focus:ring-2 focus:ring-teal-500 text-sm resize-none" 
          />
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-5 mb-6">
          <h2 className="font-semibold text-gray-800 mb-3">💬 학부모 요청사항 <span className="text-gray-400 font-normal text-sm">(선택)</span></h2>
          <textarea 
            value={parentRequest} 
            onChange={(e) => setParentRequest(e.target.value)} 
            placeholder="학부모가 요청한 사항이 있으면 입력해주세요." 
            rows={2} 
            className="w-full px-4 py-3 bg-gray-50 border-0 rounded-xl focus:ring-2 focus:ring-teal-500 text-sm resize-none" 
          />
        </div>

        <button
          onClick={handleGenerate}
          disabled={generating}
          className="w-full bg-gradient-to-r from-teal-500 to-cyan-500 text-white py-4 rounded-2xl font-medium hover:from-teal-600 hover:to-cyan-600 transition shadow-lg shadow-teal-500/30 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {generating ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              AI 생성 중...
            </>
          ) : (
            '✨ AI 리포트 생성'
          )}
        </button>
      </div>

      {/* 이미지 편집 모달 */}
      {editingImage && currentEditImage.originalUrl && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-gray-800">이미지 편집</h3>
              <button onClick={closeEditModal} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            
            <div className="p-4 overflow-auto" style={{ maxHeight: 'calc(90vh - 160px)' }}>
              {/* 회전 버튼 */}
              <div className="flex justify-center gap-3 mb-4">
                <button
                  onClick={() => handleRotate('left')}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 transition"
                >
                  ↺ 왼쪽 회전
                </button>
                <button
                  onClick={() => handleRotate('right')}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 transition"
                >
                  ↻ 오른쪽 회전
                </button>
              </div>

              {/* 이미지 및 자르기 영역 */}
              <div className="flex justify-center">
                <ReactCrop
                  crop={tempCrop}
                  onChange={(c) => setTempCrop(c)}
                  onComplete={(c) => setCompletedCrop(c)}
                >
                  <img
                    ref={imgRef}
                    src={currentEditImage.originalUrl}
                    alt="편집"
                    style={{ 
                      maxHeight: '400px',
                      transform: `rotate(${currentEditImage.rotation}deg)`,
                      transition: 'transform 0.3s'
                    }}
                  />
                </ReactCrop>
              </div>

              <p className="text-xs text-gray-400 text-center mt-3">
                드래그하여 자를 영역을 선택하세요
              </p>
            </div>

            <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
              <button
                onClick={closeEditModal}
                className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-medium hover:bg-gray-200 transition"
              >
                취소
              </button>
              <button
                onClick={handleEditComplete}
                className="flex-1 py-3 bg-gradient-to-r from-teal-500 to-cyan-500 text-white rounded-xl font-medium hover:from-teal-600 hover:to-cyan-600 transition"
              >
                적용
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
export default function NewReportPageWrapper() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-500 mx-auto mb-4"></div>
          <p className="text-gray-500">로딩 중...</p>
        </div>
      </div>
    }>
      <NewReportPage />
    </Suspense>
  )
}