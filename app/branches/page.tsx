'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface BranchWithStats {
  id: string
  name: string
  address: string | null
  phone: string | null
  class_count: number
  active_count: number
  message_rate: number
  report_rate: number
  status: 'green' | 'yellow' | 'red'
  status_reason: string
}

export default function BranchesPage() {
  const router = useRouter()
  const [branches, setBranches] = useState<BranchWithStats[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState<'status' | 'messageRate' | 'reportRate' | 'name'>('status')

  // 새 지점 추가 모달
  const [showAddModal, setShowAddModal] = useState(false)
  const [addForm, setAddForm] = useState({ name: '', address: '', phone: '', class_count: 1 })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  function getStatusFromRates(messageRate: number, reportRate: number): { status: 'green' | 'yellow' | 'red'; reason: string } {
    if (messageRate < 50 || reportRate < 50) {
      const reasons: string[] = []
      if (messageRate < 50) reasons.push('메시지')
      if (reportRate < 50) reasons.push('리포트')
      return { status: 'red', reason: `${reasons.join('·')} 부족` }
    }
    if (messageRate < 80 || reportRate < 80) {
      if (messageRate < 80 && reportRate < 80) return { status: 'yellow', reason: '메시지·리포트 저조' }
      if (messageRate < 80) return { status: 'yellow', reason: '메시지 작성률 저조' }
      return { status: 'yellow', reason: '리포트 작성률 저조' }
    }
    return { status: 'green', reason: '정상' }
  }

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'admin') {
      router.push('/dashboard')
      return
    }

    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, now.getDate())

    // 이번 달의 수업일 수 계산 (월~금)
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    let businessDaysSoFar = 0
    for (let d = 1; d <= Math.min(now.getDate(), daysInMonth); d++) {
      const day = new Date(now.getFullYear(), now.getMonth(), d).getDay()
      if (day !== 0 && day !== 6) businessDaysSoFar++
    }

    const [branchesResult, studentsResult, messagesResult, reportsResult] = await Promise.all([
      supabase.from('branches').select('*').order('name'),
      supabase.from('students').select('id, branch_id, status, last_report_at'),
      supabase.from('daily_messages').select('id, branch_id, created_at').gte('created_at', startOfMonth.toISOString()),
      supabase.from('reports').select('id, branch_id, created_at')
    ])

    const branchesData = branchesResult.data || []
    const students = studentsResult.data || []
    const messages = messagesResult.data || []
    const reports = reportsResult.data || []

    const stats: BranchWithStats[] = branchesData.map(branch => {
      const activeStudents = students.filter(s => s.branch_id === branch.id && s.status === 'active')
      const activeCount = activeStudents.length

      // 메시지 작성률: 이번 달 작성일 수 / 수업일 수
      const branchMessageDates = new Set(
        messages
          .filter(m => m.branch_id === branch.id)
          .map(m => new Date(m.created_at).toDateString())
      )
      const messageRate = businessDaysSoFar > 0
        ? Math.round((branchMessageDates.size / businessDaysSoFar) * 100)
        : 0

      // 리포트 작성률: 최근 2개월 내 리포트가 있는 학생 비율
      const studentsWithReport = activeStudents.filter(s => {
        if (!s.last_report_at) return false
        return new Date(s.last_report_at) >= twoMonthsAgo
      }).length
      const reportRate = activeCount > 0
        ? Math.round((studentsWithReport / activeCount) * 100)
        : 0

      const statusInfo = getStatusFromRates(messageRate, reportRate)

      return {
        ...branch,
        active_count: activeCount,
        message_rate: messageRate,
        report_rate: reportRate,
        status: statusInfo.status,
        status_reason: statusInfo.reason
      }
    })

    setBranches(stats)
    setLoading(false)
  }

  async function handleAddBranch() {
    if (!addForm.name.trim()) {
      alert('지점명을 입력해주세요.')
      return
    }
    setSaving(true)

    try {
      const { data: newBranch, error } = await supabase
        .from('branches')
        .insert({
          name: addForm.name,
          address: addForm.address || null,
          phone: addForm.phone || null,
          class_count: addForm.class_count
        })
        .select()
        .single()

      if (error) {
        alert('지점 추가 실패: ' + error.message)
        setSaving(false)
        return
      }

      // 반 자동 생성
      const classInserts = Array.from({ length: addForm.class_count }, (_, i) => {
        const className = `${String(i + 1).padStart(2, '0')}반`
        const classCode = `${addForm.name}_${className}`.replace(/\s/g, '')
        return { name: className, code: classCode, branch_id: newBranch.id }
      })

      await supabase.from('classes').insert(classInserts)

      alert('지점이 추가되었습니다!')
      setShowAddModal(false)
      setAddForm({ name: '', address: '', phone: '', class_count: 1 })
      loadData()
    } catch (error) {
      alert('오류가 발생했습니다.')
    }
    setSaving(false)
  }

  const filteredBranches = branches.filter(branch =>
    branch.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (branch.address && branch.address.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  const sortedBranches = [...filteredBranches].sort((a, b) => {
    if (sortBy === 'status') {
      const order = { red: 0, yellow: 1, green: 2 }
      return order[a.status] - order[b.status]
    }
    if (sortBy === 'messageRate') return a.message_rate - b.message_rate
    if (sortBy === 'reportRate') return a.report_rate - b.report_rate
    return a.name.localeCompare(b.name)
  })

  const greenCount = branches.filter(b => b.status === 'green').length
  const yellowCount = branches.filter(b => b.status === 'yellow').length
  const redCount = branches.filter(b => b.status === 'red').length
  const totalStudents = branches.reduce((sum, b) => sum + b.active_count, 0)

  const getRateColor = (rate: number) => {
    if (rate >= 80) return 'text-emerald-600'
    if (rate >= 50) return 'text-amber-600'
    return 'text-red-600'
  }

  const getStatusDotColor = (status: string) => {
    switch (status) {
      case 'green': return 'bg-emerald-500'
      case 'yellow': return 'bg-amber-500'
      case 'red': return 'bg-red-500'
      default: return 'bg-gray-400'
    }
  }

  const getStatusBadgeStyle = (status: string) => {
    switch (status) {
      case 'green': return 'bg-emerald-50 border-emerald-200 text-emerald-700'
      case 'yellow': return 'bg-amber-50 border-amber-200 text-amber-700'
      case 'red': return 'bg-red-50 border-red-200 text-red-700'
      default: return 'bg-gray-50 border-gray-200 text-gray-700'
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-500 mx-auto mb-4"></div>
          <p className="text-slate-500">로딩 중...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <header className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-40 border-b border-gray-200/50">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-center min-h-[40px]">
            <h1 className="text-lg font-bold text-gray-800">🏢 지점 관리</h1>
          </div>
        </div>
      </header>
      <div className="max-w-5xl mx-auto px-4 py-6">

        {/* 요약 카드 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-5">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 md:p-5 text-center">
            <p className="text-slate-500 text-xs md:text-sm font-medium mb-1">전체 지점</p>
            <p className="text-2xl md:text-3xl font-bold text-slate-800">{branches.length}<span className="text-sm font-normal text-slate-400 ml-0.5">개</span></p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-4 md:p-5 text-center">
            <p className="text-slate-500 text-xs md:text-sm font-medium mb-1">총 원생</p>
            <p className="text-2xl md:text-3xl font-bold text-slate-800">{totalStudents}<span className="text-sm font-normal text-slate-400 ml-0.5">명</span></p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-4 md:p-5 text-center">
            <p className="text-slate-500 text-xs md:text-sm font-medium mb-2">상태 요약</p>
            <div className="flex items-center justify-center gap-3">
              <span className="flex items-center gap-1.5 text-sm font-medium"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>{greenCount}</span>
              <span className="flex items-center gap-1.5 text-sm font-medium"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span>{yellowCount}</span>
              <span className="flex items-center gap-1.5 text-sm font-medium"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block"></span>{redCount}</span>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-4 md:p-5 text-center flex items-center justify-center">
            <button
              onClick={() => setShowAddModal(true)}
              className="text-teal-600 font-semibold text-sm md:text-base hover:text-teal-700 transition"
            >
              + 새 지점 추가
            </button>
          </div>
        </div>

        {/* 상태 판정 기준 */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 md:p-5 mb-5">
          <p className="text-sm font-bold text-slate-600 mb-3">📐 상태 판정 기준</p>
          <div className="grid grid-cols-3 gap-4">
            <div className="flex items-start gap-2">
              <span className="w-3 h-3 rounded-full bg-emerald-500 mt-0.5 shrink-0"></span>
              <div>
                <p className="text-sm font-medium text-slate-700">양호</p>
                <p className="text-xs md:text-sm text-slate-400">메시지 ≥80% AND 리포트 ≥80%</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="w-3 h-3 rounded-full bg-amber-500 mt-0.5 shrink-0"></span>
              <div>
                <p className="text-sm font-medium text-slate-700">유의</p>
                <p className="text-xs md:text-sm text-slate-400">메시지 또는 리포트 50~79%</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="w-3 h-3 rounded-full bg-red-500 mt-0.5 shrink-0"></span>
              <div>
                <p className="text-sm font-medium text-slate-700">관리 필요</p>
                <p className="text-xs md:text-sm text-slate-400">메시지 또는 리포트 50% 미만</p>
              </div>
            </div>
          </div>
        </div>

        {/* 검색 & 정렬 */}
        <div className="flex flex-col md:flex-row gap-3 mb-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="🔍 지점명 검색"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm md:text-base focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>
          <div className="flex gap-2">
            {[
              { key: 'status' as const, label: '상태순' },
              { key: 'messageRate' as const, label: '메시지율순' },
              { key: 'reportRate' as const, label: '리포트율순' },
              { key: 'name' as const, label: '이름순' },
            ].map(opt => (
              <button
                key={opt.key}
                onClick={() => setSortBy(opt.key)}
                className={`px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
                  sortBy === opt.key
                    ? 'bg-slate-800 text-white'
                    : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* 지점 카드 - 수치만 */}
        <div className="space-y-3">
          {sortedBranches.map(branch => (
            <div
              key={branch.id}
              onClick={() => router.push(`/branches/${branch.id}`)}
              className="bg-white rounded-2xl border border-slate-200 hover:shadow-md hover:border-teal-200 cursor-pointer transition-all duration-200 p-4 md:p-5"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-3 h-3 rounded-full shrink-0 ${getStatusDotColor(branch.status)}`}></span>
                  <h3 className="font-bold text-slate-800 text-sm md:text-lg truncate">{branch.name}</h3>
                </div>
                <div className="flex items-center gap-3 md:gap-6 shrink-0">
                  <div className="text-center">
                    <p className="text-[10px] md:text-sm text-slate-400">원생</p>
                    <p className="font-bold text-slate-800 text-sm md:text-lg">{branch.active_count}명</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] md:text-sm text-slate-400">메시지</p>
                    <p className={`font-bold text-sm md:text-lg ${getRateColor(branch.message_rate)}`}>{branch.message_rate}%</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] md:text-sm text-slate-400">리포트</p>
                    <p className={`font-bold text-sm md:text-lg ${getRateColor(branch.report_rate)}`}>{branch.report_rate}%</p>
                  </div>
                  <span className="text-slate-300 text-xl hidden md:inline">›</span>
                </div>
              </div>
            </div>
          ))}

          {sortedBranches.length === 0 && (
            <div className="text-center py-16 text-slate-500">
              {searchTerm ? (
                <>
                  <p className="text-4xl mb-2">🔍</p>
                  <p>"{searchTerm}" 검색 결과가 없습니다</p>
                </>
              ) : (
                <>
                  <p className="text-4xl mb-2">🏢</p>
                  <p>등록된 지점이 없습니다</p>
                  <p className="text-sm mt-1">새 지점을 추가해보세요!</p>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 새 지점 추가 모달 */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold mb-4">🏢 새 지점 추가</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  지점명 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={addForm.name}
                  onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                  placeholder="강남점"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">주소</label>
                <input
                  type="text"
                  value={addForm.address}
                  onChange={(e) => setAddForm({ ...addForm, address: e.target.value })}
                  placeholder="서울시 강남구..."
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">전화번호</label>
                <input
                  type="tel"
                  value={addForm.phone}
                  onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })}
                  placeholder="02-1234-5678"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  반 개수 <span className="text-red-500">*</span>
                </label>
                <select
                  value={addForm.class_count}
                  onChange={(e) => setAddForm({ ...addForm, class_count: parseInt(e.target.value) })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                    <option key={num} value={num}>{num}개 반</option>
                  ))}
                </select>
                <p className="text-xs text-slate-400 mt-1">
                  01반 ~ {String(addForm.class_count).padStart(2, '0')}반이 자동 생성됩니다.
                </p>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 bg-slate-100 text-slate-700 py-2.5 rounded-xl hover:bg-slate-200 font-medium transition"
              >
                취소
              </button>
              <button
                onClick={handleAddBranch}
                disabled={saving}
                className="flex-1 bg-teal-500 text-white py-2.5 rounded-xl hover:bg-teal-600 disabled:bg-slate-300 font-medium transition"
              >
                {saving ? '저장 중...' : '추가'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
