'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'
import { RoleBadge, StatusBadge } from '@/components/ui/Badges'

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

interface Branch {
  id: string
  name: string
}

const ROLE_ORDER: { [key: string]: number } = {
  admin: 0,
  director: 1,
  manager: 2,
  teacher: 3
}

export default function UsersPage() {
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [currentUserRole, setCurrentUserRole] = useState('')

  // 필터 상태
  const [selectedBranch, setSelectedBranch] = useState('all')
  const [selectedRole, setSelectedRole] = useState('all')
  const [statusFilter, setStatusFilter] = useState('active')
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()

    const [profileResult, usersResult, branchesResult] = await Promise.all([
      user ? supabase.from('user_profiles').select('role').eq('id', user.id).single() : Promise.resolve({ data: null }),
      supabase.from('user_profiles').select('id, name, email, role, status, created_at, branch_id').order('created_at', { ascending: false }),
      supabase.from('branches').select('id, name').order('name')
    ])

    if (profileResult.data) {
      setCurrentUserRole(profileResult.data.role)
      if (profileResult.data.role !== 'admin') {
        router.push('/dashboard')
        return
      }
    }

    if (branchesResult.data) {
      setBranches(branchesResult.data)
    }

    if (usersResult.data) {
      const branchMap = new Map(branchesResult.data?.map(b => [b.id, b.name]) || [])

      const usersWithBranch = usersResult.data.map(u => ({
        ...u,
        branch_name: u.branch_id ? branchMap.get(u.branch_id) || null : null
      }))

      setUsers(usersWithBranch)
    }

    setLoading(false)
  }

  // 필터링 + 정렬
  const filteredUsers = users
    .filter(u => {
      if (selectedBranch !== 'all') {
        if (selectedBranch === 'hq') {
          if (u.branch_id !== null) return false
        } else {
          if (u.branch_id !== selectedBranch) return false
        }
      }
      if (selectedRole !== 'all' && u.role !== selectedRole) return false
      if (statusFilter !== 'all' && u.status !== statusFilter) return false
      if (searchTerm) {
        const term = searchTerm.toLowerCase()
        if (!u.name?.toLowerCase().includes(term) && !u.email?.toLowerCase().includes(term)) return false
      }
      return true
    })
    .sort((a, b) => {
      // 지점명 순 → 직급 순
      const branchA = a.branch_name || ''
      const branchB = b.branch_name || ''
      if (branchA !== branchB) return branchA.localeCompare(branchB, 'ko')
      return (ROLE_ORDER[a.role] ?? 99) - (ROLE_ORDER[b.role] ?? 99)
    })

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
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="relative flex items-center justify-end min-h-[40px]">
            <h1 className="absolute left-1/2 -translate-x-1/2 text-lg font-bold text-gray-800">👥 사용자 관리</h1>
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
        {/* 필터 영역 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-4">
          <div className="flex flex-col gap-3">
            {/* 검색 */}
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="이름 또는 이메일로 검색"
                className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm"
              />
            </div>

            {/* 드롭다운 필터 */}
            <div className="grid grid-cols-3 gap-2">
              {/* 지점 필터 */}
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🏢</span>
                <select
                  value={selectedBranch}
                  onChange={(e) => setSelectedBranch(e.target.value)}
                  className="w-full pl-9 pr-8 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 appearance-none cursor-pointer hover:bg-gray-100 transition"
                >
                  <option value="all">전체 지점</option>
                  <option value="hq">본사</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-xs">▼</span>
              </div>

              {/* 직급 필터 */}
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">👤</span>
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  className="w-full pl-9 pr-8 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 appearance-none cursor-pointer hover:bg-gray-100 transition"
                >
                  <option value="all">전체 직급</option>
                  <option value="admin">본사</option>
                  <option value="director">원장</option>
                  <option value="manager">실장</option>
                  <option value="teacher">강사</option>
                </select>
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-xs">▼</span>
              </div>

              {/* 상태 필터 */}
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">📋</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full pl-9 pr-8 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 appearance-none cursor-pointer hover:bg-gray-100 transition"
                >
                  <option value="all">전체 상태</option>
                  <option value="active">활성</option>
                  <option value="inactive">비활성</option>
                </select>
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-xs">▼</span>
              </div>
            </div>
          </div>
        </div>

        {/* 결과 수 */}
        <div className="mb-4 text-sm text-gray-600">
          총 <span className="font-bold text-teal-600">{filteredUsers.length}</span>명
          {(selectedBranch !== 'all' || selectedRole !== 'all' || statusFilter !== 'active' || searchTerm) && (
            <button
              onClick={() => { setSelectedBranch('all'); setSelectedRole('all'); setStatusFilter('active'); setSearchTerm('') }}
              className="ml-2 text-xs text-gray-400 hover:text-gray-600 underline"
            >
              필터 초기화
            </button>
          )}
        </div>

        {/* PC 테이블 */}
        <div className="hidden md:block bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-5 py-3 text-left text-sm font-semibold text-gray-900">이름</th>
                <th className="px-5 py-3 text-left text-sm font-semibold text-gray-900">이메일</th>
                <th className="px-5 py-3 text-left text-sm font-semibold text-gray-900">직급</th>
                <th className="px-5 py-3 text-left text-sm font-semibold text-gray-900">지점</th>
                <th className="px-5 py-3 text-left text-sm font-semibold text-gray-900">상태</th>
                <th className="px-5 py-3 text-left text-sm font-semibold text-gray-900">등록일</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredUsers.map((user) => (
                <tr
                  key={user.id}
                  onClick={() => router.push(`/users/${user.id}`)}
                  className={`hover:bg-teal-50/50 cursor-pointer transition ${user.status === 'inactive' ? 'opacity-50' : ''}`}
                >
                  <td className="px-5 py-4 text-sm font-medium text-gray-900">{user.name || '-'}</td>
                  <td className="px-5 py-4 text-sm text-gray-600">{user.email}</td>
                  <td className="px-5 py-4"><RoleBadge role={user.role} /></td>
                  <td className="px-5 py-4 text-sm text-gray-600">{user.branch_name || '전체 (본사)'}</td>
                  <td className="px-5 py-4"><StatusBadge status={user.status} /></td>
                  <td className="px-5 py-4 text-sm text-gray-500">{formatDate(user.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredUsers.length === 0 && (
            <div className="text-center py-16 text-gray-500">
              <p className="text-4xl mb-2">👥</p>
              <p>조건에 맞는 사용자가 없습니다</p>
            </div>
          )}
        </div>

        {/* 모바일 카드 */}
        <div className="md:hidden space-y-3">
          {filteredUsers.map((user) => (
            <div
              key={user.id}
              onClick={() => router.push(`/users/${user.id}`)}
              className={`bg-white rounded-2xl shadow-sm border border-gray-100 p-4 hover:shadow-md cursor-pointer transition ${user.status === 'inactive' ? 'opacity-50' : ''}`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900">{user.name || '-'}</span>
                  <RoleBadge role={user.role} />
                </div>
                <StatusBadge status={user.status} />
              </div>
              <div className="text-xs text-gray-500 space-y-1">
                <p>{user.email}</p>
                <p>🏢 {user.branch_name || '전체 (본사)'}</p>
              </div>
            </div>
          ))}

          {filteredUsers.length === 0 && (
            <div className="text-center py-16 text-gray-500">
              <p className="text-4xl mb-2">👥</p>
              <p>조건에 맞는 사용자가 없습니다</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
