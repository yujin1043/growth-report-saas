'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useUserContext } from '@/lib/UserContext'

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

interface WeekGroup {
  week: number
  items: Curriculum[]
}

interface MonthGroup {
  month: number
  weeks: WeekGroup[]
}

export default function AdminCurriculumPage() {
  const router = useRouter()
  const { userRole, isLoading: userLoading } = useUserContext()
  
  const [loading, setLoading] = useState(true)
  const [curriculums, setCurriculums] = useState<Curriculum[]>([])
  const [groupedData, setGroupedData] = useState<MonthGroup[]>([])
  const [selectedYear, setSelectedYear] = useState<number>(2026)
  const [selectedMonth, setSelectedMonth] = useState<number | 'all'>('all')
  const [deleting, setDeleting] = useState<string | null>(null)
  const [expandedMonths, setExpandedMonths] = useState<number[]>([])

  const years = [2024, 2025, 2026]
  const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

  // 권한 체크: admin만 접근 가능
  useEffect(() => {
    if (!userLoading && userRole !== 'admin') {
      alert('관리자 권한이 필요합니다.')
      router.push('/dashboard')
    }
  }, [userLoading, userRole, router])

  useEffect(() => {
    if (!userLoading && userRole === 'admin') {
      loadCurriculums()
    }
  }, [userLoading, userRole])

  useEffect(() => {
    if (curriculums.length > 0) {
      groupByMonthAndWeek()
    } else {
      setGroupedData([])
    }
  }, [curriculums, selectedYear, selectedMonth])

  // 연도 변경시 전체 월 펼치기
  useEffect(() => {
    if (selectedMonth === 'all') {
      // 데이터가 있는 월만 펼치기
      const monthsWithData = groupedData.map(g => g.month)
      setExpandedMonths(monthsWithData)
    } else {
      setExpandedMonths([selectedMonth as number])
    }
  }, [groupedData, selectedMonth])

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

  function groupByMonthAndWeek() {
    // 연도 필터
    let filtered = curriculums.filter(c => c.year === selectedYear)
    
    // 월 필터
    if (selectedMonth !== 'all') {
      filtered = filtered.filter(c => c.month === selectedMonth)
    }

    // 월별 그룹핑
    const monthGroups: { [key: number]: MonthGroup } = {}

    filtered.forEach(item => {
      // 월 그룹 초기화
      if (!monthGroups[item.month]) {
        monthGroups[item.month] = {
          month: item.month,
          weeks: []
        }
      }

      // 해당 월에서 주차 찾기
      let weekGroup = monthGroups[item.month].weeks.find(w => w.week === item.week)
      if (!weekGroup) {
        weekGroup = { week: item.week, items: [] }
        monthGroups[item.month].weeks.push(weekGroup)
      }

      weekGroup.items.push(item)
    })

    // 각 월의 주차 정렬
    Object.values(monthGroups).forEach(monthGroup => {
      monthGroup.weeks.sort((a, b) => a.week - b.week)
    })

    // 월 정렬 (내림차순 - 최신 월이 위로)
    const sorted = Object.values(monthGroups).sort((a, b) => b.month - a.month)

    setGroupedData(sorted)
  }

  function toggleMonth(month: number) {
    setExpandedMonths(prev => 
      prev.includes(month) 
        ? prev.filter(m => m !== month)
        : [...prev, month]
    )
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

  // 총 콘텐츠 수 계산
  function getTotalCount() {
    return groupedData.reduce((total, month) => 
      total + month.weeks.reduce((weekTotal, week) => weekTotal + week.items.length, 0)
    , 0)
  }

  // admin 아니면 로딩 표시 (리다이렉트 전)
  if (userLoading || userRole !== 'admin') {
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
        {/* 필터 영역 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-6">
          <div className="flex flex-wrap items-center gap-4">
            {/* 연도 선택 */}
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600 font-medium">연도</label>
              <select
                value={selectedYear}
                onChange={(e) => {
                  setSelectedYear(Number(e.target.value))
                  setSelectedMonth('all')
                }}
                className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                {years.map(year => (
                  <option key={year} value={year}>{year}년</option>
                ))}
              </select>
            </div>

            {/* 월 선택 */}
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600 font-medium">월</label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="all">전체</option>
                {months.map(month => (
                  <option key={month} value={month}>{month}월</option>
                ))}
              </select>
            </div>

            {/* 콘텐츠 수 */}
            <div className="ml-auto text-sm text-gray-500">
              총 <span className="font-bold text-teal-600">{getTotalCount()}</span>개
            </div>
          </div>
        </div>

        {/* 콘텐츠 목록 */}
        {groupedData.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
            <p className="text-gray-400">
              {selectedYear}년 {selectedMonth !== 'all' ? `${selectedMonth}월` : ''} 등록된 커리큘럼이 없습니다.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {groupedData.map(monthGroup => (
              <div key={monthGroup.month} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {/* 월 헤더 (접기/펼치기) */}
                <button
                  onClick={() => toggleMonth(monthGroup.month)}
                  className="w-full px-5 py-4 bg-gradient-to-r from-teal-500 to-teal-600 text-white flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">📅</span>
                    <span className="text-lg font-bold">{monthGroup.month}월</span>
                    <span className="text-sm opacity-80">
                      ({monthGroup.weeks.reduce((sum, w) => sum + w.items.length, 0)}개)
                    </span>
                  </div>
                  <span className="text-xl">
                    {expandedMonths.includes(monthGroup.month) ? '▼' : '▶'}
                  </span>
                </button>

                {/* 월 콘텐츠 (펼쳐진 경우만) */}
                {expandedMonths.includes(monthGroup.month) && (
                  <div className="p-4 space-y-4">
                    {monthGroup.weeks.map(weekGroup => (
                      <div key={weekGroup.week} className="border border-gray-100 rounded-xl overflow-hidden">
                        {/* 주차 헤더 */}
                        <div className="bg-gray-50 px-4 py-2 border-b border-gray-100">
                          <span className="text-sm font-bold text-gray-700">
                            {weekGroup.week}주차
                          </span>
                          <span className="text-xs text-gray-400 ml-2">
                            ({weekGroup.items.length}개)
                          </span>
                        </div>

                        {/* 주차 콘텐츠 */}
                        <div className="divide-y divide-gray-50">
                          {weekGroup.items.map(item => (
                            <div key={item.id} className="px-4 py-3 flex items-center gap-3 hover:bg-gray-50">
                              {/* 썸네일 */}
                              <div 
                                className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 shrink-0 cursor-pointer"
                                onClick={() => router.push(`/curriculum/${item.id}`)}
                              >
                                {item.thumbnail_url ? (
                                  <img
                                    src={item.thumbnail_url}
                                    alt={item.title}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-gray-300 text-lg">
                                    🖼️
                                  </div>
                                )}
                              </div>

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
                                className="flex-1 cursor-pointer hover:text-teal-600 min-w-0"
                                onClick={() => router.push(`/curriculum/${item.id}`)}
                              >
                                <span className="font-medium text-gray-800 truncate block">{item.title}</span>
                              </div>

                              {/* 상태 드롭다운 */}
                              <select
                                value={item.status}
                                onChange={(e) => handleStatusChange(item.id, e.target.value)}
                                className={`px-2 py-1 text-xs rounded-lg border shrink-0 ${
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
                                className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs hover:bg-gray-200 shrink-0"
                              >
                                수정
                              </button>

                              {/* 삭제 버튼 */}
                              <button
                                onClick={() => handleDelete(item.id, item.title)}
                                disabled={deleting === item.id}
                                className="px-3 py-1.5 bg-red-50 text-red-500 rounded-lg text-xs hover:bg-red-100 disabled:opacity-50 shrink-0"
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
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
