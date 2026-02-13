'use client'
import { compressImage } from '@/lib/imageUtils'

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

  // 지도 기간 (연/월 분리)
  const [startYear, setStartYear] = useState(new Date().getFullYear())
  const [startMonth, setStartMonth] = useState(1)
  const [endYear, setEndYear] = useState(new Date().getFullYear())
  const [endMonth, setEndMonth] = useState(3)
  // 향상된 부분 체크박스
  const [improvements, setImprovements] = useState<string[]>([])
  const [studentMemo, setStudentMemo] = useState('')
  const [parentRequest, setParentRequest] = useState('')
  const [showTooltip, setShowTooltip] = useState(false)

  // 향상된 부분 옵션
  const improvementOptions = [
    { key: 'form', label: '형태/구도', desc: '사물의 형태, 비례, 공간 배치' },
    { key: 'color', label: '색채 활용', desc: '색상 선택, 조화, 명암 표현' },
    { key: 'technique', label: '표현 기술', desc: '도구 사용, 디테일, 질감 표현' },
    { key: 'creativity', label: '창의성', desc: '독창적 발상, 자기만의 표현' },
    { key: 'focus', label: '집중력', desc: '수업 참여, 작업 몰입도' },
    { key: 'confidence', label: '자신감', desc: '표현에 대한 자신감, 적극성' },
  ]

  const toggleImprovement = (key: string) => {
    setImprovements(prev => 
      prev.includes(key) 
        ? prev.filter(k => k !== key)
        : [...prev, key]
    )
  }
  
  // 이미지 편집 상태
  const [imageBefore, setImageBefore] = useState<ImageEditState>({
    originalFile: null, originalUrl: null, rotation: 0, croppedUrl: null
  })
  const [imageAfter, setImageAfter] = useState<ImageEditState>({
    originalFile: null, originalUrl: null, rotation: 0, croppedUrl: null
  })
  
  // 편집 모달 상태
  const [editingImage, setEditingImage] = useState<'before' | 'after' | null>(null)

  useEffect(() => {
    if (editingImage) {
      document.body.classList.add('modal-open')
    } else {
      document.body.classList.remove('modal-open')
    }
    return () => document.body.classList.remove('modal-open')
  }, [editingImage])
  const [tempCrop, setTempCrop] = useState<Crop>()
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>()
  const imgRef = useRef<HTMLImageElement>(null)

  const [reportContent, setReportContent] = useState<ReportContent | null>(null)
  const [showResult, setShowResult] = useState(false)
  const [editingField, setEditingField] = useState<string | null>(null)

  const currentYear = new Date().getFullYear()
  
  // 지도기간 포맷 (예: "25.01")
  const periodStart = `${String(startYear).slice(2)}.${String(startMonth).padStart(2, '0')}`
  const periodEnd = `${String(endYear).slice(2)}.${String(endMonth).padStart(2, '0')}`
  
  // 연도 선택 옵션 (현재년도 기준 -2년 ~ +1년)
  const yearOptions = Array.from({ length: 4 }, (_, i) => currentYear - 2 + i)

  // 종료 기간이 시작 기간보다 이전이면 자동 조정
  useEffect(() => {
    const startDate = startYear * 12 + startMonth
    const endDate = endYear * 12 + endMonth
    
    if (endDate < startDate) {
      setEndYear(startYear)
      setEndMonth(startMonth)
    }
  }, [startYear, startMonth, endYear, endMonth])

  useEffect(() => {
    if (studentId) {
      loadStudent()
    }
  }, [studentId])

  async function loadStudent() {
    try {
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
    } catch (error) {
      console.error('Load error:', error)
    } finally {
      // ← 에러가 나도 반드시 로딩 해제
      setLoading(false)
    }
  }

  const getAge = (birthYear: number) => currentYear - birthYear + 1

  // 이미지 선택 핸들러
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>, type: 'before' | 'after') => {
    const file = e.target.files?.[0]
    
    // ① 취소 시 input 초기화 후 아무것도 하지 않음
    if (!file) {
      e.target.value = ''
      return
    }

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

    // ② 같은 파일 재선택 가능하도록 input 초기화
    e.target.value = ''
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
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        const MAX_SIZE = 800
        let width = img.width
        let height = img.height
        if (width > MAX_SIZE || height > MAX_SIZE) {
          if (width > height) {
            height = Math.round(height * MAX_SIZE / width)
            width = MAX_SIZE
          } else {
            width = Math.round(width * MAX_SIZE / height)
            height = MAX_SIZE
          }
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) { reject(new Error('Canvas error')); return }
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', 0.7))
      }
      img.onerror = reject
      img.src = url
    })
  }

  async function handleGenerate() {
    if (!student) return

    if (!imageBefore.croppedUrl || !imageAfter.croppedUrl) {
      alert('이전 작품과 최근 작품 사진을 모두 업로드해주세요.')
      return
    }
    if (improvements.length === 0) {
      alert('향상된 부분을 최소 1개 이상 선택해주세요.')
      return
    }
    if (studentMemo.trim().length < 10) {
      alert('학생 특성 메모를 10자 이상 입력해주세요.')
      return
    }

    setGenerating(true)

    // 체크박스 + 자유서술 조합하여 teacherMemo 생성
    const selectedImprovements = improvements
      .map(key => improvementOptions.find(opt => opt.key === key)?.label)
      .filter(Boolean)
      .join(', ')
    const teacherMemo = `[향상된 부분] ${selectedImprovements}\n[학생 특성] ${studentMemo.trim()}`

    try {
      // 이미지를 Base64로 변환
      const imageBeforeBase64 = await compressImage(imageBefore.croppedUrl, 512, 0.5)
      const imageAfterBase64 = await compressImage(imageAfter.croppedUrl, 512, 0.5)

      const fetchController = new AbortController()
      const fetchTimeout = setTimeout(() => fetchController.abort(), 35000)

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
        }),
        signal: fetchController.signal
      })

      clearTimeout(fetchTimeout)

      if (!response.ok) {
        throw new Error('AI 생성 실패')
      }

      const data = await response.json()
      setReportContent(data)
      setShowResult(true)

    } catch (error: any) {
      console.error('Error:', error)
      if (error.name === 'AbortError') {
        alert('AI 응답 시간이 초과되었습니다.\n네트워크 상태를 확인하고 다시 시도해주세요.')
      } else {
        alert('AI 리포트 생성에 실패했습니다. 다시 시도해주세요.')
      }
    } 
    
    finally {
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

      // 체크박스 + 자유서술 조합하여 teacherMemo 생성
      const selectedImprovements = improvements
        .map(key => improvementOptions.find(opt => opt.key === key)?.label)
        .filter(Boolean)
        .join(', ')
      const teacherMemo = `[향상된 부분] ${selectedImprovements}\n[학생 특성] ${studentMemo.trim()}`

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

      // ★ 학생의 last_report_at 업데이트 (이 줄 추가!)
      await supabase
        .from('students')
        .update({ last_report_at: new Date().toISOString() })
        .eq('id', student.id)

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

        {/* 지도 기간 - 연월 선택 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-5 mb-4">
          <h2 className="font-semibold text-gray-800 mb-3">📅 지도 기간</h2>
          <div className="flex items-center gap-2">
            {/* 시작 연월 */}
            <div className="flex-1 flex gap-1.5">
              <div className="relative flex-1">
                <select
                  value={startYear}
                  onChange={(e) => setStartYear(parseInt(e.target.value))}
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-center text-sm font-medium text-gray-700 focus:ring-2 focus:ring-teal-500 focus:border-transparent appearance-none cursor-pointer hover:bg-gray-100 transition"
                >
                  {yearOptions.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none">▼</span>
              </div>
              <div className="relative flex-1">
                <select
                  value={startMonth}
                  onChange={(e) => setStartMonth(parseInt(e.target.value))}
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-center text-sm font-medium text-gray-700 focus:ring-2 focus:ring-teal-500 focus:border-transparent appearance-none cursor-pointer hover:bg-gray-100 transition"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(month => (
                    <option key={month} value={month}>{month}월</option>
                  ))}
                </select>
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none">▼</span>
              </div>
            </div>
            
            <span className="text-gray-400 flex-shrink-0 font-medium">~</span>
            
            {/* 종료 연월 */}
            <div className="flex-1 flex gap-1.5">
              <div className="relative flex-1">
                <select
                  value={endYear}
                  onChange={(e) => setEndYear(parseInt(e.target.value))}
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-center text-sm font-medium text-gray-700 focus:ring-2 focus:ring-teal-500 focus:border-transparent appearance-none cursor-pointer hover:bg-gray-100 transition"
                >
                  {yearOptions.map(year => (
                    <option 
                      key={year} 
                      value={year}
                      disabled={year < startYear}
                      className={year < startYear ? 'text-gray-300' : ''}
                    >
                      {year}
                    </option>
                  ))}
                </select>
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none">▼</span>
              </div>
              <div className="relative flex-1">
                <select
                  value={endMonth}
                  onChange={(e) => setEndMonth(parseInt(e.target.value))}
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-center text-sm font-medium text-gray-700 focus:ring-2 focus:ring-teal-500 focus:border-transparent appearance-none cursor-pointer hover:bg-gray-100 transition"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(month => {
                    const isDisabled = endYear === startYear && month < startMonth
                    return (
                      <option 
                        key={month} 
                        value={month}
                        disabled={isDisabled}
                        className={isDisabled ? 'text-gray-300' : ''}
                      >
                        {month}월
                      </option>
                    )
                  })}
                </select>
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none">▼</span>
              </div>
            </div>
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

        {/* 교사 관찰 메모 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-5 mb-4">
          <h2 className="font-semibold text-gray-800 mb-3">📝 교사 관찰 메모</h2>
          
          {/* 향상된 부분 체크박스 */}
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <p className="text-sm text-gray-600">향상된 부분 <span className="text-red-500">*</span></p>
              <button
                type="button"
                onClick={() => setShowTooltip(!showTooltip)}
                className="text-gray-400 hover:text-gray-600 transition"
              >
                ⓘ
              </button>
            </div>
            
            {showTooltip && (
              <div className="mb-3 p-3 bg-gray-100 text-gray-700 text-xs rounded-xl border border-gray-200">
                <ul className="space-y-1.5">
                  {improvementOptions.map(option => (
                    <li key={option.key}>
                      <span className="font-medium">{option.label}</span>
                      <span className="text-gray-500"> - {option.desc}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              {improvementOptions.map(option => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => toggleImprovement(option.key)}
                  className={`w-full px-3 py-2.5 rounded-xl text-sm font-medium transition text-left ${
                    improvements.includes(option.key)
                      ? 'bg-teal-500 text-white'
                      : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200'
                  }`}
                >
                  {improvements.includes(option.key) ? '✓ ' : ''}{option.label}
                </button>
              ))}
            </div>
          </div>

          {/* 학생 특성 메모 */}
          <div>
            <p className="text-sm text-gray-600 mb-2">학생 특성 메모 <span className="text-red-500">*</span></p>
            <textarea 
              value={studentMemo} 
              onChange={(e) => setStudentMemo(e.target.value)} 
              placeholder="이 학생만의 특징, 지도 기간 중 변화 등을 자유롭게 적어주세요. (최소 10자)" 
              rows={4} 
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm resize-none" 
            />
            <p className="text-xs text-gray-400 mt-1 text-right">{studentMemo.length}자</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-5 mb-6">
          <h2 className="font-semibold text-gray-800 mb-3">💬 학부모 요청사항 <span className="text-gray-400 font-normal text-sm">(선택)</span></h2>
          <textarea 
            value={parentRequest} 
            onChange={(e) => setParentRequest(e.target.value)} 
            placeholder="학부모가 요청한 사항이 있으면 입력해주세요." 
            rows={2} 
            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm resize-none" 
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

      {/* 이미지 편집 모달 - 모바일 전체화면 */}
      {editingImage && currentEditImage.originalUrl && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-start md:items-center justify-center overflow-y-auto">
          <div className="bg-white w-full md:max-w-lg md:mx-4 md:my-4 md:rounded-2xl min-h-screen md:min-h-0 md:max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
              <h3 className="font-bold text-gray-800">이미지 편집</h3>
              <button onClick={closeEditModal} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            
            <div className="p-4 overflow-auto flex-1">
              {/* 회전 버튼 */}
              <div className="flex justify-center gap-2 mb-4">
                <button
                  onClick={() => handleRotate('left')}
                  className="px-3 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 transition"
                >
                  ↺ 왼쪽 회전
                </button>
                <button
                  onClick={() => handleRotate('right')}
                  className="px-3 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 transition"
                >
                  ↻ 오른쪽 회전
                </button>
              </div>

              {/* 이미지 및 자르기 영역 */}
              <div className="flex justify-center overflow-auto">
                <ReactCrop
                  crop={tempCrop}
                  onChange={(c) => setTempCrop(c)}
                  onComplete={(c) => setCompletedCrop(c)}
                >
                  <img
                    ref={imgRef}
                    src={currentEditImage.originalUrl}
                    alt="편집"
                    className="max-w-full"
                    style={{ 
                      maxHeight: '50vh',
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

            <div className="px-5 py-4 border-t border-gray-100 flex gap-3 flex-shrink-0">
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