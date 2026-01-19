'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Curriculum {
  id: string
  year: number
  month: number
  target_group: string
  title: string
  thumbnail_url: string | null
  status: string
  created_at: string
}

export default function AdminCurriculumPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [curriculums, setCurriculums] = useState<Curriculum[]>([])
  const [filterYear, setFilterYear] = useState(new Date().getFullYear())

  useEffect(() => {
    checkAuthAndLoad()
  }, [filterYear])

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

    const { data, error } = await supabase
      .from('monthly_curriculum')
      .select('*')
      .eq('year', filterYear)
      .order('month', { ascending: true })
      .order('target_group', { ascending: true })

    if (!error && data) {
      setCurriculums(data)
    }

    setLoading(false)
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">활성</span>
      case 'archived':
        return <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">아카이브</span>
      case 'draft':
        return <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded text-xs">임시저장</span>
      default:
        return null
    }
  }

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`"${title}" 콘텐츠를 삭제하시겠습니까?`)) return

    const { error } = await supabase
      .from('monthly_curriculum')
      .delete()
      .eq('id', id)

    if (error) {
      alert('삭제에 실패했습니다.')
    } else {
      setCurriculums(prev => prev.filter(c => c.id !== id))
    }
  }

  const handleStatusChange = async (id: string, newStatus: string) => {
    const { error } = await supabase
      .from('monthly_curriculum')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) {
      alert('상태 변경에 실패했습니다.')
    } else {
      setCurriculums(prev => prev.map(c => 
        c.id === id ? { ...c, status: newStatus } : c
      ))
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
      <header className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-40 border-b border-gray-200/50">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <button onClick={() => router.push('/curriculum')} className="text-gray-600">
              ← 뒤로
            </button>
            <h1 className="text-lg font-bold text-gray-800">콘텐츠 관리</h1>
            <button
              onClick={() => router.push('/admin/curriculum/new')}
              className="px-3 py-1.5 bg-teal-500 text-white rounded-lg text-sm font-medium"
            >
              + 등록
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* 연도 필터 */}
        <div className="flex gap-2 mb-6">
          {[2024, 2025, 2026].map((year) => (
            <button
              key={year}
              onClick={() => setFilterYear(year)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
                filterYear === year
                  ? 'bg-teal-500 text-white'
                  : 'bg-white text-gray-600 border border-gray-200'
              }`}
            >
              {year}년
            </button>
          ))}
        </div>

        {/* 콘텐츠 목록 */}
        <div className="space-y-3">
          {curriculums.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <p className="text-4xl mb-3">📚</p>
              <p>{filterYear}년 콘텐츠가 없습니다</p>
              <button
                onClick={() => router.push('/admin/curriculum/new')}
                className="mt-4 px-4 py-2 bg-teal-500 text-white rounded-xl text-sm"
              >
                첫 콘텐츠 등록하기
              </button>
            </div>
          ) : (
            curriculums.map((curriculum) => (
              <div
                key={curriculum.id}
                className="bg-white rounded-xl shadow-sm border border-gray-100 p-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-teal-100 rounded-xl flex items-center justify-center">
                      <span className="text-lg font-bold text-teal-600">{curriculum.month}월</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-gray-900">{curriculum.title}</span>
                        {getStatusBadge(curriculum.status)}
                      </div>
                      <p className="text-sm text-gray-500">{curriculum.target_group}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={curriculum.status}
                      onChange={(e) => handleStatusChange(curriculum.id, e.target.value)}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1"
                    >
                      <option value="draft">임시저장</option>
                      <option value="active">활성</option>
                      <option value="archived">아카이브</option>
                    </select>
                    <button
                      onClick={() => router.push(`/admin/curriculum/${curriculum.id}`)}
                      className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200"
                    >
                      수정
                    </button>
                    <button
                      onClick={() => handleDelete(curriculum.id, curriculum.title)}
                      className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-sm hover:bg-red-100"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
