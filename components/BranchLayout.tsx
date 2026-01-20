'use client'

import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface BranchLayoutProps {
  children: React.ReactNode
  userName?: string
  branchName?: string
}

const menuItems = [
  { icon: '📚', label: '커리큘럼', id: 'curriculum', path: '/curriculum' },
  { icon: '💬', label: '일일 메시지', id: 'message', path: '/daily-message' },
  { icon: '📝', label: '리포트 작성', id: 'report', path: '/reports/select' },
  { icon: '👨‍🎓', label: '학생관리', id: 'students', path: '/students' },
  { icon: '⚙️', label: '설정', id: 'settings', path: '/settings' },
]

export default function BranchLayout({ children, userName = '선생님', branchName = '' }: BranchLayoutProps) {
  const router = useRouter()
  const pathname = usePathname()

  const getActiveMenu = () => {
    if (pathname === '/dashboard') return 'curriculum'
    if (pathname.startsWith('/reports/select') || pathname.startsWith('/reports/new')) return 'report'
    const found = menuItems.find(item => pathname.startsWith(item.path))
    return found?.id || 'curriculum'
  }

  const activeMenu = getActiveMenu()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside className="w-60 bg-white border-r border-slate-200 py-6 flex flex-col fixed h-screen">
        {/* Logo */}
        <div className="px-6 pb-6 border-b border-slate-100">
          <h1 
            onClick={() => router.push('/dashboard')}
            className="text-xl font-bold flex items-center gap-2 cursor-pointer"
          >
            <span>🎨</span>
            <span className="bg-gradient-to-r from-teal-500 to-cyan-500 bg-clip-text text-transparent">
              그리마노트
            </span>
          </h1>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-5">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => router.push(item.path)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl mb-1 text-left transition
                ${activeMenu === item.id 
                  ? 'bg-gradient-to-r from-teal-500 to-cyan-500 text-white font-semibold' 
                  : 'text-slate-600 hover:bg-slate-50'
                }`}
            >
              <span className="text-lg">{item.icon}</span>
              <span className="text-sm">{item.label}</span>
            </button>
          ))}
        </nav>

        {/* User Profile */}
        <div className="px-4 pt-4 border-t border-slate-100 mx-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center text-white font-bold text-sm">
              {userName.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 truncate">{userName}</p>
              <p className="text-xs text-slate-400">{branchName}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full mt-4 text-sm text-slate-400 hover:text-red-500 transition text-left"
          >
            로그아웃
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-60">
        {children}
      </main>
    </div>
  )
}
