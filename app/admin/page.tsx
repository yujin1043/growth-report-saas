'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

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

export default function AdminPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  
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
    if (activeCount <= 30) return { tier: '~30명', amount: 30000 }
    if (activeCount <= 50) return { tier: '31~50명', amount: 40000 }
    if (activeCount <= 80) return { tier: '51~80명', amount: 60000 }
    if (activeCount <= 120) return { tier: '81~120명', amount: 80000 }
    if (activeCount <= 150) return { tier: '121~150명', amount: 100000 }
    const extra = (activeCount - 150) * 500
    return { tier: '150명+', amount: 100000 + extra }
  }

  function getStatus(
    lastMessageDays: number | null, 
    lastReportDays: number | null
  ): { status: 'green' | 'yellow' | 'red', reason: string } {
    if (lastMessageDays === null || lastMessageDays > 7) {
      return { 
        status: 'red', 
        reason: lastMessageDays === null ? '메시지 없음' : `메시지 ${lastMessageDays}일 전` 
      }
    }
    if (lastReportDays !== null && lastReportDays > 90) {
      return { status: 'red', reason: `리포트 ${lastReportDays}일 전` }
    }
    if (lastMessageDays >= 4) {
      return { status: 'yellow', reason: `메시지 ${lastMessageDays}일 전` }
    }
    return { status: 'green', reason: '정상 운영' }
  }

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      router.push('/login')
      return
    }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'admin') {
      router.push('/dashboard')
      return
    }

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
      const activeStudents = branchStudents.filter(s => s.status === 'active')
      const activeCount = activeStudents.length

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
    const tierOrder = ['~30명', '31~50명', '51~80명', '81~120명', '121~150명', '150명+']
    tierOrder.forEach(tier => {
      const data = tierMap.get(tier)
      if (data) {
        tiers.push({ tier, count: data.count, amount: data.amount })
      }
    })
    setBillingByTier(tiers)

    setLoading(false)
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ko-KR').format(amount) + '원'
  }

  const formatDays = (days: number | null) => {
    if (days === null) return '-'
    if (days === 0) return '오늘'
    return `${days}일 전`
  }

  const sortedStats = [...branchStats].sort((a, b) => {
    const statusOrder = { red: 0, yellow: 1, green: 2 }
    return statusOrder[a.status] - statusOrder[b.status]
  })

  const redBranches = branchStats.filter(b => b.status === 'red')
  const yellowBranches = branchStats.filter(b => b.status === 'yellow')

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-500 mx-auto mb-4"></div>
          <p className="text-slate-500">통계 로딩 중...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <header className="bg-white shadow-sm border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <button onClick={() => router.push('/dashboard')} className="text-slate-500 hover:text-slate-700 transition">
              ← 대시보드
            </button>
            <h1 className="text-lg font-bold text-slate-800">🎛 HQ 통합 대시보드</h1>
            <div className="w-16"></div>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        
        <p className="text-center text-sm text-slate-400">
          "이 화면의 목적은 지점을 평가하는 것이 아니라, 문제를 놓치지 않는 것이다."
        </p>

        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 text-center">
            <p className="text-slate-500 text-sm mb-1">총 지점 수</p>
            <p className="text-3xl font-bold text-slate-800">{totalBranches}<span className="text-base font-normal text-slate-400 ml-1">개</span></p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-5 text-center">
            <p className="text-slate-500 text-sm mb-1">총 원생 수</p>
            <p className="text-3xl font-bold text-slate-800">{totalActiveStudents}<span className="text-base font-normal text-slate-400 ml-1">명</span></p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-5 text-center">
            <p className="text-slate-500 text-sm mb-1">이번달 예상 과금</p>
            <p className="text-2xl font-bold text-teal-600">{formatCurrency(totalBilling)}</p>
          </div>
        </div>

        <div className="flex justify-center gap-6">
          <div className="flex items-center gap-2">
            <span className="w-4 h-4 rounded-full bg-green-500"></span>
            <span className="text-slate-600">정상 <strong>{greenCount}</strong></span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-4 rounded-full bg-yellow-500"></span>
            <span className="text-slate-600">주의 <strong>{yellowCount}</strong></span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-4 rounded-full bg-red-500"></span>
            <span className="text-slate-600">점검 필요 <strong>{redCount}</strong></span>
          </div>
        </div>

        {(redBranches.length > 0 || yellowBranches.length > 0) && (
          <div className="space-y-3">
            {redBranches.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
                <h3 className="font-bold text-red-800 mb-2">🔴 즉시 점검 필요</h3>
                <ul className="space-y-1">
                  {redBranches.map(b => (
                    <li key={b.id} className="text-sm text-red-700">
                      • <strong>{b.name}</strong>: {b.status_reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {yellowBranches.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4">
                <h3 className="font-bold text-yellow-800 mb-2">🟡 주의 필요</h3>
                <ul className="space-y-1">
                  {yellowBranches.map(b => (
                    <li key={b.id} className="text-sm text-yellow-700">
                      • <strong>{b.name}</strong>: {b.status_reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="font-bold text-slate-800">📊 지점별 현황</h2>
          </div>

          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">상태</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">지점명</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-slate-700">원생 수</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-slate-700">증감</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-slate-700">과금구간</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-slate-700">예상요금</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-slate-700">최근 메시지</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-slate-700">최근 리포트</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedStats.map(branch => (
                  <tr 
                    key={branch.id} 
                    onClick={() => router.push(`/admin/branches/${branch.id}`)}
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
                onClick={() => router.push(`/admin/branches/${branch.id}`)}
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
                  <span className="font-bold text-slate-800">{branch.active_count}명</span>
                </div>
                <div className="flex gap-3 text-xs text-slate-500">
                  <span>메시지 {formatDays(branch.last_message_days)}</span>
                  <span>리포트 {formatDays(branch.last_report_days)}</span>
                  <span>{formatCurrency(branch.billing_amount)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h2 className="font-bold text-slate-800 mb-4">💰 과금 요약</h2>
          
          <div className="space-y-2 mb-4">
            {billingByTier.map(tier => (
              <div key={tier.tier} className="flex justify-between text-sm">
                <span className="text-slate-600">[{tier.tier}] {tier.count}개 지점</span>
                <span className="text-slate-800">{formatCurrency(tier.amount)}</span>
              </div>
            ))}
          </div>
          
          <div className="border-t border-slate-200 pt-3 flex justify-between font-bold">
            <span className="text-slate-800">총 예상 SaaS 이용료</span>
            <span className="text-teal-600">{formatCurrency(totalBilling)}</span>
          </div>
        </div>

      </div>
    </div>
  )
}