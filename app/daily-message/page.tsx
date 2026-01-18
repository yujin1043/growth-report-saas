'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Student {
  id: string
  name: string
  birth_year: number
  class_id: string | null
}

interface ClassOption {
  id: string
  name: string
}

interface CurriculumTopic {
  id: string
  year: number
  month: number
  age_group: string
  title: string
  materials: string[]
  parent_message_template: string
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
  
  const [classes, setClasses] = useState<ClassOption[]>([])
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

  // 커리큘럼 선택 모달 상태
  const [showCurriculumModal, setShowCurriculumModal] = useState(false)

  useEffect(() => {
    loadInitialData()
  }, [])

  useEffect(() => {
    if (selectedClassId) {
      loadStudentsByClass(selectedClassId)
      setSelectedStudentId('')
    }
  }, [selectedClassId])

  async function loadInitialData() {
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      router.push('/login')
      return
    }

    setUserId(user.id)

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role, branch_id')
      .eq('id', user.id)
      .single()

    if (profile?.branch_id) {
      setUserBranchId(profile.branch_id)
    }

    const { data: teacherClasses } = await supabase
      .from('teacher_classes')
      .select('class_id')
      .eq('teacher_id', user.id)

    const classIds = teacherClasses?.map(tc => tc.class_id) || []

    let classQuery = supabase.from('classes').select('id, name, branch_id, branches(name)')
    
    if (profile?.role === 'teacher' && classIds.length > 0) {
      classQuery = classQuery.in('id', classIds)
    } else if (profile?.branch_id) {
      classQuery = classQuery.eq('branch_id', profile.branch_id)
    }

    const { data: classesData } = await classQuery.order('name')
    if (classesData) {
      const formattedClasses = classesData.map((c: any) => ({
        id: c.id,
        name: c.branches?.name ? `${c.branches.name} - ${c.name}` : c.name
      }))
      setClasses(formattedClasses)
      if (formattedClasses.length > 0) {
        setSelectedClassId(formattedClasses[0].id)
      }
    }

    // 커리큘럼 조회
    let topicsQuery = supabase.from('curriculum_topics').select('*')

    if (profile?.role !== 'admin') {
      const now = new Date()
      const currentYear = now.getFullYear()
      const currentMonth = now.getMonth() + 1
      let prevYear = currentYear
      let prevMonth = currentMonth - 1
      if (prevMonth === 0) {
        prevMonth = 12
        prevYear = currentYear - 1
      }
      topicsQuery = topicsQuery.or(
        `and(year.eq.${currentYear},month.eq.${currentMonth}),and(year.eq.${prevYear},month.eq.${prevMonth})`
      )
    }

    const { data: topics } = await topicsQuery
      .order('year', { ascending: false })
      .order('month', { ascending: false })
      .order('created_at')

    if (topics) {
      setCurriculumTopics(topics)
    }

    const { count } = await supabase
      .from('daily_messages')
      .select('*', { count: 'exact', head: true })
      .gte('expires_at', new Date().toISOString())

    setAllResultsCount(count || 0)

    const { data: existingMessages } = await supabase
      .from('daily_messages')
      .select('student_id')
      .gte('expires_at', new Date().toISOString())

    if (existingMessages) {
      setGeneratedStudentIds(existingMessages.map(m => m.student_id))
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

  const handleImageUpload = (files: FileList) => {
    const fileArray = Array.from(files).slice(0, 4 - images.length)
    const newUrls = fileArray.map(file => URL.createObjectURL(file))
    setImages(prev => [...prev, ...fileArray])
    setImageUrls(prev => [...prev, ...newUrls])
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

  const uploadImages = async (messageId: string): Promise<string[]> => {
    const uploadedUrls: string[] = []
    
    for (let i = 0; i < images.length; i++) {
      const file = images[i]
      const fileExt = file.name.split('.').pop()
      const fileName = `${messageId}/${i}.${fileExt}`
      
      const { error: uploadError } = await supabase.storage
        .from('daily-message-images')
        .upload(fileName, file)

      if (!uploadError) {
        const { data: { publicUrl } } = supabase.storage
          .from('daily-message-images')
          .getPublicUrl(fileName)
        
        uploadedUrls.push(publicUrl)
      }
    }
    
    return uploadedUrls
  }

  const generateMessage = async () => {
    if (!selectedStudentId) {
      alert('학생을 선택해주세요')
      return
    }
    
    setGenerating(true)
    
    const student = students.find(s => s.id === selectedStudentId)
    if (!student) return

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
    const nameGa = firstName + (hasJongseong ? '이가' : '가')

    const currentYear = new Date().getFullYear()
    const studentAge = currentYear - student.birth_year + 1

    let prompt = ''
    let topicTitle = ''
    
    if (lessonType === 'curriculum' && selectedTopic) {
      const baseTemplate = selectedTopic.parent_message_template || ''
      const ageGroup = selectedTopic.age_group
      topicTitle = selectedTopic.title
      
      prompt = `당신은 미술학원 선생님입니다. 학부모에게 보낼 오늘의 수업 메시지를 작성해주세요.

[학생 정보]
- 이름: ${student.name} (메시지에서는 "${firstName}"으로 자연스럽게 호칭)
- 연령대: ${ageGroup === 'kindergarten' ? '유치부' : '초등부'}

[수업 정보]
- 주제: ${selectedTopic.title}
- 사용 재료: ${selectedTopic.materials?.join(', ') || ''}
${progressStatus === 'started' ? '- 진행 상태: 오늘 처음 시작함' : ''}
${progressStatus === 'completed' ? '- 진행 상태: 오늘 완성함' : ''}
${teacherMemo ? `- 선생님 메모: ${teacherMemo}` : ''}

[참고 템플릿]
${baseTemplate}

[작성 규칙]
1. 정확히 5문장으로 작성
2. 문장 구조:
   - 1문장: 오늘 활동 소개 ("오늘 ${nameNun}" 또는 "${nameGa}"로 시작)
   - 2문장: 구체적 기법/표현 설명
   - 3문장: 배운 점이나 시도한 것
   - 4문장: 아이의 태도/반응 칭찬
   - 5문장: 마무리 격려 + 이모지 1개
3. 톤: ${ageGroup === 'kindergarten' ? '따뜻하고 친근하게' : '기법 설명 포함'}
4. 150-200자 내외`
    } else {
      let ageGroup: 'young' | 'middle' | 'upper'
      let ageGroupLabel: string
      
      if (studentAge <= 7) {
        ageGroup = 'young'
        ageGroupLabel = '유치/저학년'
      } else if (studentAge <= 10) {
        ageGroup = 'middle'
        ageGroupLabel = '중학년'
      } else {
        ageGroup = 'upper'
        ageGroupLabel = '고학년'
      }

      topicTitle = freeSubject

      prompt = `당신은 미술학원 선생님입니다. 학부모에게 보낼 오늘의 수업 메시지를 작성해주세요.

[학생 정보]
- 이름: ${student.name} (메시지에서는 "${firstName}"으로 자연스럽게 호칭)
- 연령: ${studentAge}세 (${ageGroupLabel})

[수업 정보]
- 자유화 주제: ${freeSubject}
- 사용 재료: ${selectedMaterials.join(', ')}
${progressStatus === 'started' ? '- 진행 상태: 오늘 처음 시작함' : ''}
${progressStatus === 'completed' ? '- 진행 상태: 오늘 완성함' : ''}
${teacherMemo ? `- 선생님 메모: ${teacherMemo}` : ''}

[작성 규칙]
1. 정확히 5문장으로 작성
2. 문장 구조:
   - 1문장: 오늘 활동 소개 ("오늘 ${nameNun}" 또는 "${nameGa}"로 시작)
   - 2문장: 관찰/표현 과정
   - 3문장: 기법/재료 활용 설명
   - 4문장: 아이의 강점/인상적인 점 칭찬
   - 5문장: 마무리 기대 + 이모지 1개
3. 150-200자 내외`
    }

    try {
      const response = await fetch('/api/generate-daily-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      })

      if (response.ok) {
        const data = await response.json()
        
        await supabase
          .from('daily_messages')
          .delete()
          .eq('student_id', student.id)
          .eq('teacher_id', userId)

        const { data: studentData } = await supabase
          .from('students')
          .select('branch_id')
          .eq('id', student.id)
          .single()

        const { data: newMessage, error: insertError } = await supabase
          .from('daily_messages')
          .insert({
            student_id: student.id,
            teacher_id: userId,
            branch_id: studentData?.branch_id || userBranchId,
            message: data.message,
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

        if (images.length > 0 && newMessage) {
          const uploadedUrls = await uploadImages(newMessage.id)
          
          for (let i = 0; i < uploadedUrls.length; i++) {
            await supabase
              .from('daily_message_images')
              .insert({
                daily_message_id: newMessage.id,
                image_url: uploadedUrls[i],
                image_order: i
              })
          }
        }

        router.push(`/daily-message/result/${student.id}`)
      } else {
        const errorData = await response.json()
        alert(errorData.error || '메시지 생성에 실패했습니다')
      }
    } catch (error) {
      console.error('Error generating message:', error)
      alert('메시지 생성에 실패했습니다. 네트워크 연결을 확인해주세요.')
    }
    
    setGenerating(false)
  }

  const groupedTopics = curriculumTopics.reduce((acc, topic) => {
    const key = `${topic.year}-${topic.month}`
    if (!acc[key]) {
      acc[key] = { year: topic.year, month: topic.month, topics: [] }
    }
    acc[key].topics.push(topic)
    return acc
  }, {} as {[key: string]: { year: number, month: number, topics: CurriculumTopic[] }})

  const selectedStudent = students.find(s => s.id === selectedStudentId)
  const selectedTopicData = curriculumTopics.find(t => t.id === selectedTopicId)

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
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 pb-8">
      <header className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-40 border-b border-gray-200/50">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <button onClick={() => router.push('/dashboard')} className="text-gray-500 hover:text-gray-700">
              ← 뒤로
            </button>
            <h1 className="text-lg font-bold text-gray-800">일일 수업 메시지</h1>
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
          <select
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          >
            {classes.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <h2 className="font-semibold text-gray-800 mb-3">👤 학생 선택</h2>
          <select
            value={selectedStudentId}
            onChange={(e) => setSelectedStudentId(e.target.value)}
            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          >
            <option value="">학생을 선택해주세요</option>
            {students.map(student => {
              const isGenerated = generatedStudentIds.includes(student.id)
              const age = new Date().getFullYear() - student.birth_year + 1
              return (
                <option key={student.id} value={student.id}>
                  {isGenerated ? '✓ ' : ''}{student.name} ({age}세)
                </option>
              )
            })}
          </select>
          {students.length === 0 && (
            <p className="text-gray-400 text-center py-4">해당 반에 학생이 없습니다</p>
          )}
        </div>

        {selectedStudent && (
          <>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <h2 className="font-semibold text-gray-800 mb-3">
                📷 {selectedStudent.name} 작품 사진
                <span className="text-gray-400 font-normal text-sm ml-1">(선택)</span>
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
                
                {images.length < 4 && (
                  <label className="aspect-square border-2 border-dashed border-gray-200 rounded-xl flex items-center justify-center cursor-pointer hover:bg-gray-50">
                    <span className="text-2xl text-gray-300">+</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => e.target.files && handleImageUpload(e.target.files)}
                      className="hidden"
                    />
                  </label>
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
                      ? `${selectedTopicData.title} (${selectedTopicData.materials?.join(', ') || ''}) [${selectedTopicData.age_group === 'kindergarten' ? '유치' : '초등'}]`
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
                  { key: 'none', label: '선택 안함' },
                  { key: 'started', label: '시작' },
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
                📝 한줄 메모
                <span className="text-gray-400 font-normal text-sm ml-1">(선택)</span>
              </h2>
              <input
                type="text"
                value={teacherMemo}
                onChange={(e) => setTeacherMemo(e.target.value)}
                placeholder="예: 색 조합이 예뻤어요"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent"
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
                  생성 중...
                </>
              ) : (
                `✨ ${selectedStudent.name} 문구 생성`
              )}
            </button>
          </>
        )}
      </div>

      {/* 커리큘럼 선택 모달 */}
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
                        <div className="flex-1">
                          <p className="font-medium text-gray-800">{topic.title}</p>
                          <p className="text-sm text-gray-500 mt-1">
                            {topic.materials?.join(', ') || ''}
                            <span className="ml-2 px-2 py-0.5 bg-gray-100 rounded text-xs">
                              {topic.age_group === 'kindergarten' ? '유치' : '초등'}
                            </span>
                          </p>
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