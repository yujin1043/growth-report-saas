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
  branch_id: string | null
  branch_name: string | null
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
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (profile) {
        setCurrentUserRole(profile.role)
        if (profile.role !== 'admin') {
          router.push('/dashboard')
          return
        }
      }
    }

    const { data: usersData } = await supabase
      .from('user_profiles')
      .select('id, name, email, role, status, created_at, branch_id')
      .order('created_at', { ascending: false })

    if (usersData) {
      const { data: branchesData } = await supabase
        .from('branches')
        .select('id, name')

      const branchMap = new Map(branchesData?.map(b => [b.id, b.name]) || [])

      const usersWithBranch = usersData.map(u => ({
        ...u,
        branch_name: u.branch_id ? branchMap.get(u.branch_id) || null : null
      }))

      setUsers(usersWithBranch)
    }

    setLoading(false)
  }

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'admin':
        return <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-xs">본사</span>
      case 'director':
        return <span className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs">원장</span>
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
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-500 mx-auto mb-4"></div>
          <p className="text-gray-500">로딩 중...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <header className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-40 border-b border-gray-200/50">
        <div className="max-w-7xl mx-auto px-4 py-3 md:py-4">
          <div className="flex items-center justify-between">
            <button onClick={() => router.push('/dashboard')} className="text-gray-500 hover:text-gray-700 transition">
              ← 대시보드
            </button>
            <h1 className="text-base md:text-lg font-bold text-gray-800">사용자 관리</h1>
            <button
              onClick={() => router.push('/users/new')}
              className="bg-gradient-to-r from-teal-500 to-cyan-500 text-white px-4 py-2 rounded-xl text-sm font-medium hover:from-teal-600 hover:to-cyan-600 transition shadow-sm"
            >
              + 새 사용자
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="mb-4 text-sm text-gray-600">
          총 <span className="font-bold text-teal-600">{users.length}</span>명
        </div>

        <div className="hidden md:block bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-5 py-3 text-left text-sm font-semibold text-gray-900">이름</th>
                <th className="px-5 py-3 text-left text-sm font-semibold text-gray-900">이메일</th>
                <th className="px-5 py-3 text-left text-sm font-semibold text-gray-900">역할</th>
                <th className="px-5 py-3 text-left text-sm font-semibold text-gray-900">지점</th>
                <th className="px-5 py-3 text-left text-sm font-semibold text-gray-900">상태</th>
                <th className="px-5 py-3 text-left text-sm font-semibold text-gray-900">등록일</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((user) => (
                <tr
                  key={user.id}
                  onClick={() => router.push(`/users/${user.id}`)}
                  className="hover:bg-teal-50/50 cursor-pointer transition"
                >
                  <td className="px-5 py-4 text-sm font-medium text-gray-900">{user.name || '-'}</td>
                  <td className="px-5 py-4 text-sm text-gray-600">{user.email}</td>
                  <td className="px-5 py-4">{getRoleBadge(user.role)}</td>
                  <td className="px-5 py-4 text-sm text-gray-600">{user.branch_name || '전체 (본사)'}</td>
                  <td className="px-5 py-4">{getStatusBadge(user.status)}</td>
                  <td className="px-5 py-4 text-sm text-gray-500">{formatDate(user.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {users.length === 0 && (
            <div className="text-center py-16 text-gray-500">
              <p className="text-4xl mb-2">👥</p>
              <p>등록된 사용자가 없습니다</p>
            </div>
          )}
        </div>

        <div className="md:hidden space-y-3">
          {users.map((user) => (
            <div
              key={user.id}
              onClick={() => router.push(`/users/${user.id}`)}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 hover:shadow-md cursor-pointer transition"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-gray-900">{user.name || '-'}</span>
                {getRoleBadge(user.role)}
              </div>
              <div className="text-xs text-gray-500 space-y-1">
                <p>{user.email}</p>
                <p>{user.branch_name || '전체 (본사)'}</p>
              </div>
            </div>
          ))}

          {users.length === 0 && (
            <div className="text-center py-16 text-gray-500">
              <p className="text-4xl mb-2">👥</p>
              <p>등록된 사용자가 없습니다</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
