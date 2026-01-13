'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Branch {
  id: string
  name: string
}

interface ClassOption {
  id: string
  name: string
}

export default function NewUserPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [branches, setBranches] = useState<Branch[]>([])
  const [classes, setClasses] = useState<ClassOption[]>([])

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'teacher',
    branch_id: '',
    class_id: '',
    status: 'active'
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
      .select('id, name')
      .order('name')

    if (classData) setClasses(classData)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

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
      alert('비밀번호는 6자 이상 입력해주세요.')
      return
    }
    if (!formData.branch_id) {
      alert('지점을 선택해주세요.')
      return
    }

    setSaving(true)

    try {
      // 1. Supabase Auth로 사용자 생성
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password
      })

      if (authError) {
        alert('사용자 생성 실패: ' + authError.message)
        setSaving(false)
        return
      }

      if (!authData.user) {
        alert('사용자 생성에 실패했습니다.')
        setSaving(false)
        return
      }

      // 2. user_profiles 테이블에 추가 정보 저장
      const { error: profileError } = await supabase
        .from('user_profiles')
        .insert({
          id: authData.user.id,
          name: formData.name,
          email: formData.email,
          role: formData.role,
          branch_id: formData.branch_id,
          class_id: formData.class_id || null,
          status: formData.status
        })

      if (profileError) {
        console.error('Profile error:', profileError)
        alert('프로필 저장 실패: ' + profileError.message)
        setSaving(false)
        return
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
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <button onClick={() => router.back()} className="text-gray-600">← 뒤로</button>
            <h1 className="text-lg font-bold">새 사용자 등록</h1>
            <div className="w-10"></div>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 계정 정보 */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-bold mb-4">🔐 계정 정보</h2>
            
            <div className="space-y-4">
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
                  className="w-full px-4 py-2 border rounded-lg"
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
                  className="w-full px-4 py-2 border rounded-lg"
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
                  className="w-full px-4 py-2 border rounded-lg"
                />
                <p className="text-xs text-gray-500 mt-1">첫 로그인 후 비밀번호 변경을 안내해주세요.</p>
              </div>
            </div>
          </div>

          {/* 역할 및 소속 */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-bold mb-4">👤 역할 및 소속</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  역할 <span className="text-red-500">*</span>
                </label>
                <select
                  name="role"
                  value={formData.role}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border rounded-lg"
                >
                  <option value="teacher">강사</option>
                  <option value="manager">실장</option>
                  <option value="admin">본사</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  지점 <span className="text-red-500">*</span>
                </label>
                <select
                  name="branch_id"
                  value={formData.branch_id}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border rounded-lg"
                >
                  <option value="">선택하세요</option>
                  {branches.map(branch => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </select>
              </div>

              {formData.role === 'teacher' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">담당 반</label>
                  <select
                    name="class_id"
                    value={formData.class_id}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border rounded-lg"
                  >
                    <option value="">선택하세요 (선택)</option>
                    {classes.map(cls => (
                      <option key={cls.id} value={cls.id}>{cls.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">상태</label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border rounded-lg"
                >
                  <option value="active">활성</option>
                  <option value="inactive">비활성</option>
                </select>
              </div>
            </div>
          </div>

          {/* 역할 설명 */}
          <div className="bg-blue-50 rounded-lg p-4">
            <h3 className="font-bold text-blue-800 mb-2">📋 역할별 권한</h3>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• <strong>강사</strong>: 담당 반 학생 리포트 작성</li>
              <li>• <strong>실장</strong>: 지점 내 모든 학생/강사 관리</li>
              <li>• <strong>본사</strong>: 전체 지점/사용자 관리</li>
            </ul>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-teal-500 text-white py-4 rounded-lg font-medium hover:bg-teal-600 disabled:bg-gray-400"
          >
            {saving ? '등록 중...' : '사용자 등록'}
          </button>
        </form>
      </div>
    </div>
  )
}