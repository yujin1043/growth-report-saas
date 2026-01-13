'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

interface Branch {
  id: string
  name: string
}

interface ClassOption {
  id: string
  name: string
  branch_id: string
}

export default function NewUserPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [branches, setBranches] = useState<Branch[]>([])
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [selectedClassIds, setSelectedClassIds] = useState<Set<string>>(new Set())

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'teacher',
    branch_id: '',
    status: 'active',
    phone: ''
  })

  useEffect(() => {
    loadOptions()
  }, [])

  async function loadOptions() {
    const { data: branchData } = await supabase
      .from('branches')
      .select('id, name')
      .order('name')

    if (branchData) setBranches(branchData)

    const { data: classData } = await supabase
      .from('classes')
      .select('id, name, branch_id')
      .order('name')

    if (classData) setClasses(classData)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    
    if (name === 'branch_id') {
      setSelectedClassIds(new Set())
    }
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

  const filteredClasses = formData.branch_id
    ? classes.filter(c => c.branch_id === formData.branch_id)
    : []

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!formData.name.trim()) {
      alert('이름을 입력해주세요.')
      return
    }
    if (!formData.email.trim()) {
      alert('이메일을 입력해주세요.')
      return
    }
    if (!formData.password || formData.password.length < 6) {
      alert('비밀번호를 6자 이상 입력해주세요.')
      return
    }

    setSaving(true)

    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
      const supabaseServiceKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      
      const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      })

      const { data: authData, error: authError } = await adminClient.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            name: formData.name
          }
        }
      })

      if (authError) {
        alert('계정 생성 실패: ' + authError.message)
        setSaving(false)
        return
      }

      if (!authData.user) {
        alert('계정 생성에 실패했습니다.')
        setSaving(false)
        return
      }

      const { error: profileError } = await supabase
        .from('user_profiles')
        .insert({
          id: authData.user.id,
          name: formData.name,
          email: formData.email,
          role: formData.role,
          branch_id: formData.branch_id || null,
          status: formData.status,
          phone: formData.phone || null
        })

      if (profileError) {
        console.error('Profile error:', profileError)
        alert('프로필 저장 실패: ' + profileError.message)
        setSaving(false)
        return
      }

      if (selectedClassIds.size > 0) {
        const teacherClassesInsert = Array.from(selectedClassIds).map(classId => ({
          teacher_id: authData.user!.id,
          class_id: classId
        }))

        const { error: classError } = await supabase
          .from('teacher_classes')
          .insert(teacherClassesInsert)

        if (classError) {
          console.error('Class assignment error:', classError)
        }
      }

      alert('사용자가 등록되었습니다!\n임시 비밀번호: ' + formData.password)
      router.push('/users')

    } catch (error) {
      console.error('Error:', error)
      alert('등록에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <header className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-40 border-b border-gray-200/50">
        <div className="max-w-2xl mx-auto px-4 py-3 md:py-4">
          <div className="flex items-center justify-between">
            <button onClick={() => router.push('/users')} className="text-gray-500 hover:text-gray-700 transition">
              ← 사용자 목록
            </button>
            <h1 className="text-base md:text-lg font-bold text-gray-800">새 사용자 등록</h1>
            <div className="w-16"></div>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
            <h2 className="font-bold text-gray-800">계정 정보</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                이름 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="홍길동"
                className="w-full px-4 py-3 bg-gray-50 border-0 rounded-xl focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                이메일 <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="teacher@grima.com"
                className="w-full px-4 py-3 bg-gray-50 border-0 rounded-xl focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                임시 비밀번호 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="6자 이상"
                className="w-full px-4 py-3 bg-gray-50 border-0 rounded-xl focus:ring-2 focus:ring-teal-500"
              />
              <p className="text-xs text-gray-500 mt-1">첫 로그인 후 비밀번호 변경을 안내해주세요.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">연락처</label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                placeholder="010-0000-0000"
                className="w-full px-4 py-3 bg-gray-50 border-0 rounded-xl focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
            <h2 className="font-bold text-gray-800">역할 및 소속</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                역할 <span className="text-red-500">*</span>
              </label>
              <select
                name="role"
                value={formData.role}
                onChange={handleChange}
                className="w-full px-4 py-3 bg-gray-50 border-0 rounded-xl focus:ring-2 focus:ring-teal-500"
              >
                <option value="teacher">강사</option>
                <option value="manager">실장</option>
                <option value="admin">본사</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                소속 지점 {formData.role !== 'admin' && <span className="text-red-500">*</span>}
              </label>
              <select
                name="branch_id"
                value={formData.branch_id}
                onChange={handleChange}
                className="w-full px-4 py-3 bg-gray-50 border-0 rounded-xl focus:ring-2 focus:ring-teal-500"
              >
                <option value="">전체 지점 (본사)</option>
                {branches.map(branch => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
              </select>
            </div>

            {formData.branch_id && (formData.role === 'teacher' || formData.role === 'manager') && (
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
                name="status"
                value={formData.status}
                onChange={handleChange}
                className="w-full px-4 py-3 bg-gray-50 border-0 rounded-xl focus:ring-2 focus:ring-teal-500"
              >
                <option value="active">활성</option>
                <option value="inactive">비활성</option>
              </select>
            </div>
          </div>

          <div className="bg-blue-50 rounded-2xl p-4">
            <h3 className="font-bold text-blue-800 mb-2">역할별 권한</h3>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• <strong>강사</strong>: 담당반 학생 리포트 작성</li>
              <li>• <strong>실장</strong>: 지점 내 모든 학생/강사 관리</li>
              <li>• <strong>본사</strong>: 전체 지점 및 사용자 관리</li>
            </ul>
          </div>

          <div className="space-y-3">
            <button
              type="submit"
              disabled={saving}
              className="w-full bg-gradient-to-r from-teal-500 to-cyan-500 text-white py-4 rounded-2xl font-medium hover:from-teal-600 hover:to-cyan-600 transition shadow-lg shadow-teal-500/30 disabled:opacity-50"
            >
              {saving ? '등록 중...' : '사용자 등록'}
            </button>
            <button
              type="button"
              onClick={() => router.push('/users')}
              className="w-full bg-gray-100 text-gray-600 py-3 rounded-2xl font-medium hover:bg-gray-200 transition"
            >
              취소
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
