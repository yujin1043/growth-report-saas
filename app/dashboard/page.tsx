'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface UserProfile {
  name: string
  role: string
  branch_id: string
  branches: {
    name: string
  }
  classes: {
    name: string
  }
}

interface RecentReport {
  id: string
  period_start: string
  period_end: string
  created_at: string
  student_name: string
  student_code: string
  branch_name: string
}

export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  
  const [totalStudents, setTotalStudents] = useState(0)
  const [activeStudents, setActiveStudents] = useState(0)
  const [monthlyReports, setMonthlyReports] = useState(0)
  const [pendingStudents, setPendingStudents] = useState(0)
  const [recentReports, setRecentReports] = useState<RecentReport[]>([])

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const { data: { user: authUser } } = await supabase.auth.getUser()

    if (!authUser) {
      router.push('/login')
      return
    }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('name, role, branch_id, branches(name), classes(name)')
      .eq('id', authUser.id)
      .single()

    if (profile) setUser(profile)

    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    const { count: total } = await supabase
      .from('students')
      .select('*', { count: 'exact', head: true })

    setTotalStudents(total || 0)

    const { count: active } = await supabase
      .from('students')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active')

    setActiveStudents(active || 0)

    const { count: reports } = await supabase
      .from('reports')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startOfMonth.toISOString())

    setMonthlyReports(reports || 0)

    const { data: studentsWithReports } = await supabase
      .from('reports')
      .select('student_id')
      .gte('created_at', startOfMonth.toISOString())

    const reportedStudentIds = new Set(studentsWithReports?.map(r => r.student_id) || [])
    const pending = (active || 0) - reportedStudentIds.size
    setPendingStudents(pending > 0 ? pending : 0)

    const { data: reportsData } = await supabase
      .from('reports')
      .select('id, period_start, period_end, created_at, student_id')
      .order('created_at', { ascending: false })
      .limit(10)

    if (reportsData) {
      const reportsWithDetails: RecentReport[] = []
      
      for (const report of reportsData) {
        const { data: student } = await supabase
          .from('students')
          .select('name, student_code, branch_id')
          .eq('id', report.student_id)
          .single()

        let branchName = '-'
        if (student?.branch_id) {
          const { data: branch } = await supabase
            .from('branches')
            .select('name')
            .eq('id', student.branch_id)
            .single()
          branchName = branch?.name || '-'
        }

        reportsWithDetails.push({
          id: report.id,
          period_start: report.period_start,
          period_end: report.period_end,
          created_at: report.created_at,
          student_name: student?.name || '-',
          student_code: student?.student_code || '-',
          branch_name: branchName
        })
      }

      setRecentReports(reportsWithDetails)
    }

    setLoading(false)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const getRoleText = (role: string) => {
    switch (role) {
      case 'admin': return 'ë³¸ì‚¬'
      case 'manager': return '?¤ì¥'
      case 'teacher': return 'ê°•ì‚¬'
      default: return role
    }
  }

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-purple-100 text-purple-700'
      case 'manager': return 'bg-blue-100 text-blue-700'
      case 'teacher': return 'bg-green-100 text-green-700'
      default: return 'bg-gray-100 text-gray-700'
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
          <p className="text-gray-500">ë¡œë”© ì¤?..</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* ?¤ë” */}
      <header className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-40 border-b border-gray-200/50">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <h1 className="text-lg md:text-xl font-bold bg-gradient-to-r from-teal-600 to-cyan-600 bg-clip-text text-transparent">
              ê·¸ë¦¬ë§??±ì¥ë¦¬í¬??
            </h1>
            
            {/* ?°ìŠ¤?¬í†± ë©”ë‰´ */}
            <div className="hidden md:flex items-center gap-4">
              <button 
                onClick={() => router.push('/settings')}
                className="text-gray-500 hover:text-teal-600 text-sm transition"
              >
                ?™ï¸ ?¤ì •
              </button>
              <button 
                onClick={handleLogout}
                className="text-gray-500 hover:text-red-500 text-sm transition"
              >
                ë¡œê·¸?„ì›ƒ
              </button>
            </div>

            {/* ëª¨ë°”??ë©”ë‰´ ë²„íŠ¼ */}
            <button 
              onClick={() => setMenuOpen(!menuOpen)}
              className="md:hidden text-gray-600 text-2xl"
            >
              ??
            </button>
          </div>

          {/* ëª¨ë°”???œë¡­?¤ìš´ ë©”ë‰´ */}
          {menuOpen && (
            <div className="md:hidden mt-3 pt-3 border-t space-y-2">
              <button 
                onClick={() => { router.push('/settings'); setMenuOpen(false); }}
                className="block w-full text-left px-2 py-2 text-gray-600 hover:bg-gray-100 rounded"
              >
                ?™ï¸ ?¤ì •
              </button>
              <button 
                onClick={handleLogout}
                className="block w-full text-left px-2 py-2 text-gray-600 hover:bg-gray-100 rounded"
              >
                ?šª ë¡œê·¸?„ì›ƒ
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-4 md:py-6">
        {/* ?¬ìš©???•ë³´ ì¹´ë“œ */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 md:p-6 mb-5 md:mb-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 md:w-14 md:h-14 bg-gradient-to-br from-teal-400 to-cyan-500 rounded-full flex items-center justify-center text-white text-xl md:text-2xl font-bold shadow-lg shadow-teal-500/30">
              {user?.name?.charAt(0) || '?'}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-lg md:text-xl font-bold text-gray-800">{user?.name}??/h2>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getRoleBadgeColor(user?.role || '')}`}>
                  {getRoleText(user?.role || '')}
                </span>
              </div>
              <p className="text-sm text-gray-500">
                {user?.branches?.name || '?„ì²´ ì§€??} Â· {user?.classes?.name || '?„ì²´ ë°?}
              </p>
            </div>
          </div>
        </div>

        {/* ?µê³„ ì¹´ë“œ */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-5 md:mb-6">
          {/* ?¬ì› ?™ìƒ */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-5">
            <p className="text-gray-500 text-xs md:text-sm font-medium mb-2">?¬ì› ?™ìƒ</p>
            <p className="text-3xl md:text-4xl font-bold text-gray-800">{activeStudents}<span className="text-lg text-gray-400 ml-1">ëª?/span></p>
          </div>

          {/* ?´ë²ˆ ??ë¦¬í¬??*/}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-5">
            <p className="text-gray-500 text-xs md:text-sm font-medium mb-2">?´ë²ˆ ??ë¦¬í¬??/p>
            <p className="text-3xl md:text-4xl font-bold text-gray-800">{monthlyReports}<span className="text-lg text-gray-400 ml-1">ê±?/span></p>
          </div>

          {/* ë¯¸ì‘???™ìƒ */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-5">
            <p className="text-gray-500 text-xs md:text-sm font-medium mb-2">ë¯¸ì‘???™ìƒ</p>
            <p className="text-3xl md:text-4xl font-bold text-rose-400">{pendingStudents}<span className="text-lg text-rose-300 ml-1">ëª?/span></p>
          </div>

          {/* ?´ì›/?´ì› */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-5">
            <p className="text-gray-500 text-xs md:text-sm font-medium mb-2">?´ì›/?´ì›</p>
            <p className="text-3xl md:text-4xl font-bold text-gray-400">{totalStudents - activeStudents}<span className="text-lg text-gray-300 ml-1">ëª?/span></p>
          </div>
        </div>
        {/* ë©”ë‰´ ë²„íŠ¼??*/}
        <div className="grid grid-cols-2 gap-3 md:gap-4 mb-5 md:mb-6">
          <button
            onClick={() => router.push('/students')}
            className="bg-gradient-to-r from-teal-500 to-cyan-500 text-white py-4 md:py-5 rounded-2xl font-medium hover:from-teal-600 hover:to-cyan-600 transition shadow-lg shadow-teal-500/30 flex items-center justify-center gap-2 text-sm md:text-base"
          >
            <span className="text-xl">?“</span>
            ë¦¬í¬???‘ì„±
          </button>
          <button
            onClick={() => router.push('/students')}
            className="bg-white text-gray-700 py-4 md:py-5 rounded-2xl font-medium hover:bg-gray-50 transition border border-gray-200 flex items-center justify-center gap-2 text-sm md:text-base"
          >
            <span className="text-xl">?‘¨?ğŸ?/span>
            ?™ìƒ ê´€ë¦?
          </button>
          {(user?.role === 'manager' || user?.role === 'admin') && (
            <button
              onClick={() => router.push('/users')}
              className="bg-white text-gray-700 py-4 md:py-5 rounded-2xl font-medium hover:bg-gray-50 transition border border-gray-200 flex items-center justify-center gap-2 text-sm md:text-base"
            >
              <span className="text-xl">?‘¥</span>
              ?¬ìš©??ê´€ë¦?
            </button>
          )}
          {user?.role === 'admin' && (
            <button
              onClick={() => router.push('/branches')}
              className="bg-white text-gray-700 py-4 md:py-5 rounded-2xl font-medium hover:bg-gray-50 transition border border-gray-200 flex items-center justify-center gap-2 text-sm md:text-base"
            >
              <span className="text-xl">?¢</span>
              ì§€??ê´€ë¦?
            </button>
          )}
          {user?.role === 'admin' && (
            <button
              onClick={() => router.push('/admin')}
              className="col-span-2 bg-gradient-to-r from-purple-500 to-indigo-500 text-white py-4 md:py-5 rounded-2xl font-medium hover:from-purple-600 hover:to-indigo-600 transition shadow-lg shadow-purple-500/30 flex items-center justify-center gap-2 text-sm md:text-base"
            >
              <span className="text-xl">?“Š</span>
              ë³¸ì‚¬ ê´€ë¦?
            </button>
          )}
        </div>

        {/* ìµœê·¼ ë¦¬í¬??*/}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 md:px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
              <span className="text-lg">?“‹</span>
              ìµœê·¼ ?‘ì„± ë¦¬í¬??
            </h3>
            <button 
              onClick={() => router.push('/reports')}
              className="text-teal-600 text-sm hover:text-teal-700 font-medium transition"
            >
              ?„ì²´ë³´ê¸° ??
            </button>
          </div>
          
          {recentReports.length > 0 ? (
            <>
              {/* ?°ìŠ¤?¬í†± ?Œì´ë¸?*/}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="px-5 py-3 text-left text-sm font-medium text-gray-600">ì§€??/th>
                      <th className="px-5 py-3 text-left text-sm font-medium text-gray-600">?™ìƒID</th>
                      <th className="px-5 py-3 text-left text-sm font-medium text-gray-600">?´ë¦„</th>
                      <th className="px-5 py-3 text-left text-sm font-medium text-gray-600">ì§€?„ê¸°ê°?/th>
                      <th className="px-5 py-3 text-left text-sm font-medium text-gray-600">?ì„±??/th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {recentReports.map(report => (
                      <tr 
                        key={report.id} 
                        onClick={() => router.push(`/reports/${report.id}`)}
                        className="hover:bg-teal-50/50 cursor-pointer transition"
                      >
                        <td className="px-5 py-4 text-sm text-gray-600">{report.branch_name}</td>
                        <td className="px-5 py-4 text-sm text-gray-500">{report.student_code}</td>
                        <td className="px-5 py-4 text-sm font-medium text-gray-900">{report.student_name}</td>
                        <td className="px-5 py-4 text-sm text-gray-600">{report.period_start} ~ {report.period_end}</td>
                        <td className="px-5 py-4 text-sm text-gray-500">{formatDate(report.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ëª¨ë°”??ì¹´ë“œ ë¦¬ìŠ¤??*/}
              <div className="md:hidden divide-y divide-gray-100">
                {recentReports.map(report => (
                  <div 
                    key={report.id} 
                    onClick={() => router.push(`/reports/${report.id}`)}
                    className="px-5 py-4 hover:bg-teal-50/50 cursor-pointer transition"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-gray-900">{report.student_name}</span>
                      <span className="text-xs text-gray-500">{formatDate(report.created_at)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span className="bg-gray-100 px-2 py-0.5 rounded">{report.branch_name}</span>
                      <span>{report.student_code}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="px-6 py-12 text-center text-gray-500">
              <span className="text-4xl mb-3 block">?“</span>
              <p>?‘ì„±??ë¦¬í¬?¸ê? ?†ìŠµ?ˆë‹¤</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}