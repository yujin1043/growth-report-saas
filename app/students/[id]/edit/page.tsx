'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface ClassOption {
  id: string
  name: string
}

interface StatusHistory {
  id: string
  previous_status: string
  new_status: string
  changed_at: string
  memo: string
  changer_name: string
}

export default function EditStudentPage() {
  const router = useRouter()
  const params = useParams()
  const studentId = params.id as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [statusHistory, setStatusHistory] = useState<StatusHistory[]>([])
  const [originalStatus, setOriginalStatus] = useState('')
  const [statusMemo, setStatusMemo] = useState('')

  const [formData, setFormData] = useState({
    name: '',
    birth_year: '',
    class_id: '',
    parent_name: '',
    parent_phone: '',
    status: 'active',
    enrolled_at: ''
  })

  useEffect(() => {
    loadData()
  }, [studentId])

  async function loadData() {
    const { data: classData } = await supabase
      .from('classes')
      .select('id, name')
      .order('name')

    if (classData) setClasses(classData)

    const { data: student } = await supabase
      .from('students')
      .select('*')
      .eq('id', studentId)
      .single()

    if (student) {
      setFormData({
        name: student.name || '',
        birth_year: student.birth_year?.toString() || '',
        class_id: student.class_id || '',
        parent_name: student.parent_name || '',
        parent_phone: student.parent_phone || '',
        status: student.status || 'active',
        enrolled_at: student.enrolled_at || ''
      })
      setOriginalStatus(student.status || 'active')
    }

    const { data: historyData } = await supabase
      .from('student_status_history')
      .select('id, previous_status, new_status, changed_at, memo, changed_by')
      .eq('student_id', studentId)
      .order('changed_at', { ascending: false })

    if (historyData) {
      const historyWithNames: StatusHistory[] = []
      
      for (const h of historyData) {
        let changerName = '-'
        if (h.changed_by) {
          const { data: user } = await supabase
            .from('user_profiles')
            .select('name')
            .eq('id', h.changed_by)
            .single()
          changerName = user?.name || '-'
        }

        historyWithNames.push({
          id: h.id,
          previous_status: h.previous_status,
          new_status: h.new_status,
          changed_at: h.changed_at,
          memo: h.memo || '',
          changer_name: changerName
        })
      }

      setStatusHistory(historyWithNames)
    }

    setLoading(false)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  async function handleSave() {
    if (!formData.name.trim()) {
      alert('학생 이름을 입력해주세요.')
      return
    }

    setSaving(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()

      const { error } = await supabase
        .from('students')
        .update({
          name: formData.name,
          birth_year: parseInt(formData.birth_year),
          class_id: formData.class_id || null,
          parent_name: formData.parent_name || null,
          parent_phone: formData.parent_phone || null,
          status: formData.status,
          enrolled_at: formData.enrolled_at || null
        })
        .eq('id', studentId)

      if (error) {
        alert('수정 실패: ' + error.message)
        return
      }

      if (formData.status !== originalStatus) {
        await supabase
          .from('student_status_history')
          .insert({
            student_id: studentId,
            previous_status: originalStatus,
            new_status: formData.status,
            changed_by: user?.id,
            memo: statusMemo || null
          })
      }

      alert('학생 정보가 수정되었습니다!')
      router.push(`/students/${studentId}`)

    } catch (error) {
      alert('수정에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active': return '재원'
      case 'paused': return '휴원'
      case 'inactive': return '퇴원'
      default: return status
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <span className="px-2 py-1 bg-green-100 text-green-700 rounded-lg text-xs font-medium">재원</span>
      case 'paused':
        return <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-lg text-xs font-medium">휴원</span>
      case 'inactive':
        return <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium">퇴원</span>
      default:
        return null
    }
  }

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('ko-KR')
  }

  const currentYear = new Date().getFullYear()
  const yearOptions = Array.from({ length: 12 }, (_, i) => currentYear - 4 - i)

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-500 mx-auto mb-4"></div>
          <p className="text-gray-500">로딩 중...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <header className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-40 border-b border-gray-200/50">
        <div className="max-w-2xl mx-auto px-4 py-3 md:py-4">
          <div className="flex items-center justify-between">
            <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700 transition">
              ← 뒤로
            </button>
            <h1 className="text-base md:text-lg font-bold text-gray-800">학생 정보 수정</h1>
            <div className="w-10"></div>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="space-y-4">
          {/* 기본 정보 */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
            <h2 className="font-bold text-gray-800">기본 정보</h2>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                이름 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                className="w-full px-4 py-3 bg-gray-50 border-0 rounded-xl focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                출생년도 <span className="text-red-500">*</span>
              </label>
              <select
                name="birth_year"
                value={formData.birth_year}
                onChange={handleChange}
                className="w-full px-4 py-3 bg-gray-50 border-0 rounded-xl focus:ring-2 focus:ring-teal-500"
              >
                <option value="">선택하세요</option>
                {yearOptions.map(year => (
                  <option key={year} value={year}>{year}년 ({currentYear - year + 1}세)</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                반 <span className="text-red-500">*</span>
              </label>
              <select
                name="class_id"
                value={formData.class_id}
                onChange={handleChange}
                className="w-full px-4 py-3 bg-gray-50 border-0 rounded-xl focus:ring-2 focus:ring-teal-500"
              >
                <option value="">선택하세요</option>
                {classes.map(cls => (
                  <option key={cls.id} value={cls.id}>{cls.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                등록일 <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                name="enrolled_at"
                value={formData.enrolled_at}
                onChange={handleChange}
                className="w-full px-4 py-3 bg-gray-50 border-0 rounded-xl focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          {/* 상태 변경 */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
            <h2 className="font-bold text-gray-800">상태 변경</h2>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">현재 상태</label>
              <select
                name="status"
                value={formData.status}
                onChange={handleChange}
                className="w-full px-4 py-3 bg-gray-50 border-0 rounded-xl focus:ring-2 focus:ring-teal-500"
              >
                <option value="active">재원</option>
                <option value="paused">휴원</option>
                <option value="inactive">퇴원</option>
              </select>
            </div>

            {formData.status !== originalStatus && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                <p className="text-sm text-yellow-800 mb-2">
                  ⚠️ 상태가 <strong>{getStatusText(originalStatus)}</strong> → <strong>{getStatusText(formData.status)}</strong>로 변경됩니다.
                </p>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">변경 사유 (선택)</label>
                  <textarea
                    value={statusMemo}
                    onChange={(e) => setStatusMemo(e.target.value)}
                    placeholder="예: 개인 사정으로 휴원"
                    rows={2}
                    className="w-full px-4 py-3 bg-white border-0 rounded-xl focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* 학부모 정보 */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
            <h2 className="font-bold text-gray-800">학부모 정보</h2>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">학부모 이름</label>
              <input
                type="text"
                name="parent_name"
                value={formData.parent_name}
                onChange={handleChange}
                placeholder="학부모 이름"
                className="w-full px-4 py-3 bg-gray-50 border-0 rounded-xl focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">연락처</label>
              <input
                type="tel"
                name="parent_phone"
                value={formData.parent_phone}
                onChange={handleChange}
                placeholder="010-0000-0000"
                className="w-full px-4 py-3 bg-gray-50 border-0 rounded-xl focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          {/* 상태 변경 히스토리 */}
          {statusHistory.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
              <h2 className="font-bold text-gray-800">📋 상태 변경 히스토리</h2>
              <div className="space-y-3">
                {statusHistory.map(h => (
                  <div key={h.id} className="border-l-4 border-teal-500 pl-4 py-2">
                    <div className="flex items-center gap-2 mb-1">
                      {getStatusBadge(h.previous_status)}
                      <span className="text-gray-400">→</span>
                      {getStatusBadge(h.new_status)}
                    </div>
                    <p className="text-xs text-gray-500">
                      {formatDateTime(h.changed_at)} · {h.changer_name}
                    </p>
                    {h.memo && (
                      <p className="text-sm text-gray-600 mt-1">💬 {h.memo}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 버튼 */}
          <div className="flex gap-3">
            <button
              onClick={() => router.back()}
              className="flex-1 bg-gray-100 text-gray-700 py-4 rounded-2xl font-medium hover:bg-gray-200 transition"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 bg-gradient-to-r from-teal-500 to-cyan-500 text-white py-4 rounded-2xl font-medium hover:from-teal-600 hover:to-cyan-600 transition shadow-lg shadow-teal-500/30 disabled:opacity-50"
            >
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}