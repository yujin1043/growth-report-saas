'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
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
  stage_messages: { label: string; message: string }[] | null
  lesson_category: string | null
}

// 진행 중 작품 (DB 실제 컬럼 기준)
interface InProgressWork {
  id: string
  sketchbook_id: string
  curriculum_id: string | null
  custom_title: string | null
  is_custom: boolean
  session_count: number
  status: string
  work_date: string
  // UI용 파생 필드
  title: string
  type: 'curriculum' | 'free'
  sessions: number
}

const MATERIAL_OPTIONS = ['연필', '색연필', '매직', '사인펜', '수채화', '아크릴', '파스텔', '점토', '스티커', '기타']

const FREE_LESSON_STAGES = [
  { label: '스케치', key: 'sketch' },
  { label: '채색', key: 'coloring' },
  { label: '디테일', key: 'detail' },
  { label: '완성', key: 'completed' },
]

export default function DailyMessagePage() {
  const router = useRouter()
  const pendingStudentIdRef = useRef<string>('')  

  const [userId, setUserId] = useState('')
  const [userBranchId, setUserBranchId] = useState('')
  const [userRole, setUserRole] = useState('')

  const [branches, setBranches] = useState<Branch[]>([])
  const [selectedBranchId, setSelectedBranchId] = useState('')
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [selectedClassId, setSelectedClassId] = useState('')
  const [students, setStudents] = useState<Student[]>([])
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [studentSearch, setStudentSearch] = useState('')

  const [curriculumTopics, setCurriculumTopics] = useState<CurriculumTopic[]>([])
  const [allResultsCount, setAllResultsCount] = useState(0)
  const [generatedStudentIds, setGeneratedStudentIds] = useState<string[]>([])

  // v4 UI 상태
  const [inProgressList, setInProgressList] = useState<InProgressWork[]>([])
  const [selectedWork, setSelectedWork] = useState<any>(null)
  const [isNewWork, setIsNewWork] = useState(false)
  const [curriculumSearch, setCurriculumSearch] = useState('')

  const [lessonType, setLessonType] = useState<'curriculum' | 'free'>('curriculum')
  const [selectedTopicId, setSelectedTopicId] = useState('')
  const [freeSubject, setFreeSubject] = useState('')
  const [selectedMaterials, setSelectedMaterials] = useState<string[]>([])
  const [progressStatus, setProgressStatus] = useState<'none' | 'started' | 'completed'>('none')
  const [selectedStage, setSelectedStage] = useState<string>('')
  const [teacherMemo, setTeacherMemo] = useState('')

  const [images, setImages] = useState<File[]>([])
  const [imageUrls, setImageUrls] = useState<string[]>([])
  const [compressing, setCompressing] = useState(false)
  const MAX_IMAGES = 4

  const [generating, setGenerating] = useState(false)
  const [loading, setLoading] = useState(true)
  const [initialized, setInitialized] = useState(false)

  // ── 파생값 ──────────────────────────────────────────
  const student = students.find(s => s.id === selectedStudentId)
  const hasInProgress = inProgressList.length > 0
  const currentYear = new Date().getFullYear()
  const getAge = (birthYear: number) => currentYear - birthYear + 1

  const groupedCurriculum = useMemo(() => {
    const map: Record<string, { year: number; month: number; label: string; topics: CurriculumTopic[] }> = {}
    curriculumTopics.forEach(t => {
      const key = `${t.year}-${t.month}`
      if (!map[key]) {
        const now = new Date()
        const isCurrent = t.year === now.getFullYear() && t.month === now.getMonth() + 1
        map[key] = { year: t.year, month: t.month, label: `${t.month}월${isCurrent ? ' (당월)' : ''}`, topics: [] }
      }
      map[key].topics.push(t)
    })
    return Object.values(map).sort((a, b) => b.year !== a.year ? b.year - a.year : b.month - a.month)
  }, [curriculumTopics])

  // ── 초기화 ──────────────────────────────────────────
  const resetSelection = () => {
    setSelectedWork(null)
    setIsNewWork(false)
    setLessonType('curriculum')
    setSelectedTopicId('')
    setCurriculumSearch('')
    setFreeSubject('')
    setSelectedMaterials([])
    setProgressStatus('none')
    setSelectedStage('')
    setTeacherMemo('')
  }

  const clearStudent = () => {
    setSelectedStudentId('')
    setStudentSearch('')
    setInProgressList([])
    resetSelection()
  }

  const toggleMaterial = (m: string) => {
    setSelectedMaterials(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])
  }

  // ── lifecycle ────────────────────────────────────────
  useEffect(() => { loadInitialData() }, [])

  useEffect(() => {
    if (selectedClassId) {
      sessionStorage.setItem('dm_classId', selectedClassId)
      loadStudentsByClass(selectedClassId).then(() => {
        if (pendingStudentIdRef.current) {
          const sid = pendingStudentIdRef.current
          pendingStudentIdRef.current = ''
          setSelectedStudentId(sid)
          setStudentSearch(sessionStorage.getItem('dm_studentSearch') || '')
          try {
            const w = sessionStorage.getItem('dm_selectedWork')
            if (w) setSelectedWork(JSON.parse(w))
            setIsNewWork(sessionStorage.getItem('dm_isNewWork') === 'true')
            setLessonType((sessionStorage.getItem('dm_lessonType') as any) || 'curriculum')
            setSelectedTopicId(sessionStorage.getItem('dm_topicId') || '')
            setFreeSubject(sessionStorage.getItem('dm_freeSubject') || '')
            setSelectedMaterials(JSON.parse(sessionStorage.getItem('dm_materials') || '[]'))
            setProgressStatus((sessionStorage.getItem('dm_progress') as any) || 'none')
            setTeacherMemo(sessionStorage.getItem('dm_memo') || '')
          } catch {}
          setInitialized(true)
        } else {
          const savedId = sessionStorage.getItem('dm_studentId')
          if (!savedId) clearStudent()
          setInitialized(true)
        }
      })
    }
  }, [selectedClassId])

  useEffect(() => {
    if (selectedStudentId) loadInProgressList(selectedStudentId)
    else setInProgressList([])
  }, [selectedStudentId])


  // sessionStorage 저장 (로딩 완료 후에만 저장 - 초기값으로 덮어쓰기 방지)
  useEffect(() => { if (initialized) sessionStorage.setItem('dm_studentId', selectedStudentId) }, [selectedStudentId, initialized])
  useEffect(() => { if (initialized) sessionStorage.setItem('dm_studentSearch', studentSearch) }, [studentSearch, initialized])
  useEffect(() => { if (initialized) sessionStorage.setItem('dm_branchId', selectedBranchId) }, [selectedBranchId, initialized])
  useEffect(() => {
    if (!initialized) return
    if (selectedWork) sessionStorage.setItem('dm_selectedWork', JSON.stringify(selectedWork))
    else sessionStorage.removeItem('dm_selectedWork')
  }, [selectedWork, initialized])
  useEffect(() => { if (initialized) sessionStorage.setItem('dm_isNewWork', String(isNewWork)) }, [isNewWork, initialized])
  useEffect(() => { if (initialized) { sessionStorage.setItem('dm_lessonType', lessonType); setCurriculumSearch('') } }, [lessonType, initialized])
  useEffect(() => { if (initialized) sessionStorage.setItem('dm_topicId', selectedTopicId) }, [selectedTopicId, initialized])
  useEffect(() => { if (initialized) sessionStorage.setItem('dm_freeSubject', freeSubject) }, [freeSubject, initialized])
  useEffect(() => { if (initialized) sessionStorage.setItem('dm_materials', JSON.stringify(selectedMaterials)) }, [selectedMaterials, initialized])
  useEffect(() => { if (initialized) sessionStorage.setItem('dm_progress', progressStatus) }, [progressStatus, initialized])
  useEffect(() => { if (initialized) sessionStorage.setItem('dm_memo', teacherMemo) }, [teacherMemo, initialized])


  // ── 데이터 로드 ──────────────────────────────────────
  async function loadInitialData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    setUserId(user.id)

    const { data: profile } = await supabase
      .from('user_profiles').select('role, branch_id').eq('id', user.id).single()

    if (profile?.branch_id) setUserBranchId(profile.branch_id)
    setUserRole(profile?.role || '')

    const now = new Date()
    const cy = now.getFullYear(), cm = now.getMonth() + 1
    const py = cm === 1 ? cy - 1 : cy, pm = cm === 1 ? 12 : cm - 1
    const p2y = cm <= 2 ? cy - 1 : cy, p2m = cm <= 2 ? cm + 10 : cm - 2

    let branchQ = supabase.from('branches').select('id, name').order('name')
    if (profile?.role !== 'admin' && profile?.branch_id) branchQ = branchQ.eq('id', profile.branch_id)

    let topicQ = supabase.from('monthly_curriculum')
      .select('id, year, month, week, target_group, title, main_materials, parent_message_template, age_group, stage_messages, lesson_category')
      .eq('status', 'active')
    topicQ = topicQ.or(`and(year.eq.${cy},month.eq.${cm}),and(year.eq.${py},month.eq.${pm}),and(year.eq.${p2y},month.eq.${p2m})`)

    const [teacherClassRes, branchRes, topicRes, msgRes] = await Promise.all([
      supabase.from('teacher_classes').select('class_id').eq('teacher_id', user.id),
      branchQ,
      topicQ.order('year', { ascending: false }).order('month', { ascending: false }).order('week', { ascending: true }).order('created_at'),
      supabase.from('daily_messages').select('student_id', { count: 'exact' }).gte('expires_at', now.toISOString()),
    ])

    if (branchRes.data) setBranches(branchRes.data)
    if (topicRes.data) setCurriculumTopics(topicRes.data)
    setAllResultsCount(msgRes.count || 0)
    if (msgRes.data) setGeneratedStudentIds(msgRes.data.map((m: any) => m.student_id))

    const classIds = teacherClassRes.data?.map((tc: any) => tc.class_id) || []
    let classQ = supabase.from('classes').select('id, name, branch_id')
    if (profile?.role === 'teacher' && classIds.length > 0) classQ = classQ.in('id', classIds)
    else if (profile?.role !== 'admin' && profile?.branch_id) classQ = classQ.eq('branch_id', profile.branch_id)
    const { data: classesData } = await classQ.order('name')

    if (classesData) {
      setClasses(classesData)
      const savedClassId = sessionStorage.getItem('dm_classId')
      const savedStudentId = sessionStorage.getItem('dm_studentId')
      if (savedStudentId) pendingStudentIdRef.current = savedStudentId
    
      if (profile?.role === 'admin' && branchRes.data?.length) {
        const savedBranchId = sessionStorage.getItem('dm_branchId')
        const targetBranch = (savedBranchId && branchRes.data.find((b: any) => b.id === savedBranchId))
          ? savedBranchId : branchRes.data[0].id
        setSelectedBranchId(targetBranch)
        const branchClasses = classesData.filter((c: any) => c.branch_id === targetBranch)
        const targetClass = (savedClassId && branchClasses.find((c: any) => c.id === savedClassId))
          ? savedClassId : (branchClasses.length ? branchClasses[0].id : '')
        if (targetClass) setSelectedClassId(targetClass)
      } else if (classesData.length) {
        const targetClass = (savedClassId && classesData.find((c: any) => c.id === savedClassId))
          ? savedClassId : classesData[0].id
        setSelectedClassId(targetClass)
      }
    }

    setLoading(false)
  }

  async function loadStudentsByClass(classId: string) {
    const { data } = await supabase
      .from('students').select('id, name, birth_year, class_id')
      .eq('class_id', classId).eq('status', 'active').order('name')
    if (data) setStudents(data)
  }

  async function loadInProgressList(studentId: string) {
    const { data: sketchbooks } = await supabase
      .from('sketchbooks').select('id')
      .eq('student_id', studentId).eq('status', 'active')
      .order('created_at', { ascending: false }).limit(1)

    if (!sketchbooks?.length) { setInProgressList([]); return }

    const { data: works } = await supabase
      .from('sketchbook_works')
      .select('id, sketchbook_id, curriculum_id, custom_title, is_custom, session_count, status, work_date')
      .eq('sketchbook_id', sketchbooks[0].id)
      .eq('status', 'in_progress')
      .order('created_at', { ascending: false })

    if (!works?.length) { setInProgressList([]); return }

    // curriculum_id → title 조회
    const curriculumIds = works.filter(w => !w.is_custom && w.curriculum_id).map(w => w.curriculum_id)
    let curriculumTitleMap: Record<string, string> = {}
    if (curriculumIds.length) {
      const { data: currs } = await supabase
        .from('monthly_curriculum').select('id, title').in('id', curriculumIds)
      if (currs) currs.forEach((c: any) => { curriculumTitleMap[c.id] = c.title })
    }

    setInProgressList(works.map(w => ({
      ...w,
      title: w.is_custom ? (w.custom_title || '') : (curriculumTitleMap[w.curriculum_id] || ''),
      type: w.is_custom ? 'free' : 'curriculum',
      sessions: w.session_count,
    })))
  }

  // ── 스케치북 동기화 ───────────────────────────────────
  async function ensureSketchbook(studentId: string): Promise<string> {
    const { data: existing } = await supabase
      .from('sketchbooks').select('id').eq('student_id', studentId).eq('status', 'active')
      .order('created_at', { ascending: false }).limit(1)
    if (existing?.length) return existing[0].id

    const { data: allBooks } = await supabase
      .from('sketchbooks').select('book_number').eq('student_id', studentId)
      .order('book_number', { ascending: false }).limit(1)

    const nextNum = allBooks?.length ? allBooks[0].book_number + 1 : 1
    const { data: created, error } = await supabase
      .from('sketchbooks')
      .insert({ student_id: studentId, book_number: nextNum, started_at: new Date().toISOString().split('T')[0], status: 'active' })
      .select('id').single()
    if (error || !created) throw new Error('스케치북 생성 실패: ' + error?.message)
    return created.id
  }

  async function syncSketchbookWork(studentId: string, topicTitle: string, topicId?: string) {
    if (progressStatus === 'started') {
      const sketchbookId = await ensureSketchbook(studentId)
      const insertData: any = {
        sketchbook_id: sketchbookId,
        work_date: new Date().toISOString().split('T')[0],
        status: 'in_progress',
        session_count: 1,
      }
      if (topicId) { insertData.curriculum_id = topicId; insertData.is_custom = false }
      else { insertData.is_custom = true; insertData.custom_title = topicTitle }
      const { error } = await supabase.from('sketchbook_works').insert(insertData)
      if (error) throw new Error('sketchbook_works insert 실패: ' + error.message)
      return
    }

    if (!selectedWork || selectedWork.sessions === 0) return

    const workId = selectedWork.id
    if (progressStatus === 'none') {
      const { error } = await supabase.from('sketchbook_works')
        .update({ session_count: selectedWork.sessions + 1 }).eq('id', workId)
      if (error) throw new Error('session_count 업데이트 실패: ' + error.message)
    } else if (progressStatus === 'completed') {
      const { error } = await supabase.from('sketchbook_works')
        .update({ status: 'completed' }).eq('id', workId)
      if (error) throw new Error('completed 업데이트 실패: ' + error.message)
    }
  }

  // ── 빠른 완성 처리 ─────────────────────────────────────
  const handleQuickComplete = async (work: InProgressWork) => {
    if (!confirm(`'${work.title}' 작품을 완성하시겠습니까?`)) return
    try {
      const { error } = await supabase.from('sketchbook_works')
        .update({ status: 'completed' }).eq('id', work.id)
      if (error) throw error
      setInProgressList(prev => prev.filter(w => w.id !== work.id))
      if (selectedWork?.id === work.id) setSelectedWork(null)
      alert(`🎉 '${work.title}' 작품이 완성 처리되었습니다!`)
    } catch (e: any) {
      alert('완성 처리 실패: ' + (e?.message || ''))
    }
  }

  // ── 이미지 ────────────────────────────────────────────
  const compressSingleImage = async (file: File): Promise<{ file: File; url: string }> => {
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('파일 크기 초과')

      const MAX_SIZE = 1200
      const QUALITY = 0.85

      let canvas: HTMLCanvasElement
      try {
        const bitmap = await createImageBitmap(file, { resizeWidth: MAX_SIZE, resizeQuality: 'high' })
        canvas = document.createElement('canvas')
        canvas.width = bitmap.width; canvas.height = bitmap.height
        canvas.getContext('2d')!.drawImage(bitmap, 0, 0)
        bitmap.close()
      } catch {
        // resizeWidth 미지원 구형 기기: ObjectURL + Image 방식
        const url = URL.createObjectURL(file)
        try {
          const img = new Image()
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve()
            img.onerror = () => reject()
            img.src = url
          })
          canvas = document.createElement('canvas')
          let { width, height } = img
          if (width > MAX_SIZE || height > MAX_SIZE) {
            if (width > height) { height = Math.round(height / width * MAX_SIZE); width = MAX_SIZE }
            else { width = Math.round(width / height * MAX_SIZE); height = MAX_SIZE }
          }
          canvas.width = width; canvas.height = height
          canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
        } finally {
          URL.revokeObjectURL(url)
        }
      }

      const blob = await new Promise<Blob | null>(res => canvas.toBlob(b => res(b), 'image/jpeg', QUALITY))
      if (!blob) throw new Error('blob 생성 실패')

      const f = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' })
      return { file: f, url: URL.createObjectURL(f) }
    } catch { return { file, url: URL.createObjectURL(file) } }
  }

  const handleImageUpload = async (files: FileList) => {
    if (images.length >= MAX_IMAGES) { alert(`사진은 최대 ${MAX_IMAGES}장까지 첨부할 수 있습니다.`); return }
    const remaining = MAX_IMAGES - images.length
    const arr = Array.from(files).slice(0, remaining)
    if (files.length > remaining) alert(`처음 ${remaining}장만 첨부됩니다.`)
    setCompressing(true)
    for (const file of arr) {
      const result = await compressSingleImage(file)
      setImages(prev => [...prev, result.file])
      setImageUrls(prev => [...prev, result.url])
    }
    setCompressing(false)
  }

  const removeImage = (i: number) => {
    URL.revokeObjectURL(imageUrls[i])
    setImages(prev => prev.filter((_, j) => j !== i))
    setImageUrls(prev => prev.filter((_, j) => j !== i))
  }

  const uploadImages = async (messageId: string): Promise<string[]> => {
    const results = await Promise.all(images.map(async (file, i) => {
      const ext = file.name.split('.').pop()
      const { error } = await supabase.storage.from('daily-message-images').upload(`${messageId}/${i}.${ext}`, file)
      if (error) { console.error('Upload error:', error); return null }
      return supabase.storage.from('daily-message-images').getPublicUrl(`${messageId}/${i}.${ext}`).data.publicUrl
    }))
    return results.filter((u): u is string => u !== null)
  }

  // ── 메시지 생성 ───────────────────────────────────────
  const generateMessage = async () => {
    if (!selectedStudentId) { alert('학생을 선택해주세요'); return }
    if (!selectedWork) { alert('작품을 선택해주세요'); return }
    setGenerating(true)

    const s = students.find(s => s.id === selectedStudentId)!
    const selectedTopic = curriculumTopics.find(t => t.id === selectedTopicId)

    const firstName = s.name.length >= 3 ? s.name.slice(1) : s.name
    const hasJongseong = (() => {
      const code = firstName.charCodeAt(firstName.length - 1)
      return code >= 0xAC00 && code <= 0xD7A3 && (code - 0xAC00) % 28 !== 0
    })()
    const nameNun = firstName + (hasJongseong ? '이는' : '는')
    const nameMan = firstName + (hasJongseong ? '이만의' : '만의')
    const studentAge = currentYear - s.birth_year + 1
    const isKindergarten = lessonType === 'curriculum' ? selectedTopic?.age_group === 'kindergarten' : studentAge <= 7
    const end = isKindergarten
      ? { doing: '해보았어요', did: '해주었답니다', great: '기특했어요' }
      : { doing: '표현해주었습니다', did: '해보았습니다', great: '훌륭했습니다' }
    const emojis = ['🎨', '🖌️', '✨', '🌟', '💫', '🖼️', '👏', '😊']
    const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)]
    const emoji = pick(emojis)

    let message = '', topicTitle = ''

    // 기존 진행 중 작품 선택 시 해당 작품의 title/type 사용
    const effectiveLessonType = selectedWork?.sessions > 0 ? selectedWork.type : lessonType
    // curriculum_id로 curriculumTopics에서 템플릿 포함 전체 데이터 조회
    const effectiveTopic = selectedWork?.sessions > 0
      ? (curriculumTopics.find(t => t.id === selectedWork.curriculum_id) ?? selectedTopic)
      : selectedTopic
    const effectiveTopicTitle = selectedWork?.sessions > 0 ? selectedWork.title : (lessonType === 'curriculum' ? (selectedTopic?.title || '') : freeSubject)

    if (effectiveLessonType === 'curriculum') {
      topicTitle = effectiveTopicTitle

      const stages = effectiveTopic?.stage_messages || []
      const matchedStage = stages.find((s: any) => s.label === selectedStage)

      // ── 문구 풀 ──
      const greetings = [
        `안녕하세요~^^`,
        `안녕하세요~!`,
        `안녕하세요😊`,
        `안녕하세요~💛`,
      ]

      const startOpeners = [
        `오늘 ${nameNun} '${topicTitle}' 수업을 시작했습니다~`,
        `오늘부터 ${nameNun} 새 작품 '${topicTitle}'에 들어갔습니다^^`,
        `${nameNun} 오늘 새로운 작품 '${topicTitle}' 수업을 시작했답니다~`,
        `오늘부터 '${topicTitle}' 새 작품이 시작되었습니다!`,
      ]
      const startClosers = [
        `어떤 작품이 완성될지 기대해주세요~!🎨`,
        `앞으로 완성되어갈 모습 기대해주세요~^^✨`,
        `차근차근 멋진 작품 만들어 갈게요!💪`,
        `어떤 결과물이 나올지 함께 지켜봐주세요~^^🌟`,
        `벌써부터 완성이 기대되는 작품입니다~!🖌️`,
      ]

      const progressOpeners = [
        `오늘 ${nameNun} '${topicTitle}' 작업을 이어갔습니다~`,
        `${nameNun} '${topicTitle}' 작품에 집중하며 작업했답니다^^`,
        `'${topicTitle}' 작품을 한 단계 더 발전시켜 나갔습니다~`,
        `오늘도 ${nameNun} '${topicTitle}' 수업에 열심히 참여했습니다!`,
        `지난 시간에 이어 '${topicTitle}' 작업을 진행했답니다~`,
      ]
      const progressClosers = [
        `완성이 점점 가까워지고 있습니다~!🎨`,
        `작품이 점점 풍성해지고 있답니다^^✨`,
        `곧 멋진 작품이 완성될 거예요~!🌟`,
        `한 단계씩 완성에 다가가고 있습니다!💫`,
        `완성되어가는 과정이 정말 기대됩니다~^^🖌️`,
      ]

      const completeOpeners = [
        `${nameNun} '${topicTitle}' 작품을 멋지게 완성했습니다~!🎉`,
        `오늘 ${nameNun} '${topicTitle}' 작품이 드디어 완성되었답니다!✨`,
        `끝까지 집중해서 '${topicTitle}' 작품을 완성했습니다~^^👏`,
        `${nameNun} 오늘 '${topicTitle}' 작품을 마무리했답니다!🌟`,
      ]
      const completeClosers = [
        `완성작 함께 감상해보세요~^^🖼️`,
        `집에서 많이 칭찬해주세요~!💛`,
        `뿌듯해하는 모습이 너무 예뻤어요~^^😊`,
        `멋진 결과물 함께 확인해보세요~!✨`,
        `완성의 기쁨을 함께 나눠주세요~^^💕`,
      ]

      const memoConnectors = [
        `오늘 특히`,
        `선생님이 보기에`,
        `수업 중에`,
        `작업하면서`,
        `오늘은 특별히`,
      ]

      const signoffs = [
        `${nameMan} 멋진 작품입니다~!`,
        `${nameMan} 개성이 담긴 작품이랍니다^^`,
        `${nameMan} 시선으로 표현한 멋진 결과물이에요!`,
        `${nameMan} 감각이 돋보이는 작품입니다~`,
        `${nameMan} 색다른 매력이 느껴지는 작품이랍니다!`,
      ]

      const memo = teacherMemo ? ` ${pick(memoConnectors)} ${teacherMemo}.` : ''
      const greeting = pick(greetings)

      // CASE 1: 새 작품 시작 (sessions === 0)
      if (progressStatus === 'started' && stages.length >= 2) {
        const firstStage = stages[0]

        // 작품 소개: parent_message_template 우선, 없으면 stage_messages 흐름으로 생성
        let introClean = ''
        if (effectiveTopic?.parent_message_template) {
          introClean = effectiveTopic.parent_message_template
            .replace(/합니다/g, '해요').replace(/줍니다/g, '줘요').replace(/됩니다/g, '돼요')
            .split(/\.\s*/).filter((s: string) => s.trim().length > 10).slice(0, 2).join('. ')
        }

        const stageNote = firstStage.message || ''

        message = `${greeting} ${pick(startOpeners)} ${introClean ? introClean + '.' : ''} ${stageNote}${memo} ${pick(startClosers)}`

      // CASE 2: 단계별 멘트가 있는 진행 중/완성
      } else if (matchedStage && matchedStage.message) {
        const stageMsg = matchedStage.message

        if (teacherMemo) {
          try {
            const res = await fetch('/api/generate-daily-message', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                prompt: `미술학원 학부모 안내 메시지를 다듬어주세요.\n\n학생 이름: ${firstName} (${isKindergarten ? '유치부' : '초등부'})\n오늘 작업 단계: ${selectedStage}\n기본 멘트: ${stageMsg}\n선생님 메모: ${teacherMemo}\n\n위 기본 멘트에 선생님 메모 내용을 자연스럽게 녹여서 5문장 이내로 작성해주세요.\n${isKindergarten ? '~해요, ~했어요 체' : '~합니다, ~했습니다 체'}로 작성하세요.\n친근하고 공손한 어투로 작성하세요. (예: ~했답니다, ~있습니다^^)\n마지막에 이모티콘 1개를 붙여주세요.\n첫 문장은 "안녕하세요~^^"로 시작해주세요.`
              })
            })
            const data = await res.json()
            if (data.message) message = data.message
            else throw new Error()
          } catch {
            if (progressStatus === 'completed') {
              message = `${greeting} ${pick(completeOpeners)} ${stageMsg}${memo} ${pick(completeClosers)}`
            } else {
              message = `${greeting} ${pick(progressOpeners)} ${stageMsg}${memo} ${pick(progressClosers)}`
            }
          }
        } else {
          if (progressStatus === 'completed') {
            message = `${greeting} ${pick(completeOpeners)} ${stageMsg} ${pick(signoffs)} ${pick(completeClosers)}`
          } else {
            message = `${greeting} ${pick(progressOpeners)} ${stageMsg} ${pick(signoffs)} ${pick(progressClosers)}`
          }
        }

      // CASE 3: stage_messages가 없는 기존 커리큘럼 (하위 호환)
      } else {
        const template = (effectiveTopic?.parent_message_template || '')
          .replace(/합니다/g, '해요').replace(/줍니다/g, '줘요').replace(/됩니다/g, '돼요')
          .split(/\.\s*/).filter(s => s.trim().length > 10).slice(0, 3).join('. ')
          .replace(/이번 작품은/g, '')
          .replace(/표현합니다/g, `표현${end.did}`).replace(/그려줍니다/g, `그려${end.did}`)
          .replace(/그려요/g, `그려${end.did}`).replace(/묘사하여/g, '묘사하며')
          .replace(/느낌을 줍니다/g, `느낌을 살려${end.did}`).replace(/느낌을 줘요/g, `느낌을 살려${end.did}`)

        let open = '', close = ''
        if (progressStatus === 'started') {
          open = pick(startOpeners)
          close = pick(startClosers)
        } else if (progressStatus === 'completed') {
          open = pick(completeOpeners)
          close = pick(completeClosers)
        } else {
          open = pick(progressOpeners)
          close = pick(progressClosers)
        }
        message = `${greeting} ${open} ${template}. ${memo} ${pick(signoffs)} ${close}`
      }
    } else if (effectiveLessonType === 'free') {
      topicTitle = effectiveTopicTitle
      const materials = selectedMaterials.join(', ') || '다양한 재료'
      try {
        const res = await fetch('/api/generate-daily-message', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ studentName: s.name, studentAge, subject: effectiveTopicTitle, materials, progressStatus, teacherMemo, selectedStage: selectedStage || '진행중' })
        })
        const data = await res.json()
        if (data.message) message = data.message
        else throw new Error(data.error || 'GPT 응답 없음')
      } catch (e) {
        console.error('GPT 실패, fallback:', e)
        const techMap: Record<string, string> = {
          '연필': '선의 강약을 조절하며', '색연필': '색을 겹쳐 칠하며', '매직': '선명한 색감으로',
          '수채화': '물의 양을 조절하며', '아크릴': '선명하고 강렬한 색감으로',
          '파스텔': '부드러운 색감을 활용하여', '점토': '손으로 형태를 만들며', '기타': '다양한 재료를 활용하여'
        }
        const tech = techMap[selectedMaterials[0]] || techMap['기타']
        const memo = teacherMemo || `상상력을 발휘하며 집중하는 모습이 ${end.great}`
        const prog = progressStatus === 'started' ? '오늘 처음 시작한 작품이에요.' : progressStatus === 'completed' ? '오늘 작품을 멋지게 완성했어요!' : '작품을 열심히 진행하고 있어요.'
        message = `오늘 ${nameNun} '${effectiveTopicTitle}'를 주제로 자유화를 ${end.doing}. ${materials}를 사용하여 ${tech} ${end.did}. ${memo}. ${prog} ${nameMan} 멋진 작품이에요! ${emoji}`
      }
    }

    try {
      const [, studentRes] = await Promise.all([
        supabase.from('daily_messages').delete().eq('student_id', s.id).eq('teacher_id', userId),
        supabase.from('students').select('branch_id').eq('id', s.id).single()
      ])

      const { data: newMsg, error: insertErr } = await supabase.from('daily_messages').insert({
        student_id: s.id, teacher_id: userId,
        branch_id: studentRes.data?.branch_id || userBranchId,
        message, lesson_type: lessonType, topic_title: topicTitle, progress_status: progressStatus
      }).select().single()

      if (insertErr) {
        console.error('[daily_messages error]', JSON.stringify(insertErr))
        alert('메시지 저장 실패: ' + insertErr.message)
        setGenerating(false)
        return
      }

      if (images.length > 0 && newMsg) {
        const urls = await uploadImages(newMsg.id)
        if (urls.length) await supabase.from('daily_message_images').insert(
          urls.map((url, i) => ({ daily_message_id: newMsg.id, image_url: url, image_order: i }))
        )
      }

      try {
        await syncSketchbookWork(s.id, topicTitle, lessonType === 'curriculum' ? selectedTopicId : undefined)
      } catch (e) {
        console.warn('스케치북 동기화 실패 (무시):', e)
      }

      imageUrls.forEach(u => URL.revokeObjectURL(u))
      setImages([]); setImageUrls([])
      ;['dm_classId','dm_branchId','dm_studentId','dm_studentSearch','dm_selectedWork',
        'dm_isNewWork','dm_lessonType','dm_topicId','dm_freeSubject','dm_materials','dm_progress','dm_memo']
        .forEach(k => sessionStorage.removeItem(k))
      router.push(`/daily-message/result/${s.id}`)
    } catch (e: any) {
      console.error('[generateMessage catch]', e)
      alert('오류: ' + (e?.message || JSON.stringify(e)))
    }
    setGenerating(false)
  }

  const handleBranchChange = (branchId: string) => {
    setSelectedBranchId(branchId)
    const first = classes.filter(c => c.branch_id === branchId)
    setSelectedClassId(first.length ? first[0].id : '')
    clearStudent()
  }

  const filteredClasses = selectedBranchId ? classes.filter(c => c.branch_id === selectedBranchId) : classes

  if (loading) return <DailyMessageSkeleton />

  // ── 렌더 ─────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'Pretendard', -apple-system, sans-serif", background: "linear-gradient(160deg, #f8fafc 0%, #f0fdf4 50%, #f0f9ff 100%)", minHeight: "100vh" }}>
      <div style={{ maxWidth: 440, margin: "0 auto", background: "#fff", minHeight: "100vh", boxShadow: "0 0 40px rgba(0,0,0,0.08)" }}>

        {/* Header */}
        <div style={{
          background: "rgba(255,255,255,0.9)", backdropFilter: "blur(12px)",
          borderBottom: "1px solid rgba(0,0,0,0.06)", padding: "14px 20px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          position: "sticky", top: 0, zIndex: 40
        }}>
          <span style={{ color: "#6b7280", fontSize: 14, cursor: "pointer" }} onClick={() => router.back()}>← 뒤로</span>
          <span style={{ fontWeight: 700, fontSize: 16, color: "#1f2937" }}>일일 수업 메시지</span>
          {allResultsCount > 0
            ? <span onClick={() => router.push('/daily-message/results')} style={{ fontSize: 12, background: "#0d9488", color: "#fff", padding: "2px 10px", borderRadius: 20, fontWeight: 600, cursor: "pointer" }}>{allResultsCount}</span>
            : <span style={{ width: 40 }} />
          }
        </div>

        <div style={{ padding: "16px 20px 32px" }}>

          {/* 반 선택 */}
          <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #f3f4f6", padding: 16, marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#1f2937", marginBottom: 10 }}>📚 반 선택</div>
            {userRole === 'admin' && (
              <div style={{ position: "relative", marginBottom: 8 }}>
                <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#9ca3af", fontSize: 13 }}>🏢</span>
                <select value={selectedBranchId} onChange={e => handleBranchChange(e.target.value)}
                  style={{ width: "100%", padding: "11px 14px 11px 36px", background: "#f9fafb", borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 14, color: "#1f2937", appearance: "none", cursor: "pointer", outline: "none" }}>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", color: "#9ca3af", pointerEvents: "none" }}>▼</span>
              </div>
            )}
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#9ca3af", fontSize: 13 }}>📚</span>
              <select value={selectedClassId} onChange={e => setSelectedClassId(e.target.value)}
                style={{ width: "100%", padding: "11px 14px 11px 36px", background: "#f9fafb", borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 14, color: "#1f2937", appearance: "none", cursor: "pointer", outline: "none" }}>
                {filteredClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", color: "#9ca3af", pointerEvents: "none" }}>▼</span>
            </div>
          </div>

          {/* 학생 선택 */}
          <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #f3f4f6", padding: 16, marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#1f2937", marginBottom: 10 }}>👤 학생 선택</div>
            <div style={{ position: "relative" }}>
              <input
                type="text"
                value={studentSearch}
                onChange={e => { setStudentSearch(e.target.value); if (selectedStudentId) { setSelectedStudentId(''); resetSelection(); } }}
                onFocus={() => { if (selectedStudentId) setStudentSearch('') }}
                placeholder={student ? `${student.name} (${getAge(student.birth_year)}세)` : "🔍 이름을 검색하세요"}
                style={{
                  width: "100%", padding: "11px 36px 11px 14px", borderRadius: 12, fontSize: 14,
                  outline: "none", boxSizing: "border-box",
                  background: selectedStudentId ? "#f0fdfa" : "#f9fafb",
                  border: selectedStudentId ? "2px solid #0d9488" : "1px solid #e5e7eb",
                  color: selectedStudentId ? "#0f766e" : "#1f2937",
                  fontWeight: selectedStudentId ? 600 : 400,
                }}
              />
              {selectedStudentId && (
                <button onClick={clearStudent} style={{
                  position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                  width: 22, height: 22, borderRadius: "50%", background: "#e5e7eb", border: "none",
                  color: "#6b7280", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center"
                }}>✕</button>
              )}
            </div>
            {!selectedStudentId && (
              <div style={{ marginTop: 8, maxHeight: 192, overflowY: "auto", borderRadius: 12, border: "1px solid #e5e7eb", background: "#fff" }}>
                {students.filter(s => !studentSearch || s.name.includes(studentSearch)).map(s => (
                  <button key={s.id}
                    onClick={() => { setSelectedStudentId(s.id); setStudentSearch(s.name); resetSelection(); }}
                    style={{ width: "100%", padding: "11px 16px", textAlign: "left", background: "none", border: "none", borderBottom: "1px solid #f3f4f6", cursor: "pointer", fontSize: 14, color: "#1f2937" }}
                    onMouseOver={e => (e.currentTarget.style.background = "#f0fdfa")}
                    onMouseOut={e => (e.currentTarget.style.background = "none")}
                  >
                    <span style={{ fontWeight: 500 }}>{s.name}</span>
                    <span style={{ color: "#9ca3af", fontSize: 13, marginLeft: 4 }}>({getAge(s.birth_year)}세)</span>
                  </button>
                ))}
                {students.filter(s => !studentSearch || s.name.includes(studentSearch)).length === 0 && (
                  <p style={{ textAlign: "center", padding: "16px 0", color: "#9ca3af", fontSize: 13 }}>
                    {students.length === 0 ? '해당 반에 학생이 없습니다' : '검색 결과가 없습니다'}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* ===== 학생 선택 후 ===== */}
          {student && (
            <>
              {/* CASE 1: 진행 중 작품 있고 새 작품 모드 아닐 때 */}
              {hasInProgress && !isNewWork && (
                <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #f3f4f6", padding: 16, marginBottom: 12, animation: "fadeIn 0.25s ease" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#1f2937" }}>🎨 진행 중인 작품</div>
                    <span style={{ fontSize: 11, color: "#0d9488", background: "#f0fdfa", padding: "3px 10px", borderRadius: 8, fontWeight: 600 }}>{inProgressList.length}개</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {inProgressList.map(work => (
                      <div key={work.id}
                        onClick={() => { setSelectedWork(work); setIsNewWork(false); setProgressStatus('none') }}
                        style={{
                          padding: "12px 14px", borderRadius: 14, cursor: "pointer", transition: "all 0.15s",
                          border: selectedWork?.id === work.id ? "2px solid #0d9488" : "1.5px solid #e5e7eb",
                          background: selectedWork?.id === work.id ? "#f0fdfa" : "#fff",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{
                              fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 6,
                              background: work.type === 'curriculum' ? "#dbeafe" : "#fef3c7",
                              color: work.type === 'curriculum' ? "#1d4ed8" : "#92400e", letterSpacing: -0.3
                            }}>{work.type === 'curriculum' ? '커리큘럼' : '자율'}</span>
                            <span style={{ fontSize: 14, fontWeight: 600, color: "#1f2937" }}>{work.title}</span>
                          </div>
                          {selectedWork?.id === work.id && <span style={{ color: "#0d9488", fontWeight: 700 }}>✓</span>}
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                          <div style={{ display: "flex", gap: 10, fontSize: 12, color: "#6b7280" }}>
                            <span>📅 {work.work_date}~</span>
                            <span style={{ fontWeight: 700, color: work.sessions >= 4 ? "#ef4444" : work.sessions >= 3 ? "#f59e0b" : "#6b7280" }}>
                              {work.sessions >= 4 ? "🚨" : work.sessions >= 3 ? "⚠️" : "🔄"} {work.sessions}회차
                            </span>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleQuickComplete(work) }}
                            style={{ padding: "4px 10px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#6b7280", fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
                          >
                            ✓ 완성
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => { setIsNewWork(true); setSelectedWork(null); setProgressStatus('none') }}
                    style={{ width: "100%", marginTop: 10, padding: "11px 0", borderRadius: 12, border: "1.5px dashed #d1d5db", background: "#fafafa", color: "#6b7280", fontSize: 13, fontWeight: 500, cursor: "pointer" }}
                  >+ 새 작품 시작하기</button>
                </div>
              )}

              {/* CASE 2: 진행 중 없거나 새 작품 모드 */}
              {(!hasInProgress || isNewWork) && (
                <div style={{ animation: "fadeIn 0.25s ease" }}>
                  {isNewWork && (
                    <button onClick={() => { setIsNewWork(false); resetSelection() }}
                      style={{ display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 10, padding: "6px 12px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#fff", color: "#6b7280", fontSize: 12, cursor: "pointer" }}>
                      ← 진행 중 작품으로 돌아가기
                    </button>
                  )}

                  {/* 수업 유형 */}
                  <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #f3f4f6", padding: 16, marginBottom: 12 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#1f2937", marginBottom: 10 }}>📚 수업 유형</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      {[{ key: 'curriculum', label: '커리큘럼' }, { key: 'free', label: '자율' }].map(t => (
                        <button key={t.key}
                          onClick={() => { setLessonType(t.key as any); setSelectedTopicId(''); setFreeSubject(''); setSelectedWork(null) }}
                          style={{
                            padding: "12px 0", borderRadius: 12, border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600, transition: "all 0.15s",
                            background: lessonType === t.key ? "linear-gradient(135deg, #0d9488, #06b6d4)" : "#f9fafb",
                            color: lessonType === t.key ? "#fff" : "#6b7280",
                            boxShadow: lessonType === t.key ? "0 2px 8px rgba(13,148,136,0.25)" : "none",
                            outline: lessonType === t.key ? "none" : "1px solid #e5e7eb",
                          }}
                        >{t.label}</button>
                      ))}
                    </div>
                  </div>

                  {/* 커리큘럼 주제 선택 */}
                  {lessonType === 'curriculum' && (
                    <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #f3f4f6", padding: 16, marginBottom: 12 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#1f2937", marginBottom: 10 }}>📖 주제 선택</div>
                      <div style={{ position: "relative" }}>
                        <input
                          type="text"
                          value={curriculumSearch}
                          onChange={e => { setCurriculumSearch(e.target.value); if (selectedTopicId) { setSelectedTopicId(''); setSelectedWork(null); } }}
                          onFocus={() => { if (selectedTopicId) setCurriculumSearch('') }}
                          placeholder={selectedTopicId ? curriculumTopics.find(c => c.id === selectedTopicId)?.title || "🔍 주제를 검색하세요" : "🔍 주제를 검색하세요"}
                          style={{
                            width: "100%", padding: "11px 36px 11px 14px", borderRadius: 12, fontSize: 14,
                            outline: "none", boxSizing: "border-box",
                            background: selectedTopicId ? "#f0fdfa" : "#f9fafb",
                            border: selectedTopicId ? "2px solid #0d9488" : "1px solid #e5e7eb",
                            color: selectedTopicId ? "#0f766e" : "#1f2937",
                            fontWeight: selectedTopicId ? 600 : 400,
                          }}
                        />
                        {selectedTopicId && (
                          <button onClick={() => { setSelectedTopicId(''); setCurriculumSearch(''); setSelectedWork(null); }}
                            style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", width: 22, height: 22, borderRadius: "50%", background: "#e5e7eb", border: "none", color: "#6b7280", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                        )}
                      </div>
                      {!selectedTopicId && (
                        <div style={{ marginTop: 8, maxHeight: 220, overflowY: "auto", borderRadius: 12, border: "1px solid #e5e7eb", background: "#fff" }}>
                          {curriculumTopics
                            .filter(t => !curriculumSearch || t.title.includes(curriculumSearch))
                            .map(topic => (
                              <button key={topic.id}
                                onClick={() => {
                                  setSelectedTopicId(topic.id)
                                  setCurriculumSearch(topic.month && topic.week ? `[${topic.month}-${topic.week}] ${topic.title}` : topic.title)
                                  setSelectedWork({ id: `new-${topic.id}`, title: topic.title, type: 'curriculum', sessions: 0, startedAt: '신규' })
                                  setProgressStatus('started')
                                }}
                                style={{ width: "100%", padding: "11px 16px", textAlign: "left", background: "none", border: "none", borderBottom: "1px solid #f3f4f6", cursor: "pointer", fontSize: 14, color: "#1f2937", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                                onMouseOver={e => (e.currentTarget.style.background = "#f0fdfa")}
                                onMouseOut={e => (e.currentTarget.style.background = "none")}
                              >
                                <span>
                                  {topic.month && topic.week
                                    ? <span style={{ color: "#0d9488", fontWeight: 700, marginRight: 6, background: "#f0fdfa", padding: "1px 6px", borderRadius: 6, fontSize: 12 }}>{topic.month}-{topic.week}</span>
                                    : topic.week
                                    ? <span style={{ color: "#0d9488", fontWeight: 700, marginRight: 4 }}>{topic.week}주</span>
                                    : null}
                                  <span style={{ fontWeight: 500 }}>{topic.title}</span>
                                </span>
                                <span style={{ fontSize: 11, color: "#6b7280", background: "#f3f4f6", padding: "2px 8px", borderRadius: 6, flexShrink: 0 }}>
                                  {topic.age_group === 'kindergarten' ? '유치' : '초등'}
                                </span>
                              </button>
                            ))}
                          {curriculumTopics.filter(t => !curriculumSearch || t.title.includes(curriculumSearch)).length === 0 && (
                            <p style={{ textAlign: "center", padding: "16px 0", color: "#9ca3af", fontSize: 13 }}>검색 결과가 없습니다</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 자율 주제 + 재료 */}
                  {lessonType === 'free' && (
                    <>
                      <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #f3f4f6", padding: 16, marginBottom: 12 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "#1f2937", marginBottom: 10 }}>📝 주제</div>
                        <input value={freeSubject}
                          onChange={e => {
                            setFreeSubject(e.target.value)
                            if (e.target.value.trim()) {
                              setSelectedWork({ id: 'new-free', title: e.target.value, type: 'free', sessions: 0, startedAt: '신규' })
                              setProgressStatus('started')
                            } else {
                              setSelectedWork(null)
                            }
                          }}
                          placeholder="예: 우리 강아지"
                          style={{ width: "100%", padding: "11px 14px", borderRadius: 12, border: "1px solid #e5e7eb", background: "#f9fafb", fontSize: 14, outline: "none", boxSizing: "border-box" }}
                        />
                      </div>
                      <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #f3f4f6", padding: 16, marginBottom: 12 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "#1f2937", marginBottom: 10 }}>🎨 재료 (복수 선택)</div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
                          {MATERIAL_OPTIONS.map(m => (
                            <button key={m} onClick={() => toggleMaterial(m)}
                              style={{ padding: "8px 0", borderRadius: 10, cursor: "pointer", fontSize: 12, fontWeight: 500, transition: "all 0.1s", background: selectedMaterials.includes(m) ? "linear-gradient(135deg, #0d9488, #06b6d4)" : "#f9fafb", color: selectedMaterials.includes(m) ? "#fff" : "#6b7280", border: selectedMaterials.includes(m) ? "none" : "1px solid #e5e7eb" }}>
                              {m}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* 진행 상태 + 사진 + 메모 + 생성 버튼 */}
              {selectedWork && (
                <div style={{ animation: "fadeIn 0.2s ease" }}>
                  {/* 진행 상태: 새 작품(sessions===0)이면 '시작' 고정, 기존 작품이면 진행중/완성 선택 */}
                  {selectedWork.sessions !== 0 && (
                    <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #f3f4f6", padding: 16, marginBottom: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "#1f2937" }}>📊 오늘 작업 단계</div>
                        <div style={{ fontSize: 11, padding: "3px 10px", borderRadius: 8, fontWeight: 700, background: "#f0fdfa", color: "#0d9488" }}>
                          {selectedWork.sessions + 1}회차
                        </div>
                      </div>
                      <div style={{ background: "#f0fdfa", borderRadius: 10, padding: "8px 12px", marginBottom: 12, display: "flex", alignItems: "center", gap: 8, border: "1px solid #ccfbf1" }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 5, background: selectedWork.type === 'curriculum' ? "#dbeafe" : "#fef3c7", color: selectedWork.type === 'curriculum' ? "#1d4ed8" : "#92400e" }}>
                          {selectedWork.type === 'curriculum' ? '커리큘럼' : '자율'}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#0f766e" }}>{selectedWork.title}</span>
                      </div>
                      {/* 작업 단계 선택 */}
                      {(() => {
                        const effectiveTopic = curriculumTopics.find(t => t.id === selectedWork.curriculum_id)
                        const stages = selectedWork.type === 'curriculum' && effectiveTopic?.stage_messages && effectiveTopic.stage_messages.length >= 2
                          ? effectiveTopic.stage_messages
                          : null

                        // 새 로직: stage_messages가 2개 이상 등록된 커리큘럼
                        if (stages) {
                          return (
                            <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(stages.length, 5)}, 1fr)`, gap: 6 }}>
                              {stages.map((stage: any, idx: number) => (
                                <button key={idx}
                                  onClick={() => {
                                    setSelectedStage(stage.label)
                                    setProgressStatus(stage.label === '완성' ? 'completed' : 'none')
                                  }}
                                  style={{
                                    padding: "10px 0", borderRadius: 10, border: "none", cursor: "pointer",
                                    fontSize: 12, fontWeight: 600, transition: "all 0.15s",
                                    background: selectedStage === stage.label ? "linear-gradient(135deg, #0d9488, #06b6d4)" : "#f9fafb",
                                    color: selectedStage === stage.label ? "#fff" : "#6b7280",
                                    boxShadow: selectedStage === stage.label ? "0 2px 8px rgba(13,148,136,0.25)" : "none",
                                    outline: selectedStage === stage.label ? "none" : "1px solid #e5e7eb",
                                  }}
                                >{stage.label}</button>
                              ))}
                            </div>
                          )
                        }

                        // 자율 작품: 공통 4단계
                        if (selectedWork.type === 'free') {
                          return (
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                              {FREE_LESSON_STAGES.map(stage => (
                                <button key={stage.key}
                                  onClick={() => {
                                    setSelectedStage(stage.label)
                                    setProgressStatus(stage.label === '완성' ? 'completed' : 'none')
                                  }}
                                  style={{
                                    padding: "10px 0", borderRadius: 10, border: "none", cursor: "pointer",
                                    fontSize: 12, fontWeight: 600, transition: "all 0.15s",
                                    background: selectedStage === stage.label ? "linear-gradient(135deg, #0d9488, #06b6d4)" : "#f9fafb",
                                    color: selectedStage === stage.label ? "#fff" : "#6b7280",
                                    boxShadow: selectedStage === stage.label ? "0 2px 8px rgba(13,148,136,0.25)" : "none",
                                    outline: selectedStage === stage.label ? "none" : "1px solid #e5e7eb",
                                  }}
                                >{stage.label}</button>
                              ))}
                            </div>
                          )
                        }

                        // 기존 커리큘럼 (stage_messages 미등록): 진행중/완성 2버튼
                        return (
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                            {['진행중', '완성'].map(label => {
                              const key = label === '진행중' ? 'none' : 'completed'
                              return (
                                <button key={key}
                                  onClick={() => {
                                    setProgressStatus(key as any)
                                    setSelectedStage(label)
                                  }}
                                  style={{
                                    padding: "11px 0", borderRadius: 12, border: "none", cursor: "pointer",
                                    fontSize: 13, fontWeight: 600, transition: "all 0.15s",
                                    background: progressStatus === key ? "linear-gradient(135deg, #0d9488, #06b6d4)" : "#f9fafb",
                                    color: progressStatus === key ? "#fff" : "#6b7280",
                                    boxShadow: progressStatus === key ? "0 2px 8px rgba(13,148,136,0.3)" : "none",
                                    outline: progressStatus === key ? "none" : "1px solid #e5e7eb",
                                  }}
                                >{label}</button>
                              )
                            })}
                          </div>
                        )
                      })()}
                    </div>
                  )}

                  {/* 사진 */}
                  <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #f3f4f6", padding: 16, marginBottom: 12 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#1f2937", marginBottom: 10 }}>
                      📷 작품 사진 <span style={{ color: "#9ca3af", fontWeight: 400, fontSize: 12 }}>(선택 · {images.length}/{MAX_IMAGES}장)</span>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {imageUrls.map((url, i) => (
                        <div key={i} style={{ position: "relative", width: 60, height: 60 }}>
                          <img src={url} alt="" style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 10 }} />
                          <button onClick={() => removeImage(i)} style={{ position: "absolute", top: -4, right: -4, width: 18, height: 18, borderRadius: "50%", background: "#ef4444", border: "none", color: "#fff", fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                        </div>
                      ))}
                      {images.length < MAX_IMAGES && (
                        compressing
                          ? <div style={{ width: 60, height: 60, border: "2px dashed #0d9488", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#0d9488" }}>압축중</div>
                          : <label style={{ width: 60, height: 60, border: "2px dashed #d1d5db", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", color: "#d1d5db", fontSize: 24, cursor: "pointer" }}>
                              +
                              <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple onChange={e => { e.target.files && handleImageUpload(e.target.files); e.target.value = '' }} style={{ display: "none" }} />
                            </label>
                      )}
                    </div>
                  </div>

                  {/* 메모 */}
                  <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #f3f4f6", padding: 16, marginBottom: 16 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#1f2937", marginBottom: 10 }}>
                      📝 메모 <span style={{ color: "#9ca3af", fontWeight: 400, fontSize: 12 }}>(선택)</span>
                    </div>
                    <textarea value={teacherMemo} onChange={e => setTeacherMemo(e.target.value)}
                      placeholder="예: 색 조합이 예뻤어요, 집중력이 좋았어요" rows={3}
                      style={{ width: "100%", padding: "11px 14px", borderRadius: 12, border: "1px solid #e5e7eb", background: "#f9fafb", fontSize: 14, outline: "none", boxSizing: "border-box", resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }}
                    />
                  </div>

                  {/* 생성 버튼 */}
                  <button onClick={generateMessage} disabled={generating}
                    style={{ width: "100%", padding: "15px 0", borderRadius: 16, border: "none", background: "linear-gradient(135deg, #0d9488, #06b6d4)", color: "#fff", fontSize: 15, fontWeight: 600, cursor: generating ? "not-allowed" : "pointer", boxShadow: "0 4px 16px rgba(13,148,136,0.35)", opacity: generating ? 0.7 : 1 }}>
                    {generating ? '생성 중...' : `✨ ${student.name} 메시지 생성`}
                  </button>
                </div>
              )}

              {/* 빈 상태 힌트 */}
              {!hasInProgress && !isNewWork && !selectedWork && (
                <div style={{ textAlign: "center", padding: "24px 16px", color: "#9ca3af", fontSize: 13, background: "#f9fafb", borderRadius: 16, border: "1px dashed #e5e7eb" }}>
                  진행 중인 작품이 없습니다.<br />
                  위에서 수업 유형과 주제를 선택해 새 작품을 시작해주세요.
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        select:focus { border-color: #0d9488; box-shadow: 0 0 0 2px rgba(13,148,136,0.15); }
        input:focus { border-color: #0d9488 !important; box-shadow: 0 0 0 2px rgba(13,148,136,0.15); }
        button:hover { opacity: 0.92; }
      `}</style>
    </div>
  )
}
