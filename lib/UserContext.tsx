'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'

interface UserContextType {
  userId: string | null
  userName: string
  userRole: string | null
  branchId: string | null
  branchName: string
  isLoading: boolean
  refresh: () => void
}

const UserContext = createContext<UserContextType>({
  userId: null,
  userName: '',
  userRole: null,
  branchId: null,
  branchName: '',
  isLoading: true,
  refresh: () => {}
})

export function UserProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null)
  const [userName, setUserName] = useState('')
  const [userRole, setUserRole] = useState<string | null>(null)
  const [branchId, setBranchId] = useState<string | null>(null)
  const [branchName, setBranchName] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  async function loadUser() {
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      setUserRole('none')
      setIsLoading(false)
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
      }
    } else {
      setUserRole('none')
    }

    setIsLoading(false)
  }

  useEffect(() => {
    loadUser()
  }, [])

  return (
    <UserContext.Provider value={{
      userId,
      userName,
      userRole,
      branchId,
      branchName,
      isLoading,
      refresh: loadUser
    }}>
      {children}
    </UserContext.Provider>
  )
}

export function useUserContext() {
  return useContext(UserContext)
}
