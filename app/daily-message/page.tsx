'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { DailyMessageSkeleton } from '@/components/Skeleton'

interface Student {
  id: string
  name: string
  birth_year: number
  class_id: string | null
}

interface ClassOption {
  id: string
  name: string
  branch_id: string
}

interface Branch {
  id: string
  name: string
}

interface CurriculumTopic {
  id: string
  year: number
  month: number
  week: number | null
  target_group: string
  title: string
  main_materials: string | null
  parent_message_template: string | null
  age_group: string | null
}

const MATERIAL_OPTIONS = [
  '연필', '색연필', '매직', '사인펜',
  '수채화', '아크릴', '파스텔', '점토',
  '스티커', '기타'
]

export default function DailyMessagePage() {
  const router = useRouter()
  
  const [userId, setUserId] = useState<string>('')
  const [userBranchId, setUserBranchId] = useState<string>('')
  const [userRole, setUserRole] = useState<string>('')
  
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [selectedBranchId, setSelectedBranchId] = useState<string>('')
  const [students, setStudents] = useState<Student[]>([])
  const [curriculumTopics, setCurriculumTopics] = useState<CurriculumTopic[]>([])
  
  const [selectedClassId, setSelectedClassId] = useState<string>('')
  const [selectedStudentId, setSelectedStudentId] = useState<string>('')
  
  const [images, setImages] = useState<File[]>([])
  const [imageUrls, setImageUrls] = useState<string[]>([])
  
  const [lessonType, setLessonType] = useState<'curriculum' | 'free'>('curriculum')
  const [selectedTopicId, setSelectedTopicId] = useState<string>('')
  const [freeSubject, setFreeSubject] = useState('')
  const [selectedMaterials, setSelectedMaterials] = useState<string[]>([])
  const [progressStatus, setProgressStatus] = useState<'none' | 'started' | 'completed'>('none')
  const [teacherMemo, setTeacherMemo] = useState('')
  
  const [generating, setGenerating] = useState(false)
  const [loading, setLoading] = useState(true)
  
  const [allResultsCount, setAllResultsCount] = useState(0)
  const [generatedStudentIds, setGeneratedStudentIds] = useState<string[]>([])

  const [showCurriculumModal, setShowCurriculumModal] = useState(false)
  const [studentSearch, setStudentSearch] = useState('')

  // ✅ IndexedDB 이미지 저장 (앱 전환/화면 꺼짐 대응)
  const DB_NAME = 'daily-message-db'
  const DB_STORE = 'images'

  const openImageDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(DB_STORE)) {
          db.createObjectStore(DB_STORE, { keyPath: 'index' })
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }

  const saveImagesToDB = async (files: File[]) => {
    try {
      const db = await openImageDB()
      const tx = db.transaction(DB_STORE, 'readwrite')
      const store = tx.objectStore(DB_STORE)
      store.clear()
      for (let i = 0; i < files.length; i++) {
        const buffer = await files[i].arrayBuffer()
        store.put({ index: i, name: files[i].name, type: files[i].type, data: buffer })
      }
      db.close()
    } catch {}
  }

  const loadImagesFromDB = async (): Promise<{ files: File[]; urls: string[] }> => {
    try {
      const db = await openImageDB()
      const tx = db.transaction(DB_STORE, 'readonly')
      const store = tx.objectStore(DB_STORE)
      const allReq = store.getAll()
      return new Promise((resolve) => {
        allReq.onsuccess = () => {
          const records = allReq.result || []
          const files: File[] = []
          const urls: string[] = []
          records.sort((a: any, b: any) => a.index - b.index)
          for (const rec of records) {
            const file = new File([rec.data], rec.name, { type: rec.type })
            files.push(file)
            urls.push(URL.createObjectURL(file))
          }
          db.close()
          resolve({ files, urls })
        }
        allReq.onerror = () => {
          db.close()
          resolve({ files: [], urls: [] })
        }
      })
    } catch {
      return { files: [], urls: [] }
    }
  }

  const clearImageDB = async () => {
    try {
      const db = await openImageDB()
      const tx = db.transaction(DB_STORE, 'readwrite')
      tx.objectStore(DB_STORE).clear()
      db.close()
    } catch {}
  }

  // ✅ 폼 상태를 sessionStorage에 저장 (앱 전환/화면 꺼짐 대응)
  const STORAGE_KEY = 'daily-message-form'

  const saveFormState = () => {
    try {
      const state = {
        selectedClassId, selectedStudentId, lessonType,
        selectedTopicId, freeSubject, selectedMaterials,
        progressStatus, teacherMemo, selectedBranchId
      }
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {}
  }

  const restoreFormState = () => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY)
      if (!saved) return null
      return JSON.parse(saved)
    } catch { return null }
  }

  const clearFormState = () => {
    try { sessionStorage.removeItem(STORAGE_KEY) } catch {}
  }

  // 폼 값 변경 시마다 자동 저장
  useEffect(() => {
    if (!loading && selectedStudentId) {
      saveFormState()
    }
  }, [selectedClassId, selectedStudentId, lessonType, selectedTopicId, freeSubject, selectedMaterials, progressStatus, teacherMemo, selectedBranchId])

  // ✅ 이미지 변경 시 IndexedDB에 자동 저장
  useEffect(() => {
    if (!loading && images.length > 0) {
      saveImagesToDB(images)
    } else if (!loading && images.length === 0) {
      clearImageDB()
    }
  }, [images, loading])

  useEffect(() => {
    if (showCurriculumModal) {
      document.body.classList.add('modal-open')
    } else {
      document.body.classList.remove('modal-open')
    }
    return () => document.body.classList.remove('modal-open')
  }, [showCurriculumModal])

  useEffect(() => {
    loadInitialData()
    return () => {
      // ✅ 언마운트 시 blob URL 메모리 정리
      imageUrls.forEach(url => URL.revokeObjectURL(url))
    }
  }, [])

  useEffect(() => {
    if (selectedClassId) {
      loadStudentsByClass(selectedClassId)
      setSelectedStudentId('')
    }
  }, [selectedClassId])

  // ✅ 최적화: 순차 쿼리 → 병렬 쿼리
  async function loadInitialData() {
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      router.push('/login')
      return
    }

    setUserId(user.id)

    // 1단계: 프로필 먼저 (다른 쿼리의 조건으로 필요)
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role, branch_id')
      .eq('id', user.id)
      .single()

    if (profile?.branch_id) {
      setUserBranchId(profile.branch_id)
    }

    setUserRole(profile?.role || '')

    // 2단계: 나머지 전부 병렬 실행 ✅
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth() + 1
    let prevYear = currentYear
    let prevMonth = currentMonth - 1
    if (prevMonth === 0) {
      prevMonth = 12
      prevYear = currentYear - 1
    }

    // 지점 쿼리 구성
    let branchQuery = supabase.from('branches').select('id, name').order('name')
    if (profile?.role !== 'admin' && profile?.branch_id) {
      branchQuery = branchQuery.eq('id', profile.branch_id)
    }

    // 커리큘럼 쿼리 구성
    let topicsQuery = supabase.from('monthly_curriculum')
      .select('id, year, month, week, target_group, title, main_materials, parent_message_template, age_group')
      .eq('status', 'active')

    if (profile?.role !== 'admin') {
      topicsQuery = topicsQuery.or(
        `and(year.eq.${currentYear},month.eq.${currentMonth}),and(year.eq.${prevYear},month.eq.${prevMonth})`
      )
    }

    // ✅ 5개 쿼리를 동시에 실행 (기존: 순차 5회 → 최적화: 병렬 1회)
    const [
      teacherClassesResult,
      branchesResult,
      topicsResult,
      existingMsgResult
    ] = await Promise.all([
      supabase.from('teacher_classes').select('class_id').eq('teacher_id', user.id),
      branchQuery,
      topicsQuery.order('year', { ascending: false }).order('month', { ascending: false }).order('created_at'),
      // ✅ 카운트 + 학생 ID를 하나의 쿼리로 합침
      supabase.from('daily_messages')
        .select('student_id', { count: 'exact' })
        .gte('expires_at', now.toISOString())
    ])

    // 지점 반영
    if (branchesResult.data) setBranches(branchesResult.data)

    // 반 목록 조회 (teacherClasses 결과 활용)
    const classIds = teacherClassesResult.data?.map(tc => tc.class_id) || []
    let classQuery = supabase.from('classes').select('id, name, branch_id')
    
    if (profile?.role === 'teacher' && classIds.length > 0) {
      classQuery = classQuery.in('id', classIds)
    } else if (profile?.role !== 'admin' && profile?.branch_id) {
      classQuery = classQuery.eq('branch_id', profile.branch_id)
    }

    const { data: classesData } = await classQuery.order('name')

    if (classesData) {
      setClasses(classesData)
      if (profile?.role === 'admin' && branchesResult.data && branchesResult.data.length > 0) {
        setSelectedBranchId(branchesResult.data[0].id)
        const firstBranchClasses = classesData.filter((c: any) => c.branch_id === branchesResult.data![0].id)
        if (firstBranchClasses.length > 0) {
          setSelectedClassId(firstBranchClasses[0].id)
        }
      } else if (classesData.length > 0) {
        setSelectedClassId(classesData[0].id)
      }
    }

    // 커리큘럼 반영
    if (topicsResult.data) setCurriculumTopics(topicsResult.data)

    // ✅ 카운트 + 학생 ID 한 번에 처리 (기존: 2개 쿼리 → 1개 쿼리)
    setAllResultsCount(existingMsgResult.count || 0)
    if (existingMsgResult.data) {
      setGeneratedStudentIds(existingMsgResult.data.map(m => m.student_id))
    }

    // ✅ IndexedDB에서 이미지 복원
    try {
      const { files, urls } = await loadImagesFromDB()
      if (files.length > 0) {
        setImages(files)
        setImageUrls(urls)
      }
    } catch {}

    // ✅ sessionStorage에서 폼 상태 복원
    const saved = restoreFormState()
    if (saved) {
      if (saved.selectedBranchId && profile?.role === 'admin') {
        setSelectedBranchId(saved.selectedBranchId)
      }
      if (saved.lessonType) setLessonType(saved.lessonType)
      if (saved.selectedTopicId) setSelectedTopicId(saved.selectedTopicId)
      if (saved.freeSubject) setFreeSubject(saved.freeSubject)
      if (saved.selectedMaterials) setSelectedMaterials(saved.selectedMaterials)
      if (saved.progressStatus) setProgressStatus(saved.progressStatus)
      if (saved.teacherMemo) setTeacherMemo(saved.teacherMemo)
      if (saved.selectedStudentId) {
        setTimeout(() => setSelectedStudentId(saved.selectedStudentId), 500)
      }
    }

    setLoading(false)
  }

  async function loadStudentsByClass(classId: string) {
    const { data } = await supabase
      .from('students')
      .select('id, name, birth_year, class_id')
      .eq('class_id', classId)
      .eq('status', 'active')
      .order('name')

    if (data) {
      setStudents(data)
    }
  }

  const MAX_IMAGES = 4

  const [compressing, setCompressing] = useState(false)

  const compressSingleImage = async (file: File): Promise<{ file: File; url: string }> => {
    try {
      // createImageBitmap은 Image보다 빠름 (특히 모바일)
      const bitmap = await createImageBitmap(file)
      
      const canvas = document.createElement('canvas')
      const maxSize = 1200
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
      
      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.85)
      })
      
      const compressedFile = new File(
        [blob], 
        file.name.replace(/\.[^.]+$/, '.jpg'), 
        { type: 'image/jpeg' }
      )
      
      return { file: compressedFile, url: URL.createObjectURL(compressedFile) }
    } catch (e) {
      console.error('이미지 압축 실패:', e)
      return { file, url: URL.createObjectURL(file) }
    }
  }

  const handleImageUpload = async (files: FileList) => {
    if (images.length >= MAX_IMAGES) {
      alert(`사진은 최대 ${MAX_IMAGES}장까지 첨부할 수 있습니다.`)
      return
    }

    const remaining = MAX_IMAGES - images.length
    const fileArray = Array.from(files).slice(0, remaining)
    
    if (files.length > remaining) {
      alert(`${remaining}장만 추가할 수 있어서 처음 ${remaining}장만 첨부됩니다.`)
    }

    setCompressing(true)
    
    // 모든 이미지를 병렬로 압축
    const results = await Promise.all(fileArray.map(f => compressSingleImage(f)))
    
    setImages(prev => [...prev, ...results.map(r => r.file)])
    setImageUrls(prev => [...prev, ...results.map(r => r.url)])
    setCompressing(false)
  }

  const removeImage = (index: number) => {
    URL.revokeObjectURL(imageUrls[index])
    setImages(prev => prev.filter((_, i) => i !== index))
    setImageUrls(prev => prev.filter((_, i) => i !== index))
  }

  const toggleMaterial = (material: string) => {
    setSelectedMaterials(prev => 
      prev.includes(material)
        ? prev.filter(m => m !== material)
        : [...prev, material]
    )
  }

  // ✅ 최적화: 이미지 병렬 업로드 (기존: 순차 1장씩 → 최적화: 동시 전부)
  const uploadImages = async (messageId: string): Promise<string[]> => {
    const uploadPromises = images.map(async (file, i) => {
      const fileExt = file.name.split('.').pop()
      const fileName = `${messageId}/${i}.${fileExt}`
      
      const { error: uploadError } = await supabase.storage
        .from('daily-message-images')
        .upload(fileName, file)

      if (uploadError) {
        console.error('Upload error:', uploadError)
        return null
      }

      const { data: { publicUrl } } = supabase.storage
        .from('daily-message-images')
        .getPublicUrl(fileName)
      
      return publicUrl
    })
    
    const results = await Promise.all(uploadPromises)
    return results.filter((url): url is string => url !== null)
  }

  const generateMessage = async () => {
    if (!selectedStudentId) {
      alert('학생을 선택해주세요')
      return
    }

    // 이미지 최대 4장 이중 검증
    if (images.length > MAX_IMAGES) {
      alert(`사진은 최대 ${MAX_IMAGES}장까지만 첨부 가능합니다.`)
      return
    }
    
    setGenerating(true)
    
    const student = students.find(s => s.id === selectedStudentId)
    if (!student) {
      setGenerating(false)
      return
    }

    const selectedTopic = curriculumTopics.find(t => t.id === selectedTopicId)
    
    const firstName = student.name.length >= 3 ? student.name.slice(1) : student.name
    const hasFinalConsonant = (str: string) => {
      const lastChar = str.charAt(str.length - 1)
      const code = lastChar.charCodeAt(0)
      if (code >= 0xAC00 && code <= 0xD7A3) {
        return (code - 0xAC00) % 28 !== 0
      }
      return false
    }
    const hasJongseong = hasFinalConsonant(firstName)
    const nameNun = firstName + (hasJongseong ? '이는' : '는')
    const nameMan = firstName + (hasJongseong ? '이만의' : '만의')

    const currentYear = new Date().getFullYear()
    const studentAge = currentYear - student.birth_year + 1

    let message = ''
    let topicTitle = ''
    
    const isKindergarten = lessonType === 'curriculum' 
      ? selectedTopic?.age_group === 'kindergarten'
      : studentAge <= 7

    const endingStyle = isKindergarten 
      ? { doing: '해보았어요', did: '해주었답니다', nice: '예뻐요', great: '기특했어요' }
      : { doing: '표현해주었습니다', did: '해보았습니다', nice: '인상적이에요', great: '훌륭했습니다' }

    const emojis = ['🎨', '🖌️', '✨', '🌟', '💫', '🖼️', '👏', '😊']
    const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)]

    if (lessonType === 'curriculum' && selectedTopic) {
      topicTitle = selectedTopic.title
      const template = selectedTopic.parent_message_template || ''

      const templateSentences = template
        .replace(/합니다\./g, '해요.')
        .replace(/합니다/g, '해요')
        .replace(/줍니다\./g, '줘요.')
        .replace(/줍니다/g, '줘요')
        .replace(/됩니다\./g, '돼요.')
        .replace(/됩니다/g, '돼요')
        .split(/[.]\s*/)
        .filter(s => s.trim().length > 10)
        .slice(0, 3)
        .join('. ')

      const sentence1 = `오늘 ${nameNun} '${topicTitle}' 수업을 ${endingStyle.doing}.`
      
      const sentence2to4 = templateSentences
        .replace(/이번 작품은/g, '')
        .replace(/표현합니다/g, `표현${endingStyle.did}`)
        .replace(/그려줍니다/g, `그려${endingStyle.did}`)
        .replace(/그려요/g, `그려${endingStyle.did}`)
        .replace(/묘사하여/g, '묘사하며')
        .replace(/느낌을 줍니다/g, `느낌을 살려${endingStyle.did}`)
        .replace(/느낌을 줘요/g, `느낌을 살려${endingStyle.did}`)
        .trim()

      const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)]

      let progressOpening = ''
      let progressDetail = ''
      let progressClosing = ''

      if (progressStatus === 'started') {
        progressOpening = pick([
          '오늘 새로운 작품을 시작했어요.',
          '새 작품의 밑그림을 그리며 구상을 시작했어요.',
          '오늘부터 새 작품에 들어갔어요.',
        ])
        progressDetail = pick([
          '어떤 구도로 표현할지 고민하며 스케치하는 모습이 진지했어요.',
          '밑그림 단계에서부터 자신만의 아이디어를 담아내고 있어요.',
          '전체 구성을 계획하며 차근차근 작업을 시작했어요.',
        ])
        progressClosing = pick([
          '어떤 작품이 완성될지 기대해주세요!',
          '앞으로 완성되어갈 모습이 기대돼요!',
          '멋진 작품이 될 것 같아요!',
        ])
      } else if (progressStatus === 'none') {
        progressOpening = pick([
          '지난 시간에 이어 작품을 발전시켜 나갔어요.',
          '작품에 계속 집중하며 작업을 이어갔어요.',
          '작품을 이어서 작업하고 있어요.',
        ])
        progressDetail = pick([
          '세부 표현을 더하며 작품의 완성도를 높이고 있어요.',
          '색감을 입히며 작품이 한층 풍성해지고 있어요.',
          '디테일을 하나씩 채워가며 몰입하는 모습이 멋졌어요.',
        ])
        progressClosing = pick([
          '완성이 점점 가까워지고 있어요!',
          '작품이 점점 완성되어 가고 있어요!',
          '곧 멋진 작품이 완성될 거예요!',
        ])
      } else if (progressStatus === 'completed') {
        progressOpening = pick([
          '오늘 작품을 멋지게 완성했어요!',
          '끝까지 집중해서 작품을 완성했어요!',
          '드디어 작품이 완성되었어요!',
        ])
        progressDetail = pick([
          '완성된 작품에서 아이만의 개성이 잘 드러나요.',
          '마무리까지 꼼꼼하게 신경 쓴 모습이 대견해요.',
          '포기하지 않고 끝까지 완성한 모습이 보기 좋았어요.',
        ])
        progressClosing = pick([
          '완성작을 함께 감상해보세요!',
          '아이의 멋진 작품을 칭찬해주세요!',
          '뿌듯해하는 모습이 인상적이었어요!',
        ])
      }

      const memoText = teacherMemo ? ` ${teacherMemo}.` : ''
      message = `${sentence1} ${sentence2to4}. ${progressOpening} ${progressDetail}${memoText} ${progressClosing} ${randomEmoji}`

    } else {
      // ✅ 자율 메시지: GPT API 호출
      topicTitle = freeSubject
      const materials = selectedMaterials.join(', ') || '다양한 재료'

      try {
        const res = await fetch('/api/generate-daily-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            studentName: student.name,
            studentAge,
            subject: freeSubject,
            materials,
            progressStatus,
            teacherMemo
          })
        })

        const data = await res.json()
        if (data.message) {
          message = data.message
        } else {
          throw new Error(data.error || 'GPT 응답 없음')
        }
      } catch (e) {
        console.error('GPT 호출 실패, fallback 사용:', e)
        
        // fallback: 기존 템플릿 방식
        const materialTechniques: { [key: string]: string } = {
          '연필': '선의 강약을 조절하며 형태를 잡아',
          '색연필': '색을 겹쳐 칠하며 다양한 색감을 만들어',
          '매직': '선명한 색감으로 또렷하게 표현하며',
          '사인펜': '깔끔한 선으로 윤곽을 잡고',
          '수채화': '물의 양을 조절하며 부드러운 색감을 만들어',
          '아크릴': '선명하고 강렬한 색감으로',
          '파스텔': '부드러운 색감과 그라데이션을 활용하여',
          '점토': '손으로 형태를 만들며 입체감을 살려',
          '스티커': '다양한 스티커로 작품을 꾸며',
          '기타': '다양한 재료를 활용하여'
        }

        const mainMaterial = selectedMaterials[0] || '기타'
        const technique = materialTechniques[mainMaterial] || materialTechniques['기타']
        const memoText = teacherMemo ? teacherMemo : `상상력을 발휘하며 집중하는 모습이 ${endingStyle.great}`

        let progressText = ''
        if (progressStatus === 'started') {
          progressText = '오늘 처음 시작한 작품이에요.'
        } else if (progressStatus === 'none') {
          progressText = '작품을 열심히 진행하고 있어요.'
        } else if (progressStatus === 'completed') {
          progressText = '오늘 작품을 멋지게 완성했어요!'
        }

        message = `오늘 ${nameNun} '${freeSubject}'를 주제로 자유화를 ${endingStyle.doing}. ${materials}를 사용하여 ${technique} ${endingStyle.did}. 자신만의 시선으로 ${freeSubject}의 특징을 관찰하고 표현${endingStyle.did}. ${memoText}. ${progressText} ${nameMan} 멋진 작품이에요! ${randomEmoji}`
      }
    }

    try {
      // ✅ 최적화: 기존 메시지 삭제 + 학생 branch 조회를 병렬로
      const [, studentDataResult] = await Promise.all([
        supabase.from('daily_messages').delete()
          .eq('student_id', student.id)
          .eq('teacher_id', userId),
        supabase.from('students').select('branch_id')
          .eq('id', student.id)
          .single()
      ])

      const { data: newMessage, error: insertError } = await supabase
        .from('daily_messages')
        .insert({
          student_id: student.id,
          teacher_id: userId,
          branch_id: studentDataResult.data?.branch_id || userBranchId,
          message: message,
          lesson_type: lessonType,
          topic_title: topicTitle,
          progress_status: progressStatus
        })
        .select()
        .single()

      if (insertError) {
        console.error('Insert error:', insertError)
        alert('메시지 저장에 실패했습니다')
        setGenerating(false)
        return
      }

      // ✅ 최적화: 이미지 병렬 업로드 + 일괄 DB insert
      if (images.length > 0 && newMessage) {
        const uploadedUrls = await uploadImages(newMessage.id)
        
        // ✅ 일괄 insert (기존: for 루프로 1개씩 insert → 최적화: 한 번에 전부)
        if (uploadedUrls.length > 0) {
          const imageRecords = uploadedUrls.map((url, i) => ({
            daily_message_id: newMessage.id,
            image_url: url,
            image_order: i
          }))
          
          await supabase.from('daily_message_images').insert(imageRecords)
        }
      }

      // ✅ 상태 초기화 + 메모리 해제
      clearFormState()
      clearImageDB()
      imageUrls.forEach(url => URL.revokeObjectURL(url))
      setImages([])
      setImageUrls([])

      router.push(`/daily-message/result/${student.id}`)
    } catch (error) {
      console.error('Error:', error)
      alert('메시지 저장에 실패했습니다.')
    }
    
    setGenerating(false)
  }

  const handleBranchChange = (branchId: string) => {
    setSelectedBranchId(branchId)
    setSelectedStudentId('')
    const branchClasses = classes.filter(c => c.branch_id === branchId)
    if (branchClasses.length > 0) {
      setSelectedClassId(branchClasses[0].id)
    } else {
      setSelectedClassId('')
    }
  }

  const filteredClasses = selectedBranchId
    ? classes.filter(c => c.branch_id === selectedBranchId)
    : classes

    const groupedTopics = curriculumTopics.reduce((acc, topic) => {
      const key = `${topic.year}-${topic.month}`
      if (!acc[key]) {
        acc[key] = { year: topic.year, month: topic.month, topics: [] }
      }
      acc[key].topics.push(topic)
      return acc
    }, {} as {[key: string]: { year: number, month: number, topics: CurriculumTopic[] }})
  
    // 각 그룹 내에서 주차순 정렬
    Object.values(groupedTopics).forEach(group => {
      group.topics.sort((a, b) => (a.week || 99) - (b.week || 99))
    })

  const selectedStudent = students.find(s => s.id === selectedStudentId)
  const selectedTopicData = curriculumTopics.find(t => t.id === selectedTopicId)

  if (loading) {
    return <DailyMessageSkeleton />
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 pb-8">
      <header className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-40 border-b border-gray-200/50">
        <div className="max-w-5xl mx-auto px-4 py-3">
          <div className="relative flex items-center justify-end min-h-[40px]">
            <h1 className="absolute left-1/2 -translate-x-1/2 text-lg font-bold text-gray-800">💬 일일 메시지</h1>
            <button
              onClick={() => router.push('/daily-message/results')}
              className="relative"
            >
              {allResultsCount > 0 && (
                <span className="bg-teal-500 text-white text-xs px-2 py-1 rounded-full">
                  {allResultsCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        {allResultsCount > 0 && (
          <button
            onClick={() => router.push('/daily-message/results')}
            className="w-full bg-white rounded-2xl shadow-sm border border-teal-200 p-4 flex items-center justify-between hover:bg-teal-50 transition"
          >
            <span className="font-medium text-teal-700">📋 전체 결과 보기</span>
            <span className="bg-teal-500 text-white text-sm px-3 py-1 rounded-full">
              {allResultsCount}명
            </span>
          </button>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <h2 className="font-semibold text-gray-800 mb-3">📚 반 선택</h2>
          <div className="flex flex-col gap-3">
            {userRole === 'admin' && (
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🏢</span>
                <select
                  value={selectedBranchId}
                  onChange={(e) => handleBranchChange(e.target.value)}
                  className="w-full pl-10 pr-10 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm text-gray-700 appearance-none cursor-pointer hover:bg-gray-100 transition"
                >
                  {branches.map(branch => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </select>
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">▼</span>
              </div>
            )}
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm">📚</span>
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="w-full pl-10 pr-10 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm text-gray-700 appearance-none cursor-pointer hover:bg-gray-100 transition"
              >
                {filteredClasses.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">▼</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <h2 className="font-semibold text-gray-800 mb-3">👤 학생 선택</h2>
          <div className="relative">
            <input
              type="text"
              value={studentSearch}
              onChange={(e) => {
                setStudentSearch(e.target.value)
                if (selectedStudentId) {
                  setSelectedStudentId('')
                }
              }}
              onFocus={() => setStudentSearch('')}
              placeholder={selectedStudent ? `${selectedStudent.name} (${new Date().getFullYear() - selectedStudent.birth_year + 1}세)` : '🔍 이름을 검색하세요'}
              className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent ${
                selectedStudentId ? 'bg-teal-50 border-teal-300 font-medium text-teal-800' : 'bg-gray-50 border-gray-200'
              }`}
            />
            {selectedStudentId && (
              <button
                onClick={() => {
                  setSelectedStudentId('')
                  setStudentSearch('')
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-gray-200 text-gray-500 flex items-center justify-center text-xs hover:bg-gray-300"
              >
                ✕
              </button>
            )}
          </div>
          
          {!selectedStudentId && (
            <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-gray-200 bg-white">
              {students
                .filter(s => !studentSearch || s.name.includes(studentSearch))
                .map(student => {
                  const age = new Date().getFullYear() - student.birth_year + 1
                  const isGenerated = generatedStudentIds.includes(student.id)
                  return (
                    <button
                      key={student.id}
                      onClick={() => {
                        setSelectedStudentId(student.id)
                        setStudentSearch(student.name)
                      }}
                      className="w-full px-4 py-3 text-left hover:bg-teal-50 transition border-b border-gray-100 last:border-b-0"
                    >
                      <span className="font-medium text-gray-800">{student.name} <span className="text-gray-400 font-normal text-sm">({age}세)</span></span>
                    </button>
                  )
                })}
              {students.filter(s => !studentSearch || s.name.includes(studentSearch)).length === 0 && (
                <p className="text-gray-400 text-center py-4 text-sm">
                  {students.length === 0 ? '해당 반에 학생이 없습니다' : '검색 결과가 없습니다'}
                </p>
              )}
            </div>
          )}
        </div>

        {selectedStudent && (
          <>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <h2 className="font-semibold text-gray-800 mb-3">
              📷 {selectedStudent.name} 작품 사진
              <span className="text-gray-400 font-normal text-sm ml-1">
                ({images.length}/{MAX_IMAGES}장)
              </span>
            </h2>
              <div className="grid grid-cols-4 gap-2">
                {imageUrls.map((url, index) => (
                  <div key={index} className="relative aspect-square">
                    <img src={url} alt="" className="w-full h-full object-cover rounded-xl" />
                    <button
                      onClick={() => removeImage(index)}
                      className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                
                {images.length < MAX_IMAGES && (
                  compressing ? (
                    <div className="aspect-square border-2 border-dashed border-teal-300 rounded-xl flex flex-col items-center justify-center bg-teal-50">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-teal-500 mb-1"></div>
                      <span className="text-[10px] text-teal-500">압축중...</span>
                    </div>
                  ) : (
                    <label className="aspect-square border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50">
                      <span className="text-2xl text-gray-300">+</span>
                      <span className="text-[10px] text-gray-300 mt-0.5">{MAX_IMAGES - images.length}장 가능</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/heic"
                        multiple
                        onChange={(e) => {
                          e.target.files && handleImageUpload(e.target.files)
                          e.target.value = ''
                        }}
                        className="hidden"
                      />
                    </label>
                  )
                )}
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <h2 className="font-semibold text-gray-800 mb-3">📚 수업 유형</h2>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setLessonType('curriculum')}
                  className={`py-3 rounded-xl font-medium transition ${
                    lessonType === 'curriculum'
                      ? 'bg-teal-500 text-white'
                      : 'bg-gray-50 text-gray-600 border border-gray-200'
                  }`}
                >
                  커리큘럼
                </button>
                <button
                  onClick={() => setLessonType('free')}
                  className={`py-3 rounded-xl font-medium transition ${
                    lessonType === 'free'
                      ? 'bg-teal-500 text-white'
                      : 'bg-gray-50 text-gray-600 border border-gray-200'
                  }`}
                >
                  자율
                </button>
              </div>
            </div>

            {lessonType === 'curriculum' && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                <h2 className="font-semibold text-gray-800 mb-3">📖 주제 선택</h2>
                <button
                  onClick={() => setShowCurriculumModal(true)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-left flex items-center justify-between hover:bg-gray-100 transition"
                >
                  <span className={selectedTopicData ? 'text-gray-800' : 'text-gray-400'}>
                    {selectedTopicData 
                        ? `${selectedTopicData.week ? selectedTopicData.week + '주 ' : ''}${selectedTopicData.title} ${selectedTopicData.age_group === 'kindergarten' ? '유치' : '초등'}`
                        : '선택해주세요'
                    }
                  </span>
                  <span className="text-gray-400">▼</span>
                </button>
              </div>
            )}

            {lessonType === 'free' && (
              <>
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                  <h2 className="font-semibold text-gray-800 mb-3">📝 주제</h2>
                  <input
                    type="text"
                    value={freeSubject}
                    onChange={(e) => setFreeSubject(e.target.value)}
                    placeholder="예: 우리 강아지"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                  <h2 className="font-semibold text-gray-800 mb-3">🎨 재료 (복수 선택)</h2>
                  <div className="grid grid-cols-5 gap-2">
                    {MATERIAL_OPTIONS.map(material => (
                      <button
                        key={material}
                        onClick={() => toggleMaterial(material)}
                        className={`py-2 px-2 rounded-xl text-xs font-medium transition ${
                          selectedMaterials.includes(material)
                            ? 'bg-teal-500 text-white'
                            : 'bg-gray-50 text-gray-600 border border-gray-200'
                        }`}
                      >
                        {material}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <h2 className="font-semibold text-gray-800 mb-3">📊 진행 상태</h2>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: 'started', label: '시작' },
                  { key: 'none', label: '진행중' },
                  { key: 'completed', label: '완성' }
                ].map(status => (
                  <button
                    key={status.key}
                    onClick={() => setProgressStatus(status.key as 'none' | 'started' | 'completed')}
                    className={`py-2.5 rounded-xl text-sm font-medium transition ${
                      progressStatus === status.key
                        ? 'bg-teal-500 text-white'
                        : 'bg-gray-50 text-gray-600 border border-gray-200'
                    }`}
                  >
                    {status.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <h2 className="font-semibold text-gray-800 mb-3">
                📝 메모
                <span className="text-gray-400 font-normal text-sm ml-1">(선택)</span>
              </h2>
              <textarea
                value={teacherMemo}
                onChange={(e) => setTeacherMemo(e.target.value)}
                placeholder="예: 색 조합이 예뻤어요, 집중력이 좋았어요"
                rows={3}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-y"
              />
            </div>

            <button
              onClick={generateMessage}
              disabled={generating || (lessonType === 'curriculum' && !selectedTopicId) || (lessonType === 'free' && !freeSubject)}
              className="w-full bg-gradient-to-r from-teal-500 to-cyan-500 text-white py-4 rounded-2xl font-medium disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {generating ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  {lessonType === 'free' ? 'AI 생성 중...' : '생성 중...'}
                </>
              ) : (
                `✨ ${selectedStudent.name} 문구 생성`
              )}
            </button>
          </>
        )}
      </div>

      {showCurriculumModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center">
          <div className="bg-white w-full max-w-lg max-h-[80vh] rounded-t-3xl md:rounded-2xl overflow-hidden">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-4 flex items-center justify-between z-10">
              <h3 className="font-bold text-gray-800 text-lg">주제 선택</h3>
              <button 
                onClick={() => setShowCurriculumModal(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500"
              >
                ✕
              </button>
            </div>
            
            <div className="overflow-y-auto max-h-[calc(80vh-60px)]">
              {Object.values(groupedTopics).map(group => (
                <div key={`${group.year}-${group.month}`}>
                  <div className="sticky top-0 bg-gray-50 px-4 py-2 border-b border-gray-100">
                    <span className="font-semibold text-gray-700">{group.year}년 {group.month}월</span>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {group.topics.map(topic => (
                      <button
                        key={topic.id}
                        onClick={() => {
                          setSelectedTopicId(topic.id)
                          setShowCurriculumModal(false)
                        }}
                        className={`w-full px-4 py-4 text-left hover:bg-teal-50 transition flex items-center justify-between ${
                          selectedTopicId === topic.id ? 'bg-teal-50' : ''
                        }`}
                      >
                        <div className="flex-1 flex items-center gap-3">
                          {topic.week && <span className="text-sm font-bold text-teal-600 whitespace-nowrap">{topic.week}주</span>}
                          <p className="font-medium text-gray-800">{topic.title}</p>
                          <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                            topic.age_group === 'kindergarten' 
                              ? 'bg-pink-100 text-pink-600' 
                              : 'bg-blue-100 text-blue-600'
                          }`}>
                            {topic.age_group === 'kindergarten' ? '유치' : '초등'}
                          </span>
                        </div>
                        {selectedTopicId === topic.id && (
                          <span className="text-teal-500 text-xl">✓</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              
              {curriculumTopics.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <p>등록된 커리큘럼이 없습니다</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
