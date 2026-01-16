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

    const { data: topics } = await supabase
      .from('curriculum_topics')
      .select('*')
      .order('year', { ascending: false })
      .order('month', { ascending: false })
      .order('order_num')

    if (topics) {
      setCurriculumTopics(topics)
    }

    // 기존 메시지 개수 조회
    const { count } = await supabase
      .from('daily_messages')
      .select('*', { count: 'exact', head: true })
      .gte('expires_at', new Date().toISOString())

    setAllResultsCount(count || 0)

    // 이미 생성된 학생 ID 조회
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
        
        console.log('Uploaded URL:', publicUrl)
        
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

    let prompt = ''
    let topicTitle = ''
    
    if (lessonType === 'curriculum' && selectedTopic) {
      topicTitle = selectedTopic.title
      prompt = `다음 정보를 바탕으로 학부모에게 보낼 일일 수업 메시지를 작성해주세요.

학생 이름: ${student.name} (메시지에서는 "${nameNun}" 또는 "${nameGa}" 형태로 자연스럽게 사용)
수업 주제: ${selectedTopic.title}
사용 재료: ${selectedTopic.materials?.join(', ') || ''}
기본 템플릿: ${selectedTopic.parent_message_template || ''}
${progressStatus === 'started' ? '진행 상태: 오늘 처음 시작' : ''}
${progressStatus === 'completed' ? '진행 상태: 오늘 완성' : ''}
${teacherMemo ? `교사 메모: ${teacherMemo}` : ''}

템플릿을 기반으로 자연스럽게 변형해주세요. 2-4문장, 이모지 1-2개 포함.`
    } else {
      topicTitle = freeSubject
      prompt = `다음 정보를 바탕으로 학부모에게 보낼 일일 수업 메시지를 작성해주세요.

학생 이름: ${student.name} (메시지에서는 "${nameNun}" 또는 "${nameGa}" 형태로 자연스럽게 사용)
자유 주제: ${freeSubject}
사용 재료: ${selectedMaterials.join(', ')}
${progressStatus === 'started' ? '진행 상태: 오늘 처음 시작' : ''}
${progressStatus === 'completed' ? '진행 상태: 오늘 완성' : ''}
${teacherMemo ? `교사 메모: ${teacherMemo}` : ''}

친근한 선생님 톤으로 작성해주세요. 2-4문장, 이모지 1-2개 포함.`
    }

    try {
      const response = await fetch('/api/generate-daily-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      })

      if (response.ok) {
        const data = await response.json()
        
        // 기존 메시지 삭제 (같은 학생)
        await supabase
          .from('daily_messages')
          .delete()
          .eq('student_id', student.id)
          .eq('teacher_id', userId)

        // 학생의 branch_id 조회
        const { data: studentData } = await supabase
          .from('students')
          .select('branch_id')
          .eq('id', student.id)
          .single()

        // 새 메시지 저장
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

        // 이미지 업로드
        if (images.length > 0 && newMessage) {
          const uploadedUrls = await uploadImages(newMessage.id)
          
          // 이미지 URL DB 저장
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

        // 결과 페이지로 이동
        router.push(`/daily-message/result/${student.id}`)
      }
    } catch (error) {
      console.error('Error generating message:', error)
      alert('메시지 생성에 실패했습니다')
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
        {/* 전체 결과 보기 버튼 */}
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

        {/* 반 선택 */}
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

        {/* 학생 선택 */}
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
        {/* 선택된 학생 입력 폼 */}
        {selectedStudent && (
          <>
            {/* 사진 업로드 */}
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

            {/* 수업 유형 */}
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

            {/* 커리큘럼 선택 */}
            {lessonType === 'curriculum' && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                <h2 className="font-semibold text-gray-800 mb-3">📖 주제 선택</h2>
                <select
                  value={selectedTopicId}
                  onChange={(e) => setSelectedTopicId(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                >
                  <option value="">선택해주세요</option>
                  {Object.values(groupedTopics).map(group => (
                    <optgroup key={`${group.year}-${group.month}`} label={`${group.year}년 ${group.month}월`}>
                      {group.topics.map(topic => (
                        <option key={topic.id} value={topic.id}>
                          {topic.title} ({topic.materials?.join(', ') || ''}) [{topic.age_group === 'kindergarten' ? '유치' : '초등'}]
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            )}

            {/* 자율 입력 */}
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

            {/* 진행 상태 */}
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

            {/* 한줄 메모 */}
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

            {/* 생성 버튼 */}
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
    </div>
  )
}