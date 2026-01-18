'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface BranchInfo {
  id: string
  name: string
  code: string
}

interface StudentInfo {
  id: string
  name: string
  status: string
  last_report_at: string | null
  class_name: string | null
}

interface TeacherInfo {
  id: string
  name: string
  role: string
}

interface ActivityStats {
  total_messages: number
  monthly_messages: number
  total_reports: number
  monthly_reports: number
  last_message_date: string | null
  last_report_date: string | null
}

export default function BranchDetailPage() {
  const router = useRouter()
  const params = useParams()
  const branchId = params.id as string

  const [loading, setLoading] = useState(true)
  const [branch, setBranch] = useState<BranchInfo | null>(null)
  const [students, setStudents] = useState<StudentInfo[]>([])
  const [teachers, setTeachers] = useState<TeacherInfo[]>([])
  const [stats, setStats] = useState<ActivityStats | null>(null)

  const [activeCount, setActiveCount] = useState(0)
  const [pausedCount, setPausedCount] = useState(0)
  const [inactiveCount, setInactiveCount] = useState(0)

  useEffect(() => {
    if (branchId) {
      loadData()
    }
  }, [branchId])

  async function loadData() {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    const [branchResult, studentsResult, teachersResult, messagesResult, reportsResult, classesResult] = await Promise.all([
      supabase.from('branches').select('id, name, code').eq('id', branchId).single(),
      supabase.from('students').select('id, name, status, last_report_at, class_id').eq('branch_id', branchId),
      supabase.from('user_profiles').select('id, name, role').eq('branch_id', branchId).in('role', ['teacher', 'manager', 'director']),
      supabase.from('daily_messages').select('id, created_at').eq('branch_id', branchId),
      supabase.from('reports').select('id, created_at').eq('branch_id', branchId),
      supabase.from('classes').select('id, name')
    ])

    if (branchResult.data) {
      setBranch(branchResult.data)
    }

    const classMap = new Map(classesResult.data?.map(c => [c.id, c.name]) || [])

    if (studentsResult.data) {
      const studentList: StudentInfo[] = studentsResult.data.map(s => ({
        id: s.id,
        name: s.name,
        status: s.status,
        last_report_at: s.last_report_at,
        class_name: s.class_id ? classMap.get(s.class_id) || null : null
      }))
      setStudents(studentList)
      setActiveCount(studentList.filter(s => s.status === 'active').length)
      setPausedCount(studentList.filter(s => s.status === 'paused').length)
      setInactiveCount(studentList.filter(s => s.status === 'inactive').length)
    }

    if (teachersResult.data) {
      setTeachers(teachersResult.data)
    }

    const messages = messagesResult.data || []
    const reports = reportsResult.data || []

    const monthlyMessages = messages.filter(m => new Date(m.created_at) >= startOfMonth).length
    const monthlyReports = reports.filter(r => new Date(r.created_at) >= startOfMonth).length

    const sortedMessages = [...messages].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    const sortedReports = [...reports].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    setStats({
      total_messages: messages.length,
      monthly_messages: monthlyMessages,
      total_reports: reports.length,
      monthly_reports: monthlyReports,
      last_message_date: sortedMessages[0]?.created_at || null,
      last_report_date: sortedReports[0]?.created_at || null
    })

    setLoading(false)
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-'
    const date = new Date(dateStr)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
    
    if (diffDays === 0) return '\uC624\uB298'
    if (diffDays === 1) return '\uC5B4\uC81C'
    if (diffDays < 7) return `${diffDays}\uC77C \uC804`
    return `${date.getMonth() + 1}/${date.getDate()}`
  }

  const getRoleText = (role: string) => {
    switch (role) {
      case 'director': return '\uC6D0\uC7A5'
      case 'manager': return '\uC2E4\uC7A5'
      case 'teacher': return '\uAC15\uC0AC'
      default: return role
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active': return '\uC7AC\uC6D0'
      case 'paused': return '\uD734\uC6D0'
      case 'inactive': return '\uD1F4\uC6D0'
      default: return status
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-700'
      case 'paused': return 'bg-yellow-100 text-yellow-700'
      case 'inactive': return 'bg-red-100 text-red-700'
      default: return 'bg-slate-100 text-slate-700'
    }
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

  if (!branch) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-500">{'\uC9C0\uC810\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.'}</p>
      </div>
    )
  }

  const activeStudents = students.filter(s => s.status === 'active')
  const needReportStudents = activeStudents.filter(s => {
    if (!s.last_report_at) return true
    const daysSince = Math.floor((new Date().getTime() - new Date(s.last_report_at).getTime()) / (1000 * 60 * 60 * 24))
    return daysSince > 60
  })

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        
        <div className="flex items-center gap-4">
          <button 
            onClick={() => router.push('/dashboard')}
            className="text-slate-500 hover:text-slate-700 transition"
          >
            {'\u2190 \uB300\uC2DC\uBCF4\uB4DC'}
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-800">{branch.name}</h1>
              <p className="text-sm text-slate-400">{'\uC9C0\uC810 \uCF54\uB4DC'}: {branch.code || '-'}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="bg-green-50 rounded-xl p-4 text-center">
              <p className="text-sm text-green-600 mb-1">{'\uC7AC\uC6D0'}</p>
              <p className="text-2xl font-bold text-green-700">{activeCount}<span className="text-sm font-normal">{'\uBA85'}</span></p>
            </div>
            <div className="bg-yellow-50 rounded-xl p-4 text-center">
              <p className="text-sm text-yellow-600 mb-1">{'\uD734\uC6D0'}</p>
              <p className="text-2xl font-bold text-yellow-700">{pausedCount}<span className="text-sm font-normal">{'\uBA85'}</span></p>
            </div>
            <div className="bg-red-50 rounded-xl p-4 text-center">
              <p className="text-sm text-red-600 mb-1">{'\uD1F4\uC6D0'}</p>
              <p className="text-2xl font-bold text-red-700">{inactiveCount}<span className="text-sm font-normal">{'\uBA85'}</span></p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="font-bold text-slate-800 mb-4">{'\uC18C\uC18D \uAC15\uC0AC'}</h2>
          {teachers.length === 0 ? (
            <p className="text-slate-400 text-sm">{'\uB4F1\uB85D\uB41C \uAC15\uC0AC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.'}</p>
          ) : (
            <div className="space-y-2">
              {teachers.map(teacher => (
                <div key={teacher.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                  <span className="font-medium text-slate-700">{teacher.name}</span>
                  <span className="text-sm text-slate-400">{getRoleText(teacher.role)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="font-bold text-slate-800 mb-4">{'\uCD5C\uADFC \uD65C\uB3D9'}</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <p className="text-sm text-slate-400 mb-1">{'\uCD5C\uADFC \uBA54\uC2DC\uC9C0'}</p>
              <p className="text-lg font-bold text-slate-700">{formatDate(stats?.last_message_date || null)}</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-slate-400 mb-1">{'\uC774\uBC88\uB2EC \uBA54\uC2DC\uC9C0'}</p>
              <p className="text-lg font-bold text-slate-700">{stats?.monthly_messages || 0}{'\uAC74'}</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-slate-400 mb-1">{'\uCD5C\uADFC \uB9AC\uD3EC\uD2B8'}</p>
              <p className="text-lg font-bold text-slate-700">{formatDate(stats?.last_report_date || null)}</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-slate-400 mb-1">{'\uC774\uBC88\uB2EC \uB9AC\uD3EC\uD2B8'}</p>
              <p className="text-lg font-bold text-slate-700">{stats?.monthly_reports || 0}{'\uAC74'}</p>
            </div>
          </div>
        </div>

        {needReportStudents.length > 0 && (
          <div className="bg-orange-50 border border-orange-200 rounded-2xl p-6">
            <h2 className="font-bold text-orange-800 mb-4">{'\u26A0\uFE0F \uB9AC\uD3EC\uD2B8 \uD544\uC694 (2\uAC1C\uC6D4 \uACBD\uACFC)'}</h2>
            <div className="space-y-2">
              {needReportStudents.slice(0, 5).map(student => (
                <div 
                  key={student.id} 
                  onClick={() => router.push(`/students/${student.id}`)}
                  className="flex items-center justify-between py-2 px-3 bg-white rounded-xl cursor-pointer hover:bg-orange-100 transition"
                >
                  <div>
                    <span className="font-medium text-slate-700">{student.name}</span>
                    {student.class_name && (
                      <span className="text-xs text-slate-400 ml-2">{student.class_name}</span>
                    )}
                  </div>
                  <span className="text-sm text-orange-600">
                    {student.last_report_at ? formatDate(student.last_report_at) : '\uB9AC\uD3EC\uD2B8 \uC5C6\uC74C'}
                  </span>
                </div>
              ))}
              {needReportStudents.length > 5 && (
                <p className="text-sm text-orange-600 text-center pt-2">
                  +{needReportStudents.length - 5}{'\uBA85 \uB354'}
                </p>
              )}
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-bold text-slate-800">{'\uD559\uC0DD \uBAA9\uB85D'}</h2>
            <button 
              onClick={() => router.push(`/students?branch=${branchId}`)}
              className="text-sm text-teal-600 hover:text-teal-700"
            >
              {'\uC804\uCCB4\uBCF4\uAE30 \u2192'}
            </button>
          </div>
          
          <div className="divide-y divide-slate-100">
            {activeStudents.slice(0, 10).map(student => (
              <div 
                key={student.id}
                onClick={() => router.push(`/students/${student.id}`)}
                className="px-6 py-3 flex items-center justify-between hover:bg-slate-50 cursor-pointer transition"
              >
                <div className="flex items-center gap-3">
                  <span className="font-medium text-slate-700">{student.name}</span>
                  {student.class_name && (
                    <span className="text-xs text-slate-400">{student.class_name}</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(student.status)}`}>
                    {getStatusText(student.status)}
                  </span>
                  <span className="text-sm text-slate-400">
                    {student.last_report_at ? formatDate(student.last_report_at) : '-'}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {activeStudents.length > 10 && (
            <div className="px-6 py-3 bg-slate-50 text-center">
              <button 
                onClick={() => router.push(`/students?branch=${branchId}`)}
                className="text-sm text-slate-500 hover:text-slate-700"
              >
                +{activeStudents.length - 10}{'\uBA85 \uB354 \uBCF4\uAE30'}
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}