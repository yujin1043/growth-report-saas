'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const adminMenuItems = [
  { id: 'dashboard', label: '\uB300\uC2DC\uBCF4\uB4DC', icon: '📊', path: '/dashboard' },
  { id: 'students', label: '\uD559\uC0DD \uAD00\uB9AC', icon: '👨‍🎓', path: '/students' },
  { id: 'reports', label: '\uB9AC\uD3EC\uD2B8', icon: '📝', path: '/reports' },
  { id: 'messages', label: '\uC77C\uC77C \uBA54\uC2DC\uC9C0', icon: '💬', path: '/daily-message' },
  { id: 'curriculum', label: '\uCEE4\uB9AC\uD058\uB7FC', icon: '📚', path: '/admin/curriculum' },
  { id: 'users', label: '\uC0AC\uC6A9\uC790 \uAD00\uB9AC', icon: '👥', path: '/users' },
  { id: 'branches', label: '\uC9C0\uC810 \uAD00\uB9AC', icon: '🏢', path: '/branches' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [userName, setUserName] = useState('')
  const [userRole, setUserRole] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadUser()
  }, [])

  async function loadUser() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setUserRole('none')
      setLoading(false)
      return
    }
  
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('name, role')
      .eq('id', user.id)
      .single()
  
    if (profile) {
      setUserName(profile.name)
      setUserRole(profile.role)
    } else {
      setUserRole('none')
    }
    setLoading(false)
  }

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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-500 mx-auto mb-4"></div>
        </div>
      </div>
    )
  }

  if (isPublicPage || userRole === '' || userRole !== 'admin') {
    return <>{children}</>
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <aside className="hidden md:flex md:flex-col md:w-56 md:fixed md:inset-y-0 bg-white border-r border-slate-200">
        <div className="px-4 py-5 border-b border-slate-100">
          <h1 className="text-lg font-bold flex items-center gap-2">
            <span>🎨</span>
            <span className="bg-gradient-to-r from-teal-500 to-cyan-500 bg-clip-text text-transparent">
              {'\uADF8\uB9AC\uB9C8\uB178\uD2B8'}
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">{'\uBCF8\uC0AC \uAD00\uB9AC'}</p>
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
            <p className="text-xs text-slate-400">{'\uBCF8\uC0AC \uAD00\uB9AC\uC790'}</p>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-red-50 hover:text-red-600 transition"
          >
            <span className="text-lg">🚪</span>
            {'\uB85C\uADF8\uC544\uC6C3'}
          </button>
        </div>
      </aside>

      <header className="md:hidden bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-lg font-bold flex items-center gap-2">
            <span>🎨</span>
            <span className="bg-gradient-to-r from-teal-500 to-cyan-500 bg-clip-text text-transparent">
              {'\uADF8\uB9AC\uB9C8\uB178\uD2B8'}
            </span>
          </h1>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="text-2xl text-slate-600"
          >
            {mobileMenuOpen ? '\u2715' : '\u2630'}
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
                  <p className="text-xs text-slate-400">{'\uBCF8\uC0AC \uAD00\uB9AC\uC790'}</p>
                </div>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-red-50 hover:text-red-600 transition"
                >
                  <span className="text-lg">🚪</span>
                  {'\uB85C\uADF8\uC544\uC6C3'}
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