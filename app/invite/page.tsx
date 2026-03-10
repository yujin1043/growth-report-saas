'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function InvitePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [branchId, setBranchId] = useState<string | null>(null)
  const [branchName, setBranchName] = useState('')
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([])
  const [selectedClassIds, setSelectedClassIds] = useState<Set<string>>(new Set())
  const [myInvitations, setMyInvitations] = useState<any[]>([])
  const [form, setForm] = useState({ name: '', email: '', role: 'teacher', phone: '' })

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: profile } = await supabase
      .from('user_profiles').select('role, branch_id').eq('id', user.id).single()

    if (!profile || profile.role === 'admin') { router.push('/dashboard'); return }
    setBranchId(profile.branch_id)

    const [branchResult, invitesResult, classesResult] = await Promise.all([
      supabase.from('branches').select('name').eq('id', profile.branch_id).single(),
      supabase.from('user_invitations').select('*').eq('branch_id', profile.branch_id).order('created_at', { ascending: false }),
      supabase.from('classes').select('id, name').eq('branch_id', profile.branch_id).order('name')
    ])

    if (branchResult.data) setBranchName(branchResult.data.name)
    if (invitesResult.data) setMyInvitations(invitesResult.data)
    if (classesResult.data) setClasses(classesResult.data)
    setLoading(false)
  }

  function handleClassToggle(classId: string) {
    const next = new Set(selectedClassIds)
    if (next.has(classId)) next.delete(classId)
    else next.add(classId)
    setSelectedClassIds(next)
  }

  async function handleSubmit() {
    if (!form.name.trim()) { alert('이름을 입력해주세요.'); return }
    if (!form.email.trim()) { alert('이메일을 입력해주세요.'); return }
    if (!branchId) { alert('지점 정보를 찾을 수 없습니다.'); return }

    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()

    const { error } = await supabase.from('user_invitations').insert({
      branch_id: branchId,
      name: form.name,
      email: form.email,
      role: form.role,
      phone: form.phone || null,
      requested_by: user?.id,
      status: 'pending',
      class_ids: form.role === 'teacher' ? Array.from(selectedClassIds) : null
    })

    if (error) {
      alert('요청 실패: ' + error.message)
    } else {
      alert('사용자 추가 요청이 접수되었습니다.\n본사 승인 후 계정이 발급됩니다.')
      setForm({ name: '', email: '', role: 'teacher', phone: '' })
      setSelectedClassIds(new Set())
      loadData()
    }
    setSaving(false)
  }

  const statusBadge = (status: string) => {
    switch (status) {
      case 'pending': return <span className="text-xs px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full">승인 대기</span>
      case 'approved': return <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full">승인 완료</span>
      case 'rejected': return <span className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded-full">거절됨</span>
      default: return null
    }
  }

  const roleText = (role: string) => {
    switch (role) {
      case 'director': return '원장'
      case 'manager': return '실장'
      case 'teacher': return '강사'
      default: return role
    }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-500"></div>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white shadow-sm border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <button onClick={() => router.push('/dashboard')} className="text-slate-500 hover:text-slate-700">← 대시보드</button>
          <h1 className="font-bold text-slate-800">사용자 추가 요청</h1>
          <div className="w-16"></div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-base font-bold text-slate-800">새 사용자 요청</span>
            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{branchName}</span>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">이름 *</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="홍길동"
              className="w-full px-4 py-3 bg-slate-50 rounded-xl border-0 focus:ring-2 focus:ring-teal-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">이메일 *</label>
            <input
              type="email"
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
              placeholder="example@email.com"
              className="w-full px-4 py-3 bg-slate-50 rounded-xl border-0 focus:ring-2 focus:ring-teal-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">역할 *</label>
            <select
              value={form.role}
              onChange={e => { setForm({ ...form, role: e.target.value }); setSelectedClassIds(new Set()) }}
              className="w-full px-4 py-3 bg-slate-50 rounded-xl border-0 focus:ring-2 focus:ring-teal-500 outline-none"
            >
              <option value="teacher">강사</option>
              <option value="manager">실장</option>
              <option value="director">원장</option>
            </select>
          </div>

          {form.role === 'teacher' && classes.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                담당반 선택 <span className="text-slate-400 font-normal text-xs">(복수 선택 가능)</span>
              </label>
              <div className="bg-slate-50 rounded-xl p-3 flex flex-wrap gap-2">
                {classes.map(cls => (
                  <button
                    key={cls.id}
                    onClick={() => handleClassToggle(cls.id)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                      selectedClassIds.has(cls.id)
                        ? 'bg-teal-500 text-white'
                        : 'bg-white border border-slate-200 text-slate-600 hover:border-teal-300'
                    }`}
                  >
                    {cls.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">연락처</label>
            <input
              type="tel"
              value={form.phone}
              onChange={e => setForm({ ...form, phone: e.target.value })}
              placeholder="010-0000-0000"
              className="w-full px-4 py-3 bg-slate-50 rounded-xl border-0 focus:ring-2 focus:ring-teal-500 outline-none"
            />
          </div>

          <p className="text-xs text-slate-400">✓ 요청 후 본사 승인 시 임시 비밀번호와 함께 계정이 발급됩니다.</p>

          <button
            onClick={handleSubmit}
            disabled={saving}
            className="w-full py-3 bg-teal-500 hover:bg-teal-600 text-white font-bold rounded-xl transition disabled:opacity-50"
          >
            {saving ? '요청 중...' : '추가 요청 보내기'}
          </button>
        </div>

        {myInvitations.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-800">요청 내역</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {myInvitations.map(inv => (
                <div key={inv.id} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-700">{inv.name}</p>
                    <p className="text-xs text-slate-400">{inv.email} · {roleText(inv.role)}</p>
                    {inv.status === 'approved' && inv.temp_password && (
                      <p className="text-xs text-teal-600 font-semibold mt-0.5">임시 비밀번호: {inv.temp_password}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {statusBadge(inv.status)}
                    <span className="text-xs text-slate-300">
                      {new Date(inv.created_at).toLocaleDateString('ko-KR')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
