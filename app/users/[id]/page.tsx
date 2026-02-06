'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { RoleBadge } from '@/components/ui/Badges'

interface UserProfile {
  id: string
  name: string
  email: string
  role: string
  status: string
  branch_id: string | null
  phone: string | null
}

interface Branch {
  id: string
  name: string
}

interface ClassItem {
  id: string
  name: string
  branch_id: string
}

export default function UserDetailPage() {
  const router = useRouter()
  const params = useParams()
  const userId = params.id as string

  const [user, setUser] = useState<UserProfile | null>(null)
  const [branches, setBranches] = useState<Branch[]>([])
  const [classes, setClasses] = useState<ClassItem[]>([])
  const [selectedClassIds, setSelectedClassIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    name: '',
    role: 'teacher',
    status: 'active',
    branch_id: '',
    phone: ''
  })

  useEffect(() => {
    checkAuth()
    loadData()
  }, [userId])

  async function checkAuth() {
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
      router.push('/dashboard')
    }
  }

  async function loadData() {
    const { data: userData } = await supabase
      .from('user_profiles')
      .select('id, name, email, role, status, branch_id, phone')
      .eq('id', userId)
      .single()

    if (userData) {
      setUser(userData)
      setForm({
        name: userData.name || '',
        role: userData.role || 'teacher',
        status: userData.status || 'active',
        branch_id: userData.branch_id || '',
        phone: userData.phone || ''
      })
    }

    const { data: branchesData } = await supabase
      .from('branches')
      .select('id, name')
      .order('name')

    if (branchesData) setBranches(branchesData)

    const { data: classesData } = await supabase
      .from('classes')
      .select('id, name, branch_id')
      .order('name')

    if (classesData) setClasses(classesData)

    const { data: teacherClassesData } = await supabase
      .from('teacher_classes')
      .select('class_id')
      .eq('teacher_id', userId)

    if (teacherClassesData) {
      setSelectedClassIds(new Set(teacherClassesData.map(tc => tc.class_id)))
    }

    setLoading(false)
  }

  const handleClassToggle = (classId: string) => {
    const newSet = new Set(selectedClassIds)
    if (newSet.has(classId)) {
      newSet.delete(classId)
    } else {
      newSet.add(classId)
    }
    setSelectedClassIds(newSet)
  }

  const filteredClasses = form.branch_id 
    ? classes.filter(c => c.branch_id === form.branch_id)
    : []

  async function handleSave() {
    if (!form.name.trim()) {
      alert('이름을 입력해주세요.')
      return
    }

    setSaving(true)

    try {
      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({
          name: form.name,
          role: form.role,
          status: form.status,
          branch_id: form.branch_id || null,
          phone: form.phone || null
        })
        .eq('id', userId)

      if (updateError) {
        alert('저장 실패: ' + updateError.message)
        setSaving(false)
        return
      }

      await supabase
        .from('teacher_classes')
        .delete()
        .eq('teacher_id', userId)

      if (selectedClassIds.size > 0 && form.role === 'teacher') {
        const teacherClassesInsert = Array.from(selectedClassIds).map(classId => ({
          teacher_id: userId,
          class_id: classId
        }))

        const { error: insertError } = await supabase
          .from('teacher_classes')
          .insert(teacherClassesInsert)

        if (insertError) {
          alert('담당반 저장 실패: ' + insertError.message)
          setSaving(false)
          return
        }
      }

      alert('저장되었습니다!')
      router.push('/users')

    } catch (error) {
      console.error(error)
      alert('저장에 실패했습니다.')
    }

    setSaving(false)
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

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">사용자를 찾을 수 없습니다.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <header className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-40 border-b border-gray-200/50">
        <div className="max-w-2xl mx-auto px-4 py-3 md:py-4">
          <div className="flex items-center justify-between">
            <button onClick={() => router.push('/users')} className="text-gray-500 hover:text-gray-700 transition">
              ← 사용자 목록
            </button>
            <h1 className="text-base md:text-lg font-bold text-gray-800">사용자 정보</h1>
            <div className="w-16"></div>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-teal-400 to-cyan-500 rounded-full flex items-center justify-center text-white text-lg font-bold">
              {user.name?.charAt(0) || '?'}
            </div>
            <div>
              <p className="font-bold text-gray-800">{user.email}</p>
              <div className="flex items-center gap-2 mt-1">
                <RoleBadge role={form.role} />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">이름 *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-4 py-3 bg-gray-50 border-0 rounded-xl focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">연락처</label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="010-0000-0000"
              className="w-full px-4 py-3 bg-gray-50 border-0 rounded-xl focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">역할 *</label>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="w-full px-4 py-3 bg-gray-50 border-0 rounded-xl focus:ring-2 focus:ring-teal-500"
            >
              <option value="teacher">강사</option>
              <option value="manager">실장</option>
              <option value="director">원장</option>
              <option value="admin">본사</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">소속 지점 *</label>
            <select
              value={form.branch_id}
              onChange={(e) => {
                setForm({ ...form, branch_id: e.target.value })
                setSelectedClassIds(new Set())
              }}
              className="w-full px-4 py-3 bg-gray-50 border-0 rounded-xl focus:ring-2 focus:ring-teal-500"
            >
              <option value="">전체 지점 (본사)</option>
              {branches.map(branch => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
          </div>

          {form.branch_id && form.role === 'teacher' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                담당반 선택 <span className="text-gray-400 font-normal">(복수 선택 가능)</span>
              </label>
              <div className="bg-gray-50 rounded-xl p-4">
                {filteredClasses.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {filteredClasses.map(cls => (
                      <button
                        key={cls.id}
                        type="button"
                        onClick={() => handleClassToggle(cls.id)}
                        className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
                          selectedClassIds.has(cls.id)
                            ? 'bg-teal-500 text-white shadow-sm'
                            : 'bg-white text-gray-600 border border-gray-200 hover:border-teal-300'
                        }`}
                      >
                        {cls.name}
                        {selectedClassIds.has(cls.id) && ' ✓'}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 text-center py-2">해당 지점에 등록된 반이 없습니다.</p>
                )}
              </div>
              {selectedClassIds.size > 0 && (
                <p className="text-sm text-teal-600 mt-2">
                  {selectedClassIds.size}개 반 선택됨
                </p>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">상태</label>
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              className="w-full px-4 py-3 bg-gray-50 border-0 rounded-xl focus:ring-2 focus:ring-teal-500"
            >
              <option value="active">활성</option>
              <option value="inactive">비활성</option>
            </select>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-gradient-to-r from-teal-500 to-cyan-500 text-white py-4 rounded-2xl font-medium hover:from-teal-600 hover:to-cyan-600 transition shadow-lg shadow-teal-500/30 disabled:opacity-50"
          >
            {saving ? '저장 중...' : '저장하기'}
          </button>
          <button
            onClick={() => router.push('/users')}
            className="w-full bg-gray-100 text-gray-600 py-3 rounded-2xl font-medium hover:bg-gray-200 transition"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  )
}