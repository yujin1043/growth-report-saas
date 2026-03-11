import React from 'react'

export function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, string> = {
    admin: 'bg-purple-100 text-purple-700',
    director: 'bg-indigo-100 text-indigo-700',
    manager: 'bg-blue-100 text-blue-700',
    teacher: 'bg-green-100 text-green-700',
  }
  const labels: Record<string, string> = {
    admin: '본사',
    director: '원장',
    manager: '실장',
    teacher: '강사',
  }
  return (
    <span className={`px-2 py-1 rounded-full text-xs ${styles[role] || 'bg-gray-100 text-gray-700'}`}>
      {labels[role] || role}
    </span>
  )
}

export function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    inactive: 'bg-gray-100 text-gray-700',
    paused: 'bg-yellow-100 text-yellow-700',
  }
  const labels: Record<string, string> = {
    active: '활성',
    inactive: '비활성',
    paused: '휴원',
  }
  return (
    <span className={`px-2 py-1 rounded-full text-xs ${styles[status] || 'bg-gray-100 text-gray-700'}`}>
      {labels[status] || status}
    </span>
  )
}

export function StudentStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    paused: 'bg-amber-100 text-amber-700 border-amber-200',
    inactive: 'bg-gray-100 text-gray-500 border-gray-200',
  }
  const labels: Record<string, string> = {
    active: '재원',
    paused: '휴원',
    inactive: '퇴원',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs border ${styles[status] || 'bg-gray-100 text-gray-500 border-gray-200'}`}>
      {labels[status] || status}
    </span>
  )
}
