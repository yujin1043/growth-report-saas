'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface User {
  id: string
  name: string
  email: string
  role: string
  status: string
  created_at: string
  branches: {
    name: string
  }
  classes: {
    name: string
  }
}

export default function UsersPage() {
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [currentUserRole, setCurrentUserRole] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    // 현재 사용자 권한 확인
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .single()
      
      if (profile) setCurrentUserRole(profile.role)
    }

    // 사용자 목록 조회
    const { data, error } = await supabase
      .from('user_profiles')
      .select('id, name, email, role, status, created_at, branches(name), classes(name)')
      .order('created_at', { ascending: false })

    if (!error && data) {
      setUsers(data)
    }
    setLoading(false)
  }

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'admin':
        return <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-xs">본사</span>
      case 'manager':
        return <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs">실장</span>
      case 'teacher':
        return <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs">강사</span>
      default:
        return <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded-full text-xs">{role}</span>
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs">활성</span>
      case 'inactive':
        return <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded-full text-xs">비활성</span>
      default:
        return null
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ko-KR')
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><p>로딩 중...</p></div>
  }

  // 권한 체크: 실장 이상만 접근 가능
  if (currentUserRole === 'teacher') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-4xl mb-4">🔒</p>
          <p className="text-gray-600">접근 권한이 없습니다</p>
          <button 
            onClick={() => router.push('/dashboard')}
            className="mt-4 text-teal-600 hover:text-teal-700"
          >
            대시보드로 돌아가기
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <button onClick={() => router.push('/dashboard')} className="text-gray-600">← 대시보드</button>
            <h1 className="text-lg font-bold">사용자 관리</h1>
            <button 
              onClick={() => router.push('/users/new')}
              className="bg-teal-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-600"
            >
              + 새 사용자
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* 사용자 수 표시 */}
        <div className="mb-4 text-sm text-gray-600">
          총 <span className="font-bold text-teal-600">{users.length}</span>명
        </div>

        {/* 사용자 목록 테이블 */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">이름</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">이메일</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">역할</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">지점</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">반</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">상태</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">등록일</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {users.map((user) => (
                <tr
                  key={user.id}
                  onClick={() => router.push(`/users/${user.id}`)}
                  className="hover:bg-teal-50 cursor-pointer transition"
                >
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{user.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{user.email}</td>
                  <td className="px-4 py-3">{getRoleBadge(user.role)}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{user.branches?.name || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{user.classes?.name || '-'}</td>
                  <td className="px-4 py-3">{getStatusBadge(user.status)}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{formatDate(user.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {users.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <p className="text-4xl mb-2">👥</p>
              <p>등록된 사용자가 없습니다</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}