'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface CurriculumTopic {
  id: string
  year: number
  month: number
  age_group: 'kindergarten' | 'elementary'
  title: string
  materials: string[]
  parent_message_template: string
  created_at: string
}

const MATERIAL_OPTIONS = [
  '연필', '색연필', '매직', '사인펜',
  '수채화', '아크릴', '파스텔', '점토',
  '크레파스', '오일파스텔', '콘테', '목탄',
  '스티커', '기타'
]

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

export default function CurriculumManagePage() {
  const router = useRouter()
  
  const [topics, setTopics] = useState<CurriculumTopic[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  
  const [filterYear, setFilterYear] = useState<number>(new Date().getFullYear())
  const [filterMonth, setFilterMonth] = useState<number | 'all'>('all')
  const [filterAgeGroup, setFilterAgeGroup] = useState<'all' | 'kindergarten' | 'elementary'>('all')
  
  const [showModal, setShowModal] = useState(false)
  const [editingTopic, setEditingTopic] = useState<CurriculumTopic | null>(null)
  
  const [formData, setFormData] = useState({
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    age_group: 'kindergarten' as 'kindergarten' | 'elementary',
    title: '',
    materials: [] as string[],
    parent_message_template: ''
  })

  useEffect(() => {
    checkAdminAndLoad()
  }, [])

  async function checkAdminAndLoad() {
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

    if (profile?.role !== 'admin') {
      alert('관리자만 접근할 수 있습니다.')
      router.push('/dashboard')
      return
    }

    await loadTopics()
  }

  async function loadTopics() {
    setLoading(true)
    
    const { data, error } = await supabase
      .from('curriculum_topics')
      .select('*')
      .order('year', { ascending: false })
      .order('month', { ascending: false })
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Load error:', error)
    } else {
      setTopics(data || [])
    }
    
    setLoading(false)
  }

  const filteredTopics = topics.filter(topic => {
    if (topic.year !== filterYear) return false
    if (filterMonth !== 'all' && topic.month !== filterMonth) return false
    if (filterAgeGroup !== 'all' && topic.age_group !== filterAgeGroup) return false
    return true
  })

  const groupedTopics = filteredTopics.reduce((acc, topic) => {
    const key = `${topic.year}-${topic.month}`
    if (!acc[key]) {
      acc[key] = { year: topic.year, month: topic.month, topics: [] }
    }
    acc[key].topics.push(topic)
    return acc
  }, {} as { [key: string]: { year: number, month: number, topics: CurriculumTopic[] } })

  const openAddModal = () => {
    setEditingTopic(null)
    setFormData({
      year: filterYear,
      month: filterMonth === 'all' ? new Date().getMonth() + 1 : filterMonth,
      age_group: filterAgeGroup === 'all' ? 'kindergarten' : filterAgeGroup,
      title: '',
      materials: [],
      parent_message_template: ''
    })
    setShowModal(true)
  }

  const openEditModal = (topic: CurriculumTopic) => {
    setEditingTopic(topic)
    setFormData({
      year: topic.year,
      month: topic.month,
      age_group: topic.age_group,
      title: topic.title,
      materials: topic.materials || [],
      parent_message_template: topic.parent_message_template || ''
    })
    setShowModal(true)
  }

  const toggleMaterial = (material: string) => {
    setFormData(prev => ({
      ...prev,
      materials: prev.materials.includes(material)
        ? prev.materials.filter(m => m !== material)
        : [...prev.materials, material]
    }))
  }

  const handleSave = async () => {
    if (!formData.title.trim()) {
      alert('주제명을 입력해주세요')
      return
    }

    setSaving(true)

    try {
      if (editingTopic) {
        const { error } = await supabase
          .from('curriculum_topics')
          .update({
            year: formData.year,
            month: formData.month,
            age_group: formData.age_group,
            title: formData.title,
            materials: formData.materials,
            parent_message_template: formData.parent_message_template
          })
          .eq('id', editingTopic.id)

        if (error) throw error
      } else {
        const { error } = await supabase
          .from('curriculum_topics')
          .insert({
            year: formData.year,
            month: formData.month,
            age_group: formData.age_group,
            title: formData.title,
            materials: formData.materials,
            parent_message_template: formData.parent_message_template
          })

        if (error) throw error
      }

      setShowModal(false)
      await loadTopics()
    } catch (error) {
      console.error('Save error:', error)
      alert('저장에 실패했습니다')
    }

    setSaving(false)
  }

  const handleDelete = async (topicId: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return

    try {
      const { error } = await supabase
        .from('curriculum_topics')
        .delete()
        .eq('id', topicId)

      if (error) throw error
      
      await loadTopics()
    } catch (error) {
      console.error('Delete error:', error)
      alert('삭제에 실패했습니다')
    }
  }

  const duplicateTopic = async (topic: CurriculumTopic) => {
    try {
      const { error } = await supabase
        .from('curriculum_topics')
        .insert({
          year: topic.year,
          month: topic.month,
          age_group: topic.age_group,
          title: topic.title + ' (복사)',
          materials: topic.materials,
          parent_message_template: topic.parent_message_template
        })

      if (error) throw error
      
      await loadTopics()
    } catch (error) {
      console.error('Duplicate error:', error)
      alert('복사에 실패했습니다')
    }
  }

  const currentYear = new Date().getFullYear()
  const years = [currentYear - 1, currentYear, currentYear + 1]

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
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <button onClick={() => router.push('/dashboard')} className="text-gray-500 hover:text-gray-700">
              ← 대시보드
            </button>
            <h1 className="text-lg font-bold text-gray-800">커리큘럼 관리</h1>
            <button
              onClick={openAddModal}
              className="bg-teal-500 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-teal-600 transition"
            >
              + 추가
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-4">
        {/* 필터 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-4">
          <div className="flex flex-wrap gap-3">
            <select
              value={filterYear}
              onChange={(e) => setFilterYear(Number(e.target.value))}
              className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm"
            >
              {years.map(year => (
                <option key={year} value={year}>{year}년</option>
              ))}
            </select>
            
            <select
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm"
            >
              <option value="all">전체 월</option>
              {MONTHS.map(month => (
                <option key={month} value={month}>{month}월</option>
              ))}
            </select>
            
            <select
              value={filterAgeGroup}
              onChange={(e) => setFilterAgeGroup(e.target.value as 'all' | 'kindergarten' | 'elementary')}
              className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm"
            >
              <option value="all">전체 연령</option>
              <option value="kindergarten">유치부</option>
              <option value="elementary">초등부</option>
            </select>

            <div className="ml-auto text-sm text-gray-500">
              총 {filteredTopics.length}개
            </div>
          </div>
        </div>

        {/* 목록 */}
        {Object.keys(groupedTopics).length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">📚</span>
            </div>
            <p className="text-gray-500 mb-4">등록된 커리큘럼이 없습니다</p>
            <button
              onClick={openAddModal}
              className="text-teal-500 hover:underline"
            >
              첫 커리큘럼 추가하기
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.values(groupedTopics).map(group => (
              <div key={`${group.year}-${group.month}`} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                  <h2 className="font-semibold text-gray-800">
                    {group.year}년 {group.month}월
                    <span className="text-gray-400 font-normal text-sm ml-2">({group.topics.length}개)</span>
                  </h2>
                </div>
                
                <div className="divide-y divide-gray-100">
                  {group.topics.map(topic => (
                    <div key={topic.id} className="p-4 hover:bg-gray-50 transition">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              topic.age_group === 'kindergarten' 
                                ? 'bg-pink-100 text-pink-700' 
                                : 'bg-blue-100 text-blue-700'
                            }`}>
                              {topic.age_group === 'kindergarten' ? '유치부' : '초등부'}
                            </span>
                          </div>
                          
                          <h3 className="font-medium text-gray-800 mb-1">{topic.title}</h3>
                          
                          {topic.materials && topic.materials.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-2">
                              {topic.materials.map(material => (
                                <span key={material} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                                  {material}
                                </span>
                              ))}
                            </div>
                          )}
                          
                          {topic.parent_message_template ? (
                            <p className="text-sm text-gray-500 line-clamp-2">
                              📝 {topic.parent_message_template}
                            </p>
                          ) : (
                            <p className="text-sm text-orange-500">
                              ⚠️ 템플릿 미등록
                            </p>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openEditModal(topic)}
                            className="px-3 py-1.5 text-sm text-teal-600 hover:bg-teal-50 rounded-lg transition"
                          >
                            수정
                          </button>
                          <button
                            onClick={() => duplicateTopic(topic)}
                            className="px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 rounded-lg transition"
                          >
                            복사
                          </button>
                          <button
                            onClick={() => handleDelete(topic.id)}
                            className="px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 rounded-lg transition"
                          >
                            삭제
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 추가/수정 모달 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-800">
                {editingTopic ? '커리큘럼 수정' : '커리큘럼 추가'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              {/* 연도/월 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">연도</label>
                  <select
                    value={formData.year}
                    onChange={(e) => setFormData({ ...formData, year: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm"
                  >
                    {years.map(year => (
                      <option key={year} value={year}>{year}년</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">월</label>
                  <select
                    value={formData.month}
                    onChange={(e) => setFormData({ ...formData, month: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm"
                  >
                    {MONTHS.map(month => (
                      <option key={month} value={month}>{month}월</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 연령대 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">연령대</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, age_group: 'kindergarten' })}
                    className={`py-2.5 rounded-xl text-sm font-medium transition ${
                      formData.age_group === 'kindergarten'
                        ? 'bg-pink-500 text-white'
                        : 'bg-gray-50 text-gray-600 border border-gray-200'
                    }`}
                  >
                    유치부
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, age_group: 'elementary' })}
                    className={`py-2.5 rounded-xl text-sm font-medium transition ${
                      formData.age_group === 'elementary'
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-50 text-gray-600 border border-gray-200'
                    }`}
                  >
                    초등부
                  </button>
                </div>
              </div>

              {/* 주제명 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">주제명 *</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="예: 겨울 나무 수채화"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              </div>

              {/* 재료 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">재료 (복수 선택)</label>
                <div className="flex flex-wrap gap-2">
                  {MATERIAL_OPTIONS.map(material => (
                    <button
                      key={material}
                      type="button"
                      onClick={() => toggleMaterial(material)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                        formData.materials.includes(material)
                          ? 'bg-teal-500 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {material}
                    </button>
                  ))}
                </div>
              </div>

              {/* 학부모 메시지 템플릿 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  학부모 메시지 템플릿
                  <span className="text-gray-400 font-normal ml-1">(AI가 참고하는 예시 문구)</span>
                </label>
                <textarea
                  value={formData.parent_message_template}
                  onChange={(e) => setFormData({ ...formData, parent_message_template: e.target.value })}
                  placeholder="예: 오늘 ○○이는 수채화로 겨울 나무를 표현해보았어요. 물의 양을 조절하며 연한 색과 진한 색의 차이를 만들어보았답니다..."
                  rows={5}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
                />
                <p className="text-xs text-gray-400 mt-1">
                  ○○ 부분은 AI가 학생 이름으로 자동 변환합니다
                </p>
              </div>
            </div>

            <div className="sticky bottom-0 bg-white px-6 py-4 border-t border-gray-100 flex gap-2">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-3 rounded-xl text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-3 rounded-xl text-sm font-medium bg-teal-500 text-white hover:bg-teal-600 transition disabled:opacity-50"
              >
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}