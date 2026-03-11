'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface UserContextType {
  userId: string | null
  userName: string
  userRole: string | null
  branchId: string | null
  branchName: string
  isLoading: boolean
  refresh: () => void
  logout: () => Promise<void>
}

const UserContext = createContext<UserContextType>({
  userId: null,
  userName: '',
  userRole: null,
  branchId: null,
  branchName: '',
  isLoading: true,
  refresh: () => {},
  logout: async () => {}
})

// 로그인 없이 접근 가능한 페이지
const PUBLIC_PATHS = ['/login', '/forgot-password', '/reset-password', '/login-preview']

export function UserProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [userId, setUserId] = useState<string | null>(null)
  const [userName, setUserName] = useState('')
  const [userRole, setUserRole] = useState<string | null>(null)
  const [branchId, setBranchId] = useState<string | null>(null)
  const [branchName, setBranchName] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  async function loadUser() {
    setIsLoading(true)
    
    let user = null
    try {
      const { data } = await supabase.auth.getUser()
      user = data.user
    } catch (e) {
      console.error('Auth check failed:', e)
      setIsLoading(false)
      return
    }
    
    if (!user) {
      setUserId(null)
      setUserName('')
      setUserRole('none')
      setBranchId(null)
      setBranchName('')
      setIsLoading(false)
      
      // 보호된 페이지에서 비로그인 → 로그인으로 리다이렉트
      const isPublic = PUBLIC_PATHS.some(p => window.location.pathname.startsWith(p)) || window.location.pathname === '/'
      if (!isPublic) {
        router.push('/login')
      }
      return
    }

    setUserId(user.id)

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('name, role, branch_id')
      .eq('id', user.id)
      .single()

    if (profile) {
      setUserName(profile.name)
      setUserRole(profile.role)
      setBranchId(profile.branch_id)
      
      if (profile.branch_id) {
        const { data: branch } = await supabase
          .from('branches')
          .select('name')
          .eq('id', profile.branch_id)
          .single()
        
        if (branch) {
          setBranchName(branch.name)
        }
      } else {
        setBranchName('')
      }
    } else {
      setUserRole('none')
    }

    setIsLoading(false)
  }

  useEffect(() => {
    // 초기 로드
    loadUser()

    // Auth 상태 변화 감지 (로그인/로그아웃)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        loadUser()
      }
      if (event === 'SIGNED_OUT') {
        setUserId(null)
        setUserName('')
        setUserRole('none')
        setBranchId(null)
        setBranchName('')
        router.push('/login')
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  async function logout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <UserContext.Provider value={{
      userId,
      userName,
      userRole,
      branchId,
      branchName,
      isLoading,
      refresh: loadUser,
      logout
    }}>
      {children}
    </UserContext.Provider>
  )
}

export function useUserContext() {
  return useContext(UserContext)
}
