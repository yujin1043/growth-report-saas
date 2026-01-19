'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface UserProfile {
  name: string
  role: string
  branch_id: string | null
  branch_name: string | null
  class_names: string[]
}

interface NeedReportStudent {
  id: string
  name: string
  branch_name: string
  days_since_report: number
}

interface BranchStats {
  id: string
  name: string
  active_count: number
  change_this_month: number
  billing_tier: string
  billing_amount: number
  last_message_days: number | null
  last_report_days: number | null
  status: 'green' | 'yellow' | 'red'
  status_reason: string
}

interface BillingTier {
  tier: string
  count: number
  amount: number
}

export default function DashboardPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [userRole, setUserRole] = useState('')

  const [user, setUser] = useState<UserProfile | null>(null)
  const [activeStudents, setActiveStudents] = useState(0)
  const [monthlyReports, setMonthlyReports] = useState(0)
  const [needReportStudents, setNeedReportStudents] = useState<NeedReportStudent[]>([])

  const [totalBranches, setTotalBranches] = useState(0)
  const [totalActiveStudents, setTotalActiveStudents] = useState(0)
  const [totalBilling, setTotalBilling] = useState(0)
  const [greenCount, setGreenCount] = useState(0)
  const [yellowCount, setYellowCount] = useState(0)
  const [redCount, setRedCount] = useState(0)
  const [branchStats, setBranchStats] = useState<BranchStats[]>([])
  const [billingByTier, setBillingByTier] = useState<BillingTier[]>([])

  useEffect(() => {
    loadData()
  }, [])

  function getBillingInfo(activeCount: number): { tier: string, amount: number } {
    if (activeCount <= 30) return { tier: '~30\uBA85', amount: 30000 }
    if (activeCount <= 50) return { tier: '31~50\uBA85', amount: 40000 }
    if (activeCount <= 80) return { tier: '51~80\uBA85', amount: 60000 }
    if (activeCount <= 120) return { tier: '81~120\uBA85', amount: 80000 }
    if (activeCount <= 150) return { tier: '121~150\uBA85', amount: 100000 }
    const extra = (activeCount - 150) * 500
    return { tier: '150\uBA85+', amount: 100000 + extra }
  }

  function getStatus(
    lastMessageDays: number | null, 
    lastReportDays: number | null
  ): { status: 'green' | 'yellow' | 'red', reason: string } {
    if (lastMessageDays === null || lastMessageDays > 7) {
      return { 
        status: 'red', 
        reason: lastMessageDays === null ? '\uBA54\uC2DC\uC9C0 \uC5C6\uC74C' : `\uBA54\uC2DC\uC9C0 ${lastMessageDays}\uC77C \uC804` 
      }
    }
    if (lastReportDays !== null && lastReportDays > 90) {
      return { status: 'red', reason: `\uB9AC\uD3EC\uD2B8 ${lastReportDays}\uC77C \uC804` }
    }
    if (lastMessageDays >= 4) {
      return { status: 'yellow', reason: `\uBA54\uC2DC\uC9C0 ${lastMessageDays}\uC77C \uC804` }
    }
    return { status: 'green', reason: '\uC815\uC0C1' }
  }

  async function loadData() {
    const { data: { user: authUser } } = await supabase.auth.getUser()

    if (!authUser) {
      router.push('/login')
      return
    }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('name, role, branch_id')
      .eq('id', authUser.id)
      .single()

    if (!profile) {
      router.push('/login')
      return
    }

    setUserRole(profile.role)

    if (profile.role === 'admin') {
      await loadAdminData()
    } else {
      await loadNormalData(authUser.id, profile)
    }

    setLoading(false)
  }

  async function loadAdminData() {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    const [branchesResult, studentsResult, messagesResult, reportsResult] = await Promise.all([
      supabase.from('branches').select('id, name').order('name'),
      supabase.from('students').select('id, branch_id, status, enrolled_at'),
      supabase.from('daily_messages').select('id, branch_id, created_at').order('created_at', { ascending: false }),
      supabase.from('reports').select('id, branch_id, created_at').order('created_at', { ascending: false })
    ])

    const branches = branchesResult.data || []
    const students = studentsResult.data || []
    const messages = messagesResult.data || []
    const reports = reportsResult.data || []

    setTotalBranches(branches.length)

    const stats: BranchStats[] = branches.map(branch => {
      const branchStudents = students.filter(s => s.branch_id === branch.id)
      const activeStudentsList = branchStudents.filter(s => s.status === 'active')
      const activeCount = activeStudentsList.length

      const newThisMonth = branchStudents.filter(s => {
        if (!s.enrolled_at) return false
        return new Date(s.enrolled_at) >= startOfMonth && s.status === 'active'
      }).length

      const billing = getBillingInfo(activeCount)

      const lastMessage = messages.find(m => m.branch_id === branch.id)
      const lastMessageDays = lastMessage 
        ? Math.floor((now.getTime() - new Date(lastMessage.created_at).getTime()) / (1000 * 60 * 60 * 24))
        : null

      const lastReport = reports.find(r => r.branch_id === branch.id)
      const lastReportDays = lastReport
        ? Math.floor((now.getTime() - new Date(lastReport.created_at).getTime()) / (1000 * 60 * 60 * 24))
        : null

      const statusInfo = getStatus(lastMessageDays, lastReportDays)

      return {
        id: branch.id,
        name: branch.name,
        active_count: activeCount,
        change_this_month: newThisMonth,
        billing_tier: billing.tier,
        billing_amount: billing.amount,
        last_message_days: lastMessageDays,
        last_report_days: lastReportDays,
        status: statusInfo.status,
        status_reason: statusInfo.reason
      }
    })

    setBranchStats(stats)
    setTotalActiveStudents(stats.reduce((sum, b) => sum + b.active_count, 0))
    setTotalBilling(stats.reduce((sum, b) => sum + b.billing_amount, 0))
    setGreenCount(stats.filter(b => b.status === 'green').length)
    setYellowCount(stats.filter(b => b.status === 'yellow').length)
    setRedCount(stats.filter(b => b.status === 'red').length)

    const tierMap = new Map<string, { count: number, amount: number }>()
    stats.forEach(b => {
      const existing = tierMap.get(b.billing_tier) || { count: 0, amount: 0 }
      tierMap.set(b.billing_tier, {
        count: existing.count + 1,
        amount: existing.amount + b.billing_amount
      })
    })
    
    const tiers: BillingTier[] = []
    const tierOrder = ['~30\uBA85', '31~50\uBA85', '51~80\uBA85', '81~120\uBA85', '121~150\uBA85', '150\uBA85+']
    tierOrder.forEach(tier => {
      const data = tierMap.get(tier)
      if (data) {
        tiers.push({ tier, count: data.count, amount: data.amount })
      }
    })
    setBillingByTier(tiers)
  }

  async function loadNormalData(authUserId: string, profile: any) {
    const [branchesResult, classesResult] = await Promise.all([
      supabase.from('branches').select('id, name'),
      supabase.from('classes').select('id, name')
    ])

    const branchMap = new Map(branchesResult.data?.map(b => [b.id, b.name]) || [])
    const classMap = new Map(classesResult.data?.map(c => [c.id, c.name]) || [])

    let branchName = null
    let classNames: string[] = []

    if (profile.branch_id) {
      branchName = branchMap.get(profile.branch_id) || null
    }

    if (profile.role === 'teacher') {
      const { data: teacherClasses } = await supabase
        .from('teacher_classes')
        .select('class_id')
        .eq('teacher_id', authUserId)

      if (teacherClasses && teacherClasses.length > 0) {
        classNames = teacherClasses
          .map(tc => classMap.get(tc.class_id))
          .filter((name): name is string => !!name)
      }
    }

    setUser({
      name: profile.name,
      role: profile.role,
      branch_id: profile.branch_id,
      branch_name: branchName,
      class_names: classNames
    })

    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, now.getDate())

    let activeQuery = supabase.from('students').select('id').eq('status', 'active')
    let reportsQuery = supabase.from('reports').select('*', { count: 'exact', head: true }).gte('created_at', startOfMonth.toISOString())
    let needReportQuery = supabase
      .from('students')
      .select('id, name, branch_id, last_report_at')
      .eq('status', 'active')
      .or(`last_report_at.is.null,last_report_at.lt.${twoMonthsAgo.toISOString()}`)
      .order('last_report_at', { ascending: true, nullsFirst: true })
      .limit(5)

    if (profile.role !== 'admin' && profile.branch_id) {
      activeQuery = activeQuery.eq('branch_id', profile.branch_id)
      reportsQuery = reportsQuery.eq('branch_id', profile.branch_id)
      needReportQuery = needReportQuery.eq('branch_id', profile.branch_id)
    }

    const [activeResult, reportsResult, needReportResult] = await Promise.all([
      activeQuery,
      reportsQuery,
      needReportQuery
    ])

    setActiveStudents(activeResult.data?.length || 0)
    setMonthlyReports(reportsResult.count || 0)

    if (needReportResult.data) {
      const list: NeedReportStudent[] = needReportResult.data.map(student => {
        const daysSince = student.last_report_at
          ? Math.floor((now.getTime() - new Date(student.last_report_at).getTime()) / (1000 * 60 * 60 * 24))
          : 999

        return {
          id: student.id,
          name: student.name,
          branch_name: branchMap.get(student.branch_id) || '-',
          days_since_report: daysSince
        }
      })
      setNeedReportStudents(list)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ko-KR').format(amount) + '\uC6D0'
  }

  const formatDays = (days: number | null) => {
    if (days === null) return '-'
    if (days === 0) return '\uC624\uB298'
    return `${days}\uC77C \uC804`
  }

  const getRoleText = (role: string) => {
    switch (role) {
      case 'admin': return '\uBCF8\uC0AC'
      case 'director': return '\uC6D0\uC7A5'
      case 'manager': return '\uC2E4\uC7A5'
      case 'teacher': return '\uAC15\uC0AC'
      default: return role
    }
  }

  const getClassDisplay = () => {
    if (!user) return ''
    if (user.role === 'admin') return ''
    if (user.role === 'director' || user.role === 'manager') return ''
    if (user.class_names.length === 0) return ''
    if (user.class_names.length <= 2) return user.class_names.join(', ')
    return `${user.class_names.slice(0, 2).join(', ')} \uC678 ${user.class_names.length - 2}\uAC1C`
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-500 mx-auto mb-4"></div>
          <p className="text-slate-500">{'\uB85C\uB529 \uC911...'}</p>
        </div>
      </div>
    )
  }

  if (userRole === 'admin') {
    const sortedStats = [...branchStats].sort((a, b) => {
      const statusOrder = { red: 0, yellow: 1, green: 2 }
      return statusOrder[a.status] - statusOrder[b.status]
    })

    const redBranches = branchStats.filter(b => b.status === 'red')
    const yellowBranches = branchStats.filter(b => b.status === 'yellow')

    return (
      <div className="min-h-screen">
        <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
          
          <p className="text-center text-sm text-slate-400">
            {'\uBCF8\uC0AC \uB300\uC2DC\uBCF4\uB4DC - \uC9C0\uC810 \uD604\uD669\uC744 \uD55C\uB208\uC5D0'}
          </p>

          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 text-center">
              <p className="text-slate-500 text-sm mb-1">{'\uCD1D \uC9C0\uC810 \uC218'}</p>
              <p className="text-3xl font-bold text-slate-800">{totalBranches}<span className="text-base font-normal text-slate-400 ml-1">{'\uAC1C'}</span></p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-5 text-center">
              <p className="text-slate-500 text-sm mb-1">{'\uCD1D \uC6D0\uC0DD \uC218'}</p>
              <p className="text-3xl font-bold text-slate-800">{totalActiveStudents}<span className="text-base font-normal text-slate-400 ml-1">{'\uBA85'}</span></p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-5 text-center">
              <p className="text-slate-500 text-sm mb-1">{'\uC774\uBC88\uB2EC \uC608\uC0C1 \uACFC\uAE08'}</p>
              <p className="text-2xl font-bold text-teal-600">{formatCurrency(totalBilling)}</p>
            </div>
          </div>

          <div className="flex justify-center gap-6">
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-green-500"></span>
              <span className="text-slate-600">{'\uC815\uC0C1'} <strong>{greenCount}</strong></span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-yellow-500"></span>
              <span className="text-slate-600">{'\uC8FC\uC758'} <strong>{yellowCount}</strong></span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-red-500"></span>
              <span className="text-slate-600">{'\uC810\uAC80 \uD544\uC694'} <strong>{redCount}</strong></span>
            </div>
          </div>

          {(redBranches.length > 0 || yellowBranches.length > 0) && (
            <div className="space-y-3">
              {redBranches.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
                  <h3 className="font-bold text-red-800 mb-2">{'\uD83D\uDD34 \uC989\uC2DC \uC810\uAC80 \uD544\uC694'}</h3>
                  <ul className="space-y-1">
                    {redBranches.map(b => (
                      <li key={b.id} className="text-sm text-red-700">
                        <strong>{b.name}</strong>: {b.status_reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              {yellowBranches.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4">
                  <h3 className="font-bold text-yellow-800 mb-2">{'\uD83D\uDFE1 \uC8FC\uC758 \uD544\uC694'}</h3>
                  <ul className="space-y-1">
                    {yellowBranches.map(b => (
                      <li key={b.id} className="text-sm text-yellow-700">
                        <strong>{b.name}</strong>: {b.status_reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-800">{'\uD83D\uDCCA \uC9C0\uC810\uBCC4 \uD604\uD669'}</h2>
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">{'\uC0C1\uD0DC'}</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">{'\uC9C0\uC810\uBA85'}</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-slate-700">{'\uC6D0\uC0DD \uC218'}</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-slate-700">{'\uC99D\uAC10'}</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-slate-700">{'\uACFC\uAE08\uAD6C\uAC04'}</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-slate-700">{'\uC608\uC0C1\uC694\uAE08'}</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-slate-700">{'\uCD5C\uADFC \uBA54\uC2DC\uC9C0'}</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-slate-700">{'\uCD5C\uADFC \uB9AC\uD3EC\uD2B8'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedStats.map(branch => (
                    <tr 
                      key={branch.id} 
                      onClick={() => router.push(`/dashboard/branches/${branch.id}`)}
                      className="hover:bg-slate-50 cursor-pointer transition"
                    >
                      <td className="px-4 py-3">
                        <span className={`w-3 h-3 rounded-full inline-block ${
                          branch.status === 'green' ? 'bg-green-500' :
                          branch.status === 'yellow' ? 'bg-yellow-500' : 'bg-red-500'
                        }`}></span>
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-800">{branch.name}</td>
                      <td className="px-4 py-3 text-sm text-center font-bold text-slate-800">{branch.active_count}</td>
                      <td className="px-4 py-3 text-sm text-center">
                        {branch.change_this_month > 0 ? (
                          <span className="text-teal-600">+{branch.change_this_month}</span>
                        ) : branch.change_this_month < 0 ? (
                          <span className="text-red-600">{branch.change_this_month}</span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-center text-slate-600">{branch.billing_tier}</td>
                      <td className="px-4 py-3 text-sm text-center text-slate-800">{formatCurrency(branch.billing_amount)}</td>
                      <td className="px-4 py-3 text-sm text-center">
                        <span className={
                          branch.last_message_days === null ? 'text-red-600' :
                          branch.last_message_days > 7 ? 'text-red-600' :
                          branch.last_message_days >= 4 ? 'text-yellow-600' : 'text-slate-600'
                        }>
                          {formatDays(branch.last_message_days)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-center">
                        <span className={
                          branch.last_report_days === null ? 'text-slate-400' :
                          branch.last_report_days > 90 ? 'text-red-600' : 'text-slate-600'
                        }>
                          {formatDays(branch.last_report_days)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="md:hidden divide-y divide-slate-100">
              {sortedStats.map(branch => (
                <div 
                  key={branch.id}
                  onClick={() => router.push(`/dashboard/branches/${branch.id}`)}
                  className="p-4 hover:bg-slate-50 cursor-pointer transition"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`w-3 h-3 rounded-full ${
                        branch.status === 'green' ? 'bg-green-500' :
                        branch.status === 'yellow' ? 'bg-yellow-500' : 'bg-red-500'
                      }`}></span>
                      <span className="font-medium text-slate-800">{branch.name}</span>
                    </div>
                    <span className="font-bold text-slate-800">{branch.active_count}{'\uBA85'}</span>
                  </div>
                  <div className="flex gap-3 text-xs text-slate-500">
                    <span>{'\uBA54\uC2DC\uC9C0'} {formatDays(branch.last_message_days)}</span>
                    <span>{'\uB9AC\uD3EC\uD2B8'} {formatDays(branch.last_report_days)}</span>
                    <span>{formatCurrency(branch.billing_amount)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <h2 className="font-bold text-slate-800 mb-4">{'\uD83D\uDCB0 \uACFC\uAE08 \uC694\uC57D'}</h2>
            
            <div className="space-y-2 mb-4">
              {billingByTier.map(tier => (
                <div key={tier.tier} className="flex justify-between text-sm">
                  <span className="text-slate-600">[{tier.tier}] {tier.count}{'\uAC1C \uC9C0\uC810'}</span>
                  <span className="text-slate-800">{formatCurrency(tier.amount)}</span>
                </div>
              ))}
            </div>
            
            <div className="border-t border-slate-200 pt-3 flex justify-between font-bold">
              <span className="text-slate-800">{'\uCD1D \uC608\uC0C1 SaaS \uC774\uC6A9\uB8CC'}</span>
              <span className="text-teal-600">{formatCurrency(totalBilling)}</span>
            </div>
          </div>

        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <header className="bg-white shadow-sm border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold flex items-center gap-2">
              <span>🎨</span>
              <span className="bg-gradient-to-r from-teal-500 to-cyan-500 bg-clip-text text-transparent">
                {'\uADF8\uB9AC\uB9C8\uB178\uD2B8'}
              </span>
            </h1>
            
            <div className="flex items-center gap-4">
              <button 
                onClick={() => router.push('/settings')}
                className="text-slate-500 hover:text-slate-700 text-sm transition"
              >
                {'\uC124\uC815'}
              </button>
              <button 
                onClick={async () => {
                  await supabase.auth.signOut()
                  router.push('/login')
                }}
                className="text-slate-500 hover:text-red-500 text-sm transition"
              >
                {'\uB85C\uADF8\uC544\uC6C3'}
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
          {/* 월별 운영 콘텐츠 배너 */}
          <div 
            onClick={() => router.push('/curriculum')}
            className="mb-6 bg-gradient-to-r from-teal-500 to-cyan-500 rounded-2xl p-4 cursor-pointer hover:shadow-lg transition"
          >
            <div className="flex items-center justify-between text-white">
              <div>
                <p className="text-sm opacity-90">📚 이번 달 운영 기준</p>
                <p className="font-bold text-lg">월별 운영 콘텐츠 보기</p>
              </div>
              <div className="text-2xl">→</div>
            </div>
          </div>
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-slate-800">
            👋 {user?.name || '\uC0AC\uC6A9\uC790'}{'\uB2D8'}
            <span className="text-sm font-normal text-slate-500 ml-2">
              {getRoleText(user?.role || '')}
            </span>
          </h2>
          <p className="text-sm text-slate-500">
            {user?.branch_name || '\uC804\uCCB4 \uC9C0\uC810'}
            {getClassDisplay() && ` / ${getClassDisplay()}`}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <p className="text-xs text-slate-400 mb-1">{'\uC7AC\uC6D0\uC0DD'}</p>
            <p className="text-2xl font-bold text-slate-800">{activeStudents}<span className="text-sm font-normal text-slate-400 ml-1">{'\uBA85'}</span></p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <p className="text-xs text-slate-400 mb-1">{'\uC774\uBC88\uB2EC \uB9AC\uD3EC\uD2B8'}</p>
            <p className="text-2xl font-bold text-slate-800">{monthlyReports}<span className="text-sm font-normal text-slate-400 ml-1">{'\uAC74'}</span></p>
          </div>
        </div>

        <button
          onClick={() => router.push('/daily-message')}
          className="w-full bg-gradient-to-r from-teal-500 to-cyan-500 text-white py-5 rounded-2xl font-semibold text-lg hover:from-teal-600 hover:to-cyan-600 transition shadow-lg shadow-teal-500/25 mb-3 flex items-center justify-center gap-3"
        >
          <span className="text-2xl">💬</span>
          {'\uC77C\uC77C \uBA54\uC2DC\uC9C0 \uBC1C\uC1A1'}
        </button>

        <div className="grid grid-cols-2 gap-3 mb-6">
          <button
            onClick={() => router.push('/students')}
            className="bg-white text-slate-700 py-4 rounded-2xl font-medium hover:bg-slate-50 transition border border-slate-200 flex items-center justify-center gap-2"
          >
            <span className="text-xl">📝</span>
            {'\uB9AC\uD3EC\uD2B8 \uC791\uC131'}
          </button>
          <button
            onClick={() => router.push('/students')}
            className="bg-white text-slate-700 py-4 rounded-2xl font-medium hover:bg-slate-50 transition border border-slate-200 flex items-center justify-center gap-2"
          >
            <span className="text-xl">👨‍🎓</span>
            {'\uD559\uC0DD \uAD00\uB9AC'}
          </button>
        </div>

        {needReportStudents.length > 0 && (
          <div className="bg-white rounded-2xl border border-orange-200 overflow-hidden">
            <div className="px-4 py-3 bg-orange-50 border-b border-orange-200">
              <h3 className="font-semibold text-orange-800 flex items-center gap-2">
                <span>⚠️</span>
                {'\uB9AC\uD3EC\uD2B8 \uD544\uC694 (2\uAC1C\uC6D4 \uACBD\uACFC)'}
              </h3>
            </div>
            <div className="divide-y divide-slate-100">
              {needReportStudents.map(student => (
                <div 
                  key={student.id}
                  onClick={() => router.push(`/students/${student.id}`)}
                  className="px-4 py-3 flex items-center justify-between hover:bg-slate-50 cursor-pointer transition"
                >
                  <div>
                    <p className="font-medium text-slate-800">{student.name}</p>
                    <p className="text-xs text-slate-400">{student.branch_name}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-orange-500 font-medium">
                      {student.days_since_report === 999 ? '\uB9AC\uD3EC\uD2B8 \uC5C6\uC74C' : `${student.days_since_report}\uC77C \uACBD\uACFC`}
                    </span>
                    <span className="text-slate-300">{'\u2192'}</span>
                  </div>
                </div>
              ))}
            </div>
            <div 
              onClick={() => router.push('/students?filter=needReport')}
              className="px-4 py-3 bg-slate-50 text-center cursor-pointer hover:bg-slate-100 transition"
            >
              <span className="text-sm text-slate-500">{'\uC804\uCCB4\uBCF4\uAE30 \u2192'}</span>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}