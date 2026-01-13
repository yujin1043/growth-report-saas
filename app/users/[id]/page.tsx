'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Branch {
  id: string
  name: string
}

interface ClassOption {
  id: string
  name: string
}

export default function UserDetailPage() {
  const router = useRouter()
  const params = useParams()
  const userId = params.id as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [branches, setBranches] = useState<Branch[]>([])
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [isEditing, setIsEditing] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: 'teacher',
    branch_id: '',
    class_id: '',
    status: 'active'
  })

  useEffect(() => {
    loadData()
  }, [userId])

  async function loadData() {
    // 현재 로그인한 사용자 ID
    const { data: { user } } = await supabase.auth.getUser()
    if (user) setCurrentUserId(user.id)

    // 지점 목록
    const { data: branchData } = await supabase
      .from('branches')
      .select('id, name')
      .order('name')
    if (branchData) setBranches(branchData)

    // 반 목록
    const { data: classData } = await supabase
      .from('classes')
      .select('id, name')
      .order('name')
    if (classData) setClasses(classData)

    // 사용자 정보
    const { data: userData } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (userData) {
      setFormData({
        name: userData.name || '',
        email: userData.email || '',
        role: userData.role || 'teacher',
        branch_id: userData.branch_id || '',
        class_id: userData.class_id || '',
        status: userData.status || 'active'
      })
    }

    setLoading(false)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  async function handleSave() {
    if (!formData.name.trim()) {
      alert('이름을 입력해주세요.')
      return
    }

    setSaving(true)

    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({
          name: formData.name,
          role: formData.role,
          branch_id: formData.branch_id,
          class_id: formData.class_id || null,
          status: formData.status
        })
        .eq('id', userId)

      if (error) {
        alert('수정 실패: ' + error.message)
        return
      }

      alert('사용자 정보가 수정되었습니다!')
      setIsEditing(false)

    } catch (error) {
      alert('수정에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    // 본인 삭제 방지
    if (userId === currentUserId) {
      alert('본인 계정은 삭제할 수 없습니다.')
      return
    }

    if (!confirm(`"${formData.name}" 사용자를 삭제하시겠습니까?\n\n⚠️ 삭제된 계정은 복구할 수 없습니다.`)) {
      return
    }

    setDeleting(true)

    try {
      // user_profiles 삭제
      const { error: profileError } = await supabase
        .from('user_profiles')
        .delete()
        .eq('id', userId)

      if (profileError) {
        alert('삭제 실패: ' + profileError.message)
        setDeleting(false)
        return
      }

      alert('사용자가 삭제되었습니다.')
      router.push('/users')

    } catch (error) {
      alert('삭제에 실패했습니다.')
      setDeleting(false)
    }
  }

  const getRoleText = (role: string) => {
    switch (role) {
      case 'admin': return '본사'
      case 'manager': return '실장'
      case 'teacher': return '강사'
      default: return role
    }
  }

  const getStatusText = (status: string) => {
    return status === 'active' ? '활성' : '비활성'
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><p>로딩 중...</p></div>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <button onClick={() => router.push('/users')} className="text-gray-600">← 뒤로</button>
            <h1 className="text-lg font-bold">사용자 정보</h1>
            {!isEditing ? (
              <div className="flex gap-2">
                <button 
                  onClick={() => setIsEditing(true)}
                  className="text-teal-600 hover:text-teal-700 font-medium"
                >
                  수정
                </button>
                {userId !== currentUserId && (
                  <button 
                    onClick={handleDelete}
                    disabled={deleting}
                    className="text-red-500 hover:text-red-700 font-medium"
                  >
                    삭제
                  </button>
                )}
              </div>
            ) : (
              <button 
                onClick={() => setIsEditing(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                취소
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {!isEditing ? (
          // 보기 모드
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-bold mb-4">👤 기본 정보</h2>
              <div className="space-y-3">
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-500">이름</span>
                  <span className="font-medium">{formData.name}</span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-500">이메일</span>
                  <span className="font-medium">{formData.email}</span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-500">역할</span>
                  <span className="font-medium">{getRoleText(formData.role)}</span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-500">지점</span>
                  <span className="font-medium">
                    {branches.find(b => b.id === formData.branch_id)?.name || '-'}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-500">담당 반</span>
                  <span className="font-medium">
                    {classes.find(c => c.id === formData.class_id)?.name || '-'}
                  </span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-gray-500">상태</span>
                  <span className={`font-medium ${formData.status === 'active' ? 'text-green-600' : 'text-gray-500'}`}>
                    {getStatusText(formData.status)}
                  </span>
                </div>
              </div>
            </div>

            {/* 하단 삭제 버튼 */}
            {userId !== currentUserId && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="w-full bg-red-50 text-red-600 py-3 rounded-lg font-medium hover:bg-red-100 border border-red-200"
              >
                {deleting ? '삭제 중...' : '🗑️ 이 사용자 삭제'}
              </button>
            )}
          </div>
        ) : (
          // 수정 모드
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-bold mb-4">👤 기본 정보</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">이름</label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">이메일</label>
                  <input
                    type="email"
                    value={formData.email}
                    disabled
                    className="w-full px-4 py-2 border rounded-lg bg-gray-100 text-gray-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">이메일은 변경할 수 없습니다.</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">역할</label>
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">지점</label>
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

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">담당 반</label>
                  <select
                    name="class_id"
                    value={formData.class_id}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border rounded-lg"
                  >
                    <option value="">선택하세요</option>
                    {classes.map(cls => (
                      <option key={cls.id} value={cls.id}>{cls.name}</option>
                    ))}
                  </select>
                </div>

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

            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full bg-teal-500 text-white py-4 rounded-lg font-medium hover:bg-teal-600 disabled:bg-gray-400"
            >
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}