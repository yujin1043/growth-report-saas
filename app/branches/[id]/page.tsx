'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface BranchInfo {
  id: string
  name: string
  address: string | null
  phone: string | null
  class_count: number
}

interface ClassItem {
  id: string
  name: string
  code: string
  student_count: number
}

interface TeacherItem {
  id: string
  name: string
  email: string
  role: string
  class_names: string[]
}

interface MonthlySnapshot {
  month: string
  active_count: number
  message_rate: number
  report_rate: number
}

export default function BranchDetailPage() {
  const router = useRouter()
  const params = useParams()
  const branchId = params.id as string

  const [loading, setLoading] = useState(true)
  const [branch, setBranch] = useState<BranchInfo | null>(null)
  const [classes, setClasses] = useState<ClassItem[]>([])
  const [allClasses, setAllClasses] = useState<{ id: string; name: string; branch_id: string }[]>([])
  const [teachers, setTeachers] = useState<TeacherItem[]>([])

  // 지표
  const [activeCount, setActiveCount] = useState(0)
  const [teacherCount, setTeacherCount] = useState(0)
  const [monthlyReports, setMonthlyReports] = useState(0)
  const [billingTier, setBillingTier] = useState('')
  const [billingAmount, setBillingAmount] = useState(0)
  const [messageRate, setMessageRate] = useState(0)
  const [reportRate, setReportRate] = useState(0)
  const [status, setStatus] = useState<'green' | 'yellow' | 'red'>('green')
  const [statusReason, setStatusReason] = useState('정상')

  // 월별 추이
  const [monthlySnapshots, setMonthlySnapshots] = useState<MonthlySnapshot[]>([])

  // 수정 모드
  const [editMode, setEditMode] = useState(false)
  const [editForm, setEditForm] = useState({ name: '', address: '', phone: '', class_count: 1 })
  const [saving, setSaving] = useState(false)
  const [editingClassId, setEditingClassId] = useState<string | null>(null)
  const [editClassName, setEditClassName] = useState('')

  useEffect(() => {
    loadData()
  }, [branchId])

  function getBillingInfo(count: number): { tier: string; amount: number } {
    if (count <= 30) return { tier: '~30명', amount: 30000 }
    if (count <= 50) return { tier: '31~50명', amount: 40000 }
    if (count <= 80) return { tier: '51~80명', amount: 60000 }
    if (count <= 120) return { tier: '81~120명', amount: 80000 }
    if (count <= 150) return { tier: '121~150명', amount: 100000 }
    const extra = (count - 150) * 500
    return { tier: '150명+', amount: 100000 + extra }
  }

  function getStatusFromRates(msgRate: number, rptRate: number): { status: 'green' | 'yellow' | 'red'; reason: string } {
    if (msgRate < 50 || rptRate < 50) {
      const reasons: string[] = []
      if (msgRate < 50) reasons.push('메시지')
      if (rptRate < 50) reasons.push('리포트')
      return { status: 'red', reason: `${reasons.join('·')} 부족` }
    }
    if (msgRate < 80 || rptRate < 80) {
      if (msgRate < 80 && rptRate < 80) return { status: 'yellow', reason: '메시지·리포트 저조' }
      if (msgRate < 80) return { status: 'yellow', reason: '메시지 작성률 저조' }
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

    // 지점 기본 정보
    const { data: branchData } = await supabase
      .from('branches')
      .select('*')
      .eq('id', branchId)
      .single()

    if (!branchData) {
      router.push('/branches')
      return
    }

    setBranch(branchData)
    setEditForm({
      name: branchData.name,
      address: branchData.address || '',
      phone: branchData.phone || '',
      class_count: branchData.class_count || 1
    })

    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, now.getDate())

    // 수업일 수 계산
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    let businessDaysSoFar = 0
    for (let d = 1; d <= Math.min(now.getDate(), daysInMonth); d++) {
      const day = new Date(now.getFullYear(), now.getMonth(), d).getDay()
      if (day !== 0 && day !== 6) businessDaysSoFar++
    }

    const [classesResult, studentsResult, teachersResult, messagesResult, monthlyReportsResult, teacherClassesResult, allClassesResult] = await Promise.all([
      supabase.from('classes').select('id, name, code').eq('branch_id', branchId).order('name'),
      supabase.from('students').select('id, class_id, status, last_report_at').eq('branch_id', branchId),
      supabase.from('user_profiles').select('id, name, email, role').eq('branch_id', branchId).in('role', ['teacher', 'manager', 'director']),
      supabase.from('daily_messages').select('id, created_at').eq('branch_id', branchId).gte('created_at', startOfMonth.toISOString()),
      supabase.from('reports').select('id').eq('branch_id', branchId).gte('created_at', startOfMonth.toISOString()),
      supabase.from('teacher_classes').select('teacher_id, class_id'),
      supabase.from('classes').select('id, name, branch_id').order('name')
    ])

    const classesData = classesResult.data || []
    const studentsData = studentsResult.data || []
    const teachersData = teachersResult.data || []
    const messagesData = messagesResult.data || []
    const monthlyReportsData = monthlyReportsResult.data || []
    const teacherClassesData = teacherClassesResult.data || []
    const allClassesData = allClassesResult.data || []

    setAllClasses(allClassesData)

    // 반별 학생 수
    const classesWithCounts: ClassItem[] = classesData.map(cls => ({
      ...cls,
      student_count: studentsData.filter(s => s.class_id === cls.id && s.status === 'active').length
    }))
    setClasses(classesWithCounts)

    // 강사별 담당반
    const classNameMap = new Map(classesData.map(c => [c.id, c.name]))
    const teachersWithClasses: TeacherItem[] = teachersData.map(t => {
      const teacherClassIds = teacherClassesData.filter(tc => tc.teacher_id === t.id).map(tc => tc.class_id)
      const classNames = teacherClassIds.map(cid => classNameMap.get(cid)).filter(Boolean) as string[]
      return { ...t, class_names: classNames }
    })
    setTeachers(teachersWithClasses)
    setTeacherCount(teachersData.length)

    // 지표 계산
    const activeStudents = studentsData.filter(s => s.status === 'active')
    const active = activeStudents.length
    setActiveCount(active)
    setMonthlyReports(monthlyReportsData.length)

    const billing = getBillingInfo(active)
    setBillingTier(billing.tier)
    setBillingAmount(billing.amount)

    // 메시지 작성률
    const messageDates = new Set(messagesData.map(m => new Date(m.created_at).toDateString()))
    const msgRate = businessDaysSoFar > 0 ? Math.round((messageDates.size / businessDaysSoFar) * 100) : 0
    setMessageRate(msgRate)

    // 리포트 작성률
    const withReport = activeStudents.filter(s => s.last_report_at && new Date(s.last_report_at) >= twoMonthsAgo).length
    const rptRate = active > 0 ? Math.round((withReport / active) * 100) : 0
    setReportRate(rptRate)

    const statusInfo = getStatusFromRates(msgRate, rptRate)
    setStatus(statusInfo.status)
    setStatusReason(statusInfo.reason)

    // 월별 추이 (스냅샷 테이블이 있으면 사용, 없으면 빈 배열)
    try {
      const { data: snapshots } = await supabase
        .from('branch_monthly_snapshots')
        .select('*')
        .eq('branch_id', branchId)
        .order('year_month', { ascending: true })
        .limit(6)

      if (snapshots && snapshots.length > 0) {
        setMonthlySnapshots(snapshots.map(s => ({
          month: s.year_month.split('-')[1] + '월',
          active_count: s.active_count || 0,
          message_rate: s.message_rate || 0,
          report_rate: s.report_rate || 0
        })))
      }
    } catch {
      // 스냅샷 테이블이 아직 없을 수 있음
    }

    setLoading(false)
  }

  async function handleSave() {
    if (!editForm.name.trim()) {
      alert('지점명을 입력해주세요.')
      return
    }
    setSaving(true)

    try {
      const { error } = await supabase
        .from('branches')
        .update({
          name: editForm.name,
          address: editForm.address || null,
          phone: editForm.phone || null,
          class_count: editForm.class_count
        })
        .eq('id', branchId)

      if (error) {
        alert('수정 실패: ' + error.message)
        setSaving(false)
        return
      }

      // 반 개수 조정
      const currentCount = classes.length
      const newCount = editForm.class_count

      if (newCount > currentCount) {
        const classInserts = Array.from({ length: newCount - currentCount }, (_, i) => {
          const num = currentCount + i + 1
          const className = `${String(num).padStart(2, '0')}반`
          const classCode = `${editForm.name}_${className}`.replace(/\s/g, '')
          return { name: className, code: classCode, branch_id: branchId }
        })
        await supabase.from('classes').insert(classInserts)
      } else if (newCount < currentCount) {
        const classesToDelete = [...classes]
          .sort((a, b) => b.name.localeCompare(a.name))
          .slice(0, currentCount - newCount)

        for (const cls of classesToDelete) {
          if (cls.student_count > 0) {
            alert(`"${cls.name}"에 학생이 있어 삭제할 수 없습니다.`)
            setSaving(false)
            return
          }
        }

        await Promise.all(
          classesToDelete.map(cls => supabase.from('classes').delete().eq('id', cls.id))
        )
      }

      alert('저장되었습니다!')
      setEditMode(false)
      loadData()
    } catch {
      alert('오류가 발생했습니다.')
    }
    setSaving(false)
  }

  async function handleClassNameSave(classId: string) {
    if (!editClassName.trim()) return
    const { error } = await supabase
      .from('classes')
      .update({ name: editClassName })
      .eq('id', classId)

    if (error) {
      alert('반 이름 수정 실패: ' + error.message)
    }
    setEditingClassId(null)
    loadData()
  }

  const formatCurrency = (amount: number) => new Intl.NumberFormat('ko-KR').format(amount) + '원'

  const getRateColor = (rate: number) => {
    if (rate >= 80) return 'text-emerald-600'
    if (rate >= 50) return 'text-amber-600'
    return 'text-red-600'
  }

  const getStatusDotColor = (s: string) => {
    switch (s) { case 'green': return 'bg-emerald-500'; case 'yellow': return 'bg-amber-500'; case 'red': return 'bg-red-500'; default: return 'bg-gray-400' }
  }

  const getStatusBadgeStyle = (s: string) => {
    switch (s) { case 'green': return 'bg-emerald-50 border-emerald-200 text-emerald-700'; case 'yellow': return 'bg-amber-50 border-amber-200 text-amber-700'; case 'red': return 'bg-red-50 border-red-200 text-red-700'; default: return 'bg-gray-50 border-gray-200 text-gray-700' }
  }

  const getRoleText = (role: string) => {
    switch (role) { case 'director': return '원장'; case 'manager': return '실장'; case 'teacher': return '강사'; default: return role }
  }

  const getRoleBadgeStyle = (role: string) => {
    switch (role) { case 'director': return 'bg-purple-100 text-purple-700'; case 'manager': return 'bg-blue-100 text-blue-700'; default: return 'bg-green-100 text-green-700' }
  }

  if (loading || !branch) {
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
      <div className="max-w-4xl mx-auto px-4 py-5">

        {/* 헤더 */}
        <div className="flex items-center justify-between mb-5">
          <button onClick={() => router.push('/branches')} className="text-slate-500 hover:text-slate-700 text-sm transition">
            ← 지점 목록
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => { if (editMode) { setEditMode(false); setEditForm({ name: branch.name, address: branch.address || '', phone: branch.phone || '', class_count: branch.class_count || 1 }) } else { setEditMode(true) } }}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition ${editMode ? 'bg-slate-200 text-slate-700' : 'bg-teal-500 text-white hover:bg-teal-600'}`}
            >
              {editMode ? '취소' : '✏️ 정보 수정'}
            </button>
            {editMode && (
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-xl text-sm font-medium bg-teal-500 text-white hover:bg-teal-600 disabled:bg-slate-300 transition">
                {saving ? '저장 중...' : '💾 저장'}
              </button>
            )}
          </div>
        </div>

        {/* 지점 기본정보 */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 md:p-6 mb-4">
          <div className="flex items-center gap-3 mb-4">
            <span className={`w-3.5 h-3.5 rounded-full ${getStatusDotColor(status)}`}></span>
            {editMode ? (
              <input
                className="text-xl md:text-2xl font-bold text-slate-800 border-b-2 border-teal-400 focus:outline-none bg-transparent pb-0.5 w-56"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
            ) : (
              <h1 className="text-xl md:text-2xl font-bold text-slate-800">{branch.name}</h1>
            )}
            <span className={`text-sm px-3 py-1 rounded-full border ${getStatusBadgeStyle(status)}`}>
              {statusReason}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-slate-400 block mb-1">📍 주소</label>
              {editMode ? (
                <input className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm md:text-base" value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} />
              ) : (
                <p className="text-sm md:text-base text-slate-700">{branch.address || '-'}</p>
              )}
            </div>
            <div>
              <label className="text-sm text-slate-400 block mb-1">📞 전화번호</label>
              {editMode ? (
                <input className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm md:text-base" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
              ) : (
                <p className="text-sm md:text-base text-slate-700">{branch.phone || '-'}</p>
              )}
            </div>
          </div>
        </div>


        {/* 지점 정보 요약 */}
        <div className="grid grid-cols-3 gap-3 md:gap-4 mb-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 md:p-5 text-center">
            <p className="text-xs md:text-sm text-slate-500 font-medium mb-1">재원 학생</p>
            <p className="text-2xl md:text-3xl font-bold text-slate-800">{activeCount}<span className="text-sm font-normal text-slate-400 ml-0.5">명</span></p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-4 md:p-5 text-center">
            <p className="text-xs md:text-sm text-slate-500 font-medium mb-1">서비스 이용률</p>
            <p className={`text-2xl md:text-3xl font-bold mb-0.5 ${messageRate + reportRate > 0 ? (Math.round((messageRate + reportRate) / 2) >= 80 ? 'text-emerald-600' : Math.round((messageRate + reportRate) / 2) >= 50 ? 'text-amber-600' : 'text-red-600') : 'text-slate-800'}`}>{messageRate + reportRate > 0 ? Math.round((messageRate + reportRate) / 2) : 0}%</p>
            <p className="text-xs text-slate-400">메시지·리포트 평균</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-4 md:p-5 text-center">
            <p className="text-xs md:text-sm text-slate-500 font-medium mb-1">예상 과금</p>
            <p className="text-xl md:text-2xl font-bold text-teal-600">{formatCurrency(billingAmount)}</p>
            <p className="text-xs md:text-sm text-slate-400">{billingTier}</p>
          </div>
        </div>

        {/* 반 관리 */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 md:p-6 mb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-slate-800 text-base md:text-lg">📚 반 목록</h2>
            {editMode && (
              <div className="flex items-center gap-2">
                <label className="text-sm text-slate-500">반 개수:</label>
                <select
                  value={editForm.class_count}
                  onChange={(e) => setEditForm({ ...editForm, class_count: parseInt(e.target.value) })}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                    <option key={n} value={n}>{n}개</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="space-y-2">
            {classes.map(cls => (
              <div key={cls.id} className="flex items-center justify-between py-3 px-4 bg-slate-50 rounded-xl">
                <div className="flex items-center gap-3">
                  {editMode && editingClassId === cls.id ? (
                    <input
                      className="text-sm md:text-base font-medium border-b border-teal-400 bg-transparent focus:outline-none w-40"
                      value={editClassName}
                      onChange={(e) => setEditClassName(e.target.value)}
                      autoFocus
                      onBlur={() => handleClassNameSave(cls.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleClassNameSave(cls.id) }}
                    />
                  ) : (
                    <span className="text-sm md:text-base font-medium text-slate-700">{cls.name}</span>
                  )}
                  <span className="text-xs md:text-sm text-slate-400">({cls.code})</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm md:text-base text-slate-600">{cls.student_count}명</span>
                  {editMode && editingClassId !== cls.id && (
                    <button onClick={() => { setEditingClassId(cls.id); setEditClassName(cls.name) }} className="text-sm text-teal-600 hover:text-teal-700">이름변경</button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {editMode && (
            <p className="text-sm text-slate-400 mt-3">※ 반 개수를 변경하면 새 반이 자동 생성됩니다. 학생이 있는 반은 삭제되지 않습니다.</p>
          )}
        </div>

        {/* 소속 스태프 */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 md:p-6 mb-4">
          <h2 className="font-bold text-slate-800 text-base md:text-lg mb-4">👩‍🏫 소속 스태프</h2>
          {teachers.length > 0 ? (
            <div className="space-y-2">
              {teachers.map(t => (
                <div key={t.id} className="flex items-center justify-between py-3 px-4 bg-slate-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-gradient-to-br from-teal-400 to-cyan-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
                      {t.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm md:text-base font-medium text-slate-700">{t.name}</p>
                      <p className="text-xs md:text-sm text-slate-400">{t.email}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`text-sm px-2.5 py-0.5 rounded-full ${getRoleBadgeStyle(t.role)}`}>{getRoleText(t.role)}</span>
                    {t.class_names.length > 0 && (
                      <p className="text-xs md:text-sm text-slate-400 mt-1">{t.class_names.join(', ')}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm md:text-base text-slate-400 text-center py-4">소속 스태프가 없습니다</p>
          )}
        </div>



        {/* 서비스 이용 현황 */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 md:p-6 mb-4">
          <h2 className="font-bold text-slate-800 text-base md:text-lg mb-4">
            📊 서비스 이용 현황
            <span className="text-sm font-normal text-slate-400 ml-2">
              {new Date().getFullYear()}년 {new Date().getMonth() + 1}월 기준
            </span>
          </h2>
          <div className="grid grid-cols-2 gap-6 mb-5">
            <div className="bg-slate-50 rounded-xl p-5">
              <p className="text-sm md:text-base text-slate-500 mb-1">일일 메시지 작성률</p>
              <p className={`text-3xl md:text-4xl font-bold mb-1 ${getRateColor(messageRate)}`}>{messageRate}%</p>
              <p className="text-xs md:text-sm text-slate-400">이번 달 수업일 기준</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-5">
              <p className="text-sm md:text-base text-slate-500 mb-1">리포트 작성률</p>
              <p className={`text-3xl md:text-4xl font-bold mb-1 ${getRateColor(reportRate)}`}>{reportRate}%</p>
              <p className="text-xs md:text-sm text-slate-400">재원생 {activeCount}명 중 최근 2개월 내 리포트 보유</p>
            </div>
          </div>

          {/* 월별 추이 */}
          <div className="border-t border-slate-100 pt-4">
            <p className="text-sm font-medium text-slate-500 mb-3">월별 추이</p>
            {monthlySnapshots.length > 0 ? (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="py-2.5 px-3 text-left text-sm font-medium text-slate-400">월</th>
                    <th className="py-2.5 px-3 text-center text-sm font-medium text-slate-400">학생 수</th>
                    <th className="py-2.5 px-3 text-center text-sm font-medium text-slate-400">메시지 작성률</th>
                    <th className="py-2.5 px-3 text-center text-sm font-medium text-slate-400">리포트 작성률</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlySnapshots.map((s, i) => {
                    const prev = i > 0 ? monthlySnapshots[i - 1].active_count : null
                    const diff = prev !== null ? s.active_count - prev : null
                    return (
                      <tr key={i} className="border-b border-slate-50">
                        <td className="py-3 px-3 text-sm md:text-base text-slate-700 font-medium">{s.month}</td>
                        <td className="py-3 px-3 text-center">
                          <span className="font-bold text-sm md:text-base text-slate-800">{s.active_count}명</span>
                          {diff !== null && (
                            <span className={`ml-1.5 text-sm ${diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-red-600' : 'text-slate-400'}`}>
                              {diff > 0 ? `+${diff}` : diff === 0 ? '-' : String(diff)}
                            </span>
                          )}
                        </td>
                        <td className={`py-3 px-3 text-center text-sm md:text-base font-bold ${getRateColor(s.message_rate)}`}>{s.message_rate}%</td>
                        <td className={`py-3 px-3 text-center text-sm md:text-base font-bold ${getRateColor(s.report_rate)}`}>{s.report_rate}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : (
              <p className="text-sm md:text-base text-slate-400 text-center py-4">아직 월별 데이터가 없습니다. 다음 달부터 추이가 표시됩니다.</p>
            )}
            <p className="text-sm text-slate-300 text-center mt-3">* 추후 재등록률도 여기에 추가됩니다</p>
          </div>
        </div>

        {/* 바로가기 */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => router.push(`/students?branch=${branchId}`)}
            className="bg-white rounded-2xl border border-slate-200 p-5 text-center hover:shadow-md hover:border-teal-200 transition"
          >
            <p className="text-2xl mb-1">👨‍🎓</p>
            <p className="text-sm md:text-base font-medium text-slate-700">학생 목록 보기</p>
            <p className="text-xs md:text-sm text-slate-400">이 지점 학생만 필터링</p>
          </button>
          <button
            onClick={() => router.push(`/reports?branch=${branchId}`)}
            className="bg-white rounded-2xl border border-slate-200 p-5 text-center hover:shadow-md hover:border-teal-200 transition"
          >
            <p className="text-2xl mb-1">📝</p>
            <p className="text-sm md:text-base font-medium text-slate-700">리포트 현황 보기</p>
          </button>
        </div>
      </div>
    </div>
  )
}
