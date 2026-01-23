'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Curriculum {
  id: string
  year: number
  month: number
  week: number
  target_group: string
  title: string
  thumbnail_url: string
  status: string
}

interface GroupedCurriculum {
  label: string
  year: number
  month: number
  week: number
  items: Curriculum[]
}

export default function AdminCurriculumPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [curriculums, setCurriculums] = useState<Curriculum[]>([])
  const [groupedData, setGroupedData] = useState<GroupedCurriculum[]>([])
  const [selectedYear, setSelectedYear] = useState<number>(2026)
  const [deleting, setDeleting] = useState<string | null>(null)

  // 연도 목록 (동적으로 생성)
  const years = [2024, 2025, 2026]

  useEffect(() => {
    checkAuthAndLoad()
  }, [])

  useEffect(() => {
    if (curriculums.length > 0) {
      groupByWeek()
    } else {
      setGroupedData([])
    }
  }, [curriculums, selectedYear])

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

    await loadCurriculums()
  }

  async function loadCurriculums() {
    setLoading(true)

    const { data, error } = await supabase
      .from('monthly_curriculum')
      .select('id, year, month, week, target_group, title, thumbnail_url, status')
      .order('year', { ascending: false })
      .order('month', { ascending: false })
      .order('week', { ascending: true })
      .order('target_group', { ascending: true })

    if (error) {
      console.error('Load error:', error)
      setLoading(false)
      return
    }

    setCurriculums(data || [])
    setLoading(false)
  }

  function groupByWeek() {
    // 선택된 연도로 필터
    const filtered = curriculums.filter(c => c.year === selectedYear)

    // 그룹핑
    const groups: { [key: string]: GroupedCurriculum } = {}

    filtered.forEach(item => {
      const key = `${item.year}-${item.month}-${item.week}`
      if (!groups[key]) {
        groups[key] = {
          label: `${item.month}월 ${item.week}주차`,
          year: item.year,
          month: item.month,
          week: item.week,
          items: []
        }
      }
      groups[key].items.push(item)
    })

    // 정렬: 월 내림차순 → 주차 오름차순
    const sorted = Object.values(groups).sort((a, b) => {
      if (a.month !== b.month) return b.month - a.month
      return a.week - b.week
    })

    setGroupedData(sorted)
  }

  async function handleStatusChange(id: string, newStatus: string) {
    const { error } = await supabase
      .from('monthly_curriculum')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) {
      alert('상태 변경에 실패했습니다.')
      return
    }

    // 로컬 상태 업데이트
    setCurriculums(prev => prev.map(c => 
      c.id === id ? { ...c, status: newStatus } : c
    ))
  }

  async function handleDelete(id: string, title: string) {
    if (!confirm(`"${title}"을(를) 삭제하시겠습니까?`)) {
      return
    }

    setDeleting(id)

    try {
      const { error } = await supabase
        .from('monthly_curriculum')
        .delete()
        .eq('id', id)

      if (error) {
        console.error('Delete error:', error)
        alert('삭제에 실패했습니다: ' + error.message)
        return
      }

      setCurriculums(prev => prev.filter(c => c.id !== id))
      alert('삭제되었습니다.')

    } catch (err) {
      console.error('Delete error:', err)
      alert('삭제에 실패했습니다.')
    } finally {
      setDeleting(null)
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
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-40 border-b border-gray-200/50">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <button onClick={() => router.back()} className="text-gray-600">
              ← 뒤로
            </button>
            <h1 className="text-lg font-bold text-gray-800">콘텐츠 관리</h1>
            <button
              onClick={() => router.push('/admin/curriculum/new')}
              className="px-4 py-2 bg-teal-500 text-white rounded-xl text-sm font-medium"
            >
              + 등록
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* 연도 탭 */}
        <div className="flex justify-center gap-2 mb-6">
          {years.map(year => (
            <button
              key={year}
              onClick={() => setSelectedYear(year)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                selectedYear === year
                  ? 'bg-teal-500 text-white'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {year}년
            </button>
          ))}
        </div>

        {/* 콘텐츠 목록 */}
        {groupedData.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
            <p className="text-gray-400">{selectedYear}년 등록된 커리큘럼이 없습니다.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {groupedData.map(group => (
              <div key={`${group.year}-${group.month}-${group.week}`} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {/* 주차 헤더 */}
                <div className="bg-teal-50 px-4 py-3 border-b border-teal-100">
                  <span className="text-sm font-bold text-teal-700">
                    📅 {group.month}월 {group.week}주차
                  </span>
                  <span className="text-xs text-teal-500 ml-2">
                    ({group.items.length}개)
                  </span>
                </div>

                {/* 해당 주차 콘텐츠 */}
                <div className="divide-y divide-gray-100">
                  {group.items.map(item => (
                    <div key={item.id} className="px-4 py-3 flex items-center gap-4">
                      {/* 대상 배지 */}
                      <span className={`px-2 py-1 text-xs font-medium rounded-lg shrink-0 ${
                        item.target_group === '유치부' 
                          ? 'bg-pink-100 text-pink-700' 
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        {item.target_group}
                      </span>

                      {/* 제목 */}
                      <div 
                        className="flex-1 cursor-pointer hover:text-teal-600"
                        onClick={() => router.push(`/curriculum/${item.id}`)}
                      >
                        <span className="font-medium text-gray-800">{item.title}</span>
                      </div>

                      {/* 상태 드롭다운 */}
                      <select
                        value={item.status}
                        onChange={(e) => handleStatusChange(item.id, e.target.value)}
                        className={`px-2 py-1 text-xs rounded-lg border ${
                          item.status === 'active' 
                            ? 'bg-green-50 text-green-700 border-green-200'
                            : 'bg-yellow-50 text-yellow-700 border-yellow-200'
                        }`}
                      >
                        <option value="active">활성</option>
                        <option value="draft">임시저장</option>
                      </select>

                      {/* 수정 버튼 */}
                      <button
                        onClick={() => router.push(`/admin/curriculum/${item.id}/edit`)}
                        className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs hover:bg-gray-200"
                      >
                        수정
                      </button>

                      {/* 삭제 버튼 */}
                      <button
                        onClick={() => handleDelete(item.id, item.title)}
                        disabled={deleting === item.id}
                        className="px-3 py-1.5 bg-red-50 text-red-500 rounded-lg text-xs hover:bg-red-100 disabled:opacity-50"
                      >
                        {deleting === item.id ? '...' : '삭제'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
