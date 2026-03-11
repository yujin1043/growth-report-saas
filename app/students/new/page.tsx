'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface ClassOption {
  id: string
  name: string
  branch_id: string
}

interface Branch {
  id: string
  name: string
  code: string
}

const AGE_OPTIONS = [
  { value: 5, label: '5세 (유치부)' },
  { value: 6, label: '6세 (유치부)' },
  { value: 7, label: '7세 (유치부)' },
  { value: 8, label: '초등 1학년 (8세)' },
  { value: 9, label: '초등 2학년 (9세)' },
  { value: 10, label: '초등 3학년 (10세)' },
  { value: 11, label: '초등 4학년 (11세)' },
  { value: 12, label: '초등 5학년 (12세)' },
  { value: 13, label: '초등 6학년 (13세)' },
  { value: 14, label: '중등 1학년 (14세)' },
  { value: 15, label: '중등 2학년 (15세)' },
  { value: 16, label: '중등 3학년 (16세)' },
]

export default function NewStudentPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [userBranchId, setUserBranchId] = useState<string | null>(null)
  const [userBranch, setUserBranch] = useState<Branch | null>(null)
  const [userRole, setUserRole] = useState('')

  const [formData, setFormData] = useState({
    name: '',
    age: '',
    class_id: '',
    branch_id: '',
    parent_name: '',
    parent_phone: '',
    status: 'active',
    enrolled_at: new Date().toISOString().split('T')[0]
  })

  const currentYear = new Date().getFullYear()
  const ageToBirthYear = (age: number) => currentYear - age + 1

  useEffect(() => { loadData() }, [])

  useEffect(() => {
    if (userRole === 'admin' && formData.branch_id) {
      loadClassesByBranch(formData.branch_id)
    }
  }, [formData.branch_id, userRole])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: profile } = await supabase
      .from('user_profiles').select('branch_id, role').eq('id', user.id).single()

    if (profile) {
      setUserBranchId(profile.branch_id)
      setUserRole(profile.role)

      if (profile.role === 'admin') {
        const { data: branchData } = await supabase.from('branches').select('id, name, code').order('name')
        if (branchData) setBranches(branchData)
      } else if (profile.branch_id) {
        const { data: branchData } = await supabase.from('branches').select('id, name, code').eq('id', profile.branch_id).single()
        if (branchData) setUserBranch(branchData)
        const { data: classData } = await supabase.from('classes').select('id, name, branch_id').eq('branch_id', profile.branch_id).order('name')
        if (classData) setClasses(classData)
      }
    }
    setLoading(false)
  }

  async function loadClassesByBranch(branchId: string) {
    const { data: classData } = await supabase.from('classes').select('id, name, branch_id').eq('branch_id', branchId).order('name')
    if (classData) setClasses(classData)
    const selectedBranch = branches.find(b => b.id === branchId)
    if (selectedBranch) setUserBranch(selectedBranch)
    setFormData(prev => ({ ...prev, class_id: '' }))
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!formData.name.trim()) { alert('학생 이름을 입력해주세요.'); return }
    if (!formData.age) { alert('나이를 선택해주세요.'); return }
    if (!formData.class_id) { alert('반을 선택해주세요.'); return }
    if (userRole === 'admin' && !formData.branch_id) { alert('지점을 선택해주세요.'); return }

    setSaving(true)
    try {
      const targetBranchId = userRole === 'admin' ? formData.branch_id : userBranchId
      const targetBranch = userRole === 'admin' ? branches.find(b => b.id === formData.branch_id) : userBranch

      if (!targetBranch?.code) { alert('지점 코드를 찾을 수 없습니다.'); setSaving(false); return }

      const birthYear = ageToBirthYear(parseInt(formData.age))

      // ★ DB 함수로 원자적 등록 - 동시 접속 안전
      const { data, error } = await supabase.rpc('insert_student_with_code', {
        p_branch_code: targetBranch.code,
        p_name: formData.name.trim(),
        p_birth_year: birthYear,
        p_class_id: formData.class_id,
        p_branch_id: targetBranchId,
        p_parent_name: formData.parent_name.trim() || null,
        p_parent_phone: formData.parent_phone.trim() || null,
        p_status: formData.status,
        p_enrolled_at: formData.enrolled_at
      })

      if (error) { alert('등록 실패: ' + error.message); return }

      alert('학생이 등록되었습니다!')
      router.push('/students')
    } catch (error) {
      console.error('Error:', error)
      alert('등록에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (<div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="text-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-500 mx-auto mb-4"></div><p className="text-gray-500">로딩 중...</p></div></div>)
  }

  if (userRole !== 'admin' && !userBranchId) {
    return (<div className="min-h-screen bg-gray-50"><header className="bg-white shadow-sm"><div className="max-w-2xl mx-auto px-4 py-4"><div className="flex items-center justify-between"><button onClick={() => router.back()} className="text-gray-600">← 뒤로</button><h1 className="text-lg font-bold">새 학생 등록</h1><div className="w-10"></div></div></div></header><div className="max-w-2xl mx-auto px-4 py-12 text-center"><p className="text-4xl mb-4">⚠️</p><p className="text-gray-600 mb-2">지점이 설정되지 않았습니다.</p><p className="text-gray-500 text-sm">관리자에게 지점 배정을 요청해주세요.</p></div></div>)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <header className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-40 border-b border-gray-200/50">
        <div className="max-w-2xl mx-auto px-4 py-3 md:py-4">
          <div className="flex items-center justify-between">
            <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700 transition">← 뒤로</button>
            <h1 className="text-base md:text-lg font-bold text-gray-800">새 학생 등록</h1>
            <div className="w-10"></div>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          {userRole === 'admin' ? (
            <div className="bg-purple-50 rounded-2xl p-4">
              <p className="text-sm text-purple-700 mb-3">🏢 <span className="font-bold">본사 계정</span> - 학생을 등록할 지점을 선택하세요</p>
              <select name="branch_id" value={formData.branch_id} onChange={handleChange} className="w-full px-4 py-3 bg-white border border-purple-200 rounded-xl focus:ring-2 focus:ring-purple-500 text-gray-800">
                <option value="">지점을 선택하세요</option>
                {branches.map(branch => (<option key={branch.id} value={branch.id}>{branch.name} ({branch.code})</option>))}
              </select>
            </div>
          ) : (
            <div className="bg-teal-50 rounded-2xl p-4">
              <p className="text-sm text-teal-700">📍 등록 지점: <span className="font-bold">{userBranch?.name}</span><span className="text-teal-500 ml-2">(코드: {userBranch?.code})</span></p>
            </div>
          )}

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
            <h2 className="font-bold text-gray-800">기본 정보</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">이름 <span className="text-red-500">*</span></label>
              <input type="text" name="name" value={formData.name} onChange={handleChange} placeholder="학생 이름" className="w-full px-4 py-3 bg-gray-50 border-0 rounded-xl focus:ring-2 focus:ring-teal-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">나이 <span className="text-red-500">*</span></label>
              <select name="age" value={formData.age} onChange={handleChange} className="w-full px-4 py-3 bg-gray-50 border-0 rounded-xl focus:ring-2 focus:ring-teal-500">
                <option value="">선택하세요</option>
                {AGE_OPTIONS.map(opt => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
              </select>
              {formData.age && (<p className="text-xs text-gray-500 mt-1">→ 출생년도: {ageToBirthYear(parseInt(formData.age))}년</p>)}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">반 <span className="text-red-500">*</span></label>
              {(userRole === 'admin' && !formData.branch_id) ? (
                <p className="text-sm text-gray-400 py-3">먼저 지점을 선택해주세요</p>
              ) : classes.length > 0 ? (
                <select name="class_id" value={formData.class_id} onChange={handleChange} className="w-full px-4 py-3 bg-gray-50 border-0 rounded-xl focus:ring-2 focus:ring-teal-500">
                  <option value="">반을 선택하세요</option>
                  {classes.map(cls => (<option key={cls.id} value={cls.id}>{cls.name}</option>))}
                </select>
              ) : (<p className="text-sm text-gray-400 py-3">등록된 반이 없습니다</p>)}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">등록일</label>
              <input type="date" name="enrolled_at" value={formData.enrolled_at} onChange={handleChange} className="w-full px-4 py-3 bg-gray-50 border-0 rounded-xl focus:ring-2 focus:ring-teal-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">상태</label>
              <select name="status" value={formData.status} onChange={handleChange} className="w-full px-4 py-3 bg-gray-50 border-0 rounded-xl focus:ring-2 focus:ring-teal-500">
                <option value="active">재원</option>
                <option value="paused">휴원</option>
                <option value="inactive">퇴원</option>
              </select>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
            <h2 className="font-bold text-gray-800">학부모 정보</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">학부모 이름</label>
              <input type="text" name="parent_name" value={formData.parent_name} onChange={handleChange} placeholder="학부모 이름" className="w-full px-4 py-3 bg-gray-50 border-0 rounded-xl focus:ring-2 focus:ring-teal-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">연락처</label>
              <input type="tel" name="parent_phone" value={formData.parent_phone} onChange={handleChange} placeholder="010-0000-0000" className="w-full px-4 py-3 bg-gray-50 border-0 rounded-xl focus:ring-2 focus:ring-teal-500" />
            </div>
          </div>

          <button type="submit" disabled={saving || (userRole === 'admin' ? !formData.branch_id : classes.length === 0)} className="w-full bg-gradient-to-r from-teal-500 to-cyan-500 text-white py-4 rounded-2xl font-medium hover:from-teal-600 hover:to-cyan-600 transition shadow-lg shadow-teal-500/30 disabled:opacity-50">
            {saving ? '등록 중...' : '학생 등록'}
          </button>
        </form>
      </div>
    </div>
  )
}
