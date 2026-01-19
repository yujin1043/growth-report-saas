'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const adminMenuItems = [
  { id: 'dashboard', label: '대시보드', icon: '📊', path: '/dashboard' },
  { id: 'students', label: '학생 관리', icon: '👨‍🎓', path: '/students' },
  { id: 'reports', label: '리포트', icon: '📝', path: '/reports' },
  { id: 'messages', label: '일일 메시지', icon: '💬', path: '/daily-message' },
  { id: 'curriculum', label: '커리큘럼', icon: '📚', path: '/admin/curriculum' },
  { id: 'users', label: '사용자 관리', icon: '👥', path: '/users' },
  { id: 'branches', label: '지점 관리', icon: '🏢', path: '/branches' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [userName, setUserName] = useState('')
  const [userRole, setUserRole] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!mounted) return
      
      if (!user) {
        setUserRole('none')
        return
      }

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('name, role')
        .eq('id', user.id)
        .single()

      if (!mounted) return

      if (profile) {
        setUserName(profile.name)
        setUserRole(profile.role)
      } else {
        setUserRole('none')
      }
    }

    loadUser()

    return () => { mounted = false }
  }, [pathname])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const isActive = (path: string) => {
    if (path === '/dashboard') {
      return pathname === '/dashboard'
    }
    return pathname.startsWith(path)
  }

  const isPublicPage = pathname === '/login' || pathname === '/'

  // 로딩 중
  if (userRole === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-500 mx-auto mb-4"></div>
        </div>
      </div>
    )
  }

  // 공개 페이지이거나 admin이 아니면 사이드바 없이 렌더링
  if (isPublicPage || userRole !== 'admin') {
    return <>{children}</>
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <aside className="hidden md:flex md:flex-col md:w-56 md:fixed md:inset-y-0 bg-white border-r border-slate-200">
        <div className="px-4 py-5 border-b border-slate-100">
          <h1 className="text-lg font-bold flex items-center gap-2">
            <span>🎨</span>
            <span className="bg-gradient-to-r from-teal-500 to-cyan-500 bg-clip-text text-transparent">
              그리마노트
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">본사 관리</p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {adminMenuItems.map(item => (
            <button
              key={item.id}
              onClick={() => router.push(item.path)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                isActive(item.path)
                  ? 'bg-teal-50 text-teal-700'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-slate-100">
          <div className="px-3 py-2 mb-2">
            <p className="text-sm font-medium text-slate-700">{userName}</p>
            <p className="text-xs text-slate-400">본사 관리자</p>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-red-50 hover:text-red-600 transition"
          >
            <span className="text-lg">🚪</span>
            로그아웃
          </button>
        </div>
      </aside>

      <header className="md:hidden bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-lg font-bold flex items-center gap-2">
            <span>🎨</span>
            <span className="bg-gradient-to-r from-teal-500 to-cyan-500 bg-clip-text text-transparent">
              그리마노트
            </span>
          </h1>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="text-2xl text-slate-600"
          >
            {mobileMenuOpen ? '✕' : '☰'}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="absolute top-full left-0 right-0 bg-white border-b border-slate-200 shadow-lg z-50">
            <nav className="px-4 py-3 space-y-1">
              {adminMenuItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => {
                    router.push(item.path)
                    setMobileMenuOpen(false)
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                    isActive(item.path)
                      ? 'bg-teal-50 text-teal-700'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span className="text-lg">{item.icon}</span>
                  {item.label}
                </button>
              ))}
              <div className="border-t border-slate-100 pt-2 mt-2">
                <div className="px-3 py-2">
                  <p className="text-sm font-medium text-slate-700">{userName}</p>
                  <p className="text-xs text-slate-400">본사 관리자</p>
                </div>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-red-50 hover:text-red-600 transition"
                >
                  <span className="text-lg">🚪</span>
                  로그아웃
                </button>
              </div>
            </nav>
          </div>
        )}
      </header>

      <main className="md:ml-56">
        {children}
      </main>
    </div>
  )
}
