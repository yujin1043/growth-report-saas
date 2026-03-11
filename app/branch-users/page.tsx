'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Teacher {
  id: string
  name: string
  email: string
  role: string
  status: string
  class_ids: string[]
}

interface ClassItem {
  id: string
  name: string
}

export default function BranchUsersPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [myRole, setMyRole] = useState('')
  const [branchName, setBranchName] = useState('')
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [classes, setClasses] = useState<ClassItem[]>([])
  const [deleting, setDeleting] = useState<string | null>(null)

  // 담당반 수정 모달
  const [editTarget, setEditTarget] = useState<Teacher | null>(null)
  const [editClassIds, setEditClassIds] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: profile } = await supabase
      .from('user_profiles').select('role, branch_id').eq('id', user.id).single()

    if (!profile || !['director', 'manager'].includes(profile.role)) {
      router.push('/dashboard')
      return
    }

    setMyRole(profile.role)

    const [branchResult, usersResult, classesResult] = await Promise.all([
      supabase.from('branches').select('name').eq('id', profile.branch_id).single(),
      supabase.from('user_profiles')
        .select('id, name, email, role, status')
        .eq('branch_id', profile.branch_id)
        .in('role', ['teacher', 'manager'])
        .order('name'),
      supabase.from('classes').select('id, name').eq('branch_id', profile.branch_id).order('name')
    ])

    if (branchResult.data) setBranchName(branchResult.data.name)
    if (classesResult.data) setClasses(classesResult.data)

    if (usersResult.data) {
      const teacherIds = usersResult.data.filter(u => u.role === 'teacher').map(u => u.id)
      const { data: teacherClassesData } = teacherIds.length > 0
        ? await supabase.from('teacher_classes').select('teacher_id, class_id').in('teacher_id', teacherIds)
        : { data: [] }

      const classMap = new Map<string, string[]>()
      teacherClassesData?.forEach((tc: any) => {
        if (!classMap.has(tc.teacher_id)) classMap.set(tc.teacher_id, [])
        classMap.get(tc.teacher_id)!.push(tc.class_id)
      })

      setTeachers(usersResult.data.map(u => ({
        ...u,
        class_ids: classMap.get(u.id) || []
      })))
    }

    setLoading(false)
  }

  async function handleDelete(teacher: Teacher) {
    if (!confirm(`[${teacher.name}] 계정을 삭제할까요?\n이 작업은 되돌릴 수 없습니다.`)) return
    setDeleting(teacher.id)

    const res = await fetch('/api/delete-branch-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: teacher.id })
    })
    const result = await res.json()

    if (result.success) {
      alert('삭제되었습니다.')
      loadData()
    } else {
      alert('삭제 실패: ' + result.error)
    }
    setDeleting(null)
  }

  function openEdit(teacher: Teacher) {
    setEditTarget(teacher)
    setEditClassIds(new Set(teacher.class_ids))
  }

  function handleClassToggle(classId: string) {
    const next = new Set(editClassIds)
    if (next.has(classId)) next.delete(classId)
    else next.add(classId)
    setEditClassIds(next)
  }

  async function handleSaveClasses() {
    if (!editTarget) return
    setSaving(true)

    await supabase.from('teacher_classes').delete().eq('teacher_id', editTarget.id)

    if (editClassIds.size > 0) {
      await supabase.from('teacher_classes').insert(
        Array.from(editClassIds).map(classId => ({
          teacher_id: editTarget.id,
          class_id: classId
        }))
      )
    }

    alert('담당반이 저장되었습니다.')
    setEditTarget(null)
    setSaving(false)
    loadData()
  }

  const classNameById = (id: string) => classes.find(c => c.id === id)?.name || '-'

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'manager': return <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">실장</span>
      case 'teacher': return <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">강사</span>
      default: return null
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
          <h1 className="font-bold text-slate-800">강사 관리</h1>
          <div className="w-16"></div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">{branchName} · 총 {teachers.length}명</p>
        </div>

        {teachers.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-400">
            등록된 강사가 없습니다.
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
            {teachers.map(teacher => (
              <div key={teacher.id} className="px-5 py-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-800">{teacher.name}</span>
                    {getRoleBadge(teacher.role)}
                  </div>
                  <div className="flex items-center gap-2">
                    {/* 강사만 반 수정 가능 */}
                    {teacher.role === 'teacher' && (
                      <button
                        onClick={() => openEdit(teacher)}
                        className="text-xs px-3 py-1.5 text-teal-600 hover:bg-teal-50 rounded-lg transition"
                      >
                        반 수정
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(teacher)}
                      disabled={deleting === teacher.id}
                      className="text-xs px-3 py-1.5 text-red-500 hover:bg-red-50 rounded-lg transition disabled:opacity-50"
                    >
                      {deleting === teacher.id ? '삭제 중' : '삭제'}
                    </button>
                  </div>
                </div>
                <p className="text-xs text-slate-400">{teacher.email}</p>
                {teacher.role === 'teacher' && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {teacher.class_ids.length > 0
                      ? teacher.class_ids.map(id => (
                          <span key={id} className="text-xs px-2 py-0.5 bg-teal-50 text-teal-700 rounded-full">
                            {classNameById(id)}
                          </span>
                        ))
                      : <span className="text-xs text-slate-300">담당반 없음</span>
                    }
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 담당반 수정 모달 */}
      {editTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-slate-800">{editTarget.name} · 담당반 수정</h2>
              <button onClick={() => setEditTarget(null)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>

            {classes.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">등록된 반이 없습니다.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {classes.map(cls => (
                  <button
                    key={cls.id}
                    onClick={() => handleClassToggle(cls.id)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                      editClassIds.has(cls.id)
                        ? 'bg-teal-500 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {cls.name}
                  </button>
                ))}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setEditTarget(null)}
                className="flex-1 py-3 border border-slate-200 rounded-xl text-slate-600 font-medium text-sm"
              >
                취소
              </button>
              <button
                onClick={handleSaveClasses}
                disabled={saving}
                className="flex-1 py-3 bg-teal-500 hover:bg-teal-600 text-white font-bold rounded-xl text-sm transition disabled:opacity-50"
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
