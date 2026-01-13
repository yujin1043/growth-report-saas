'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Student {
  id: string
  name: string
  birth_year: number
}

export default function EditReportPage() {
  const router = useRouter()
  const params = useParams()
  const reportId = params.id as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [student, setStudent] = useState<Student | null>(null)

  const [formData, setFormData] = useState({
    period_start: '',
    period_end: '',
    content_form: '',
    content_color: '',
    content_expression: '',
    content_strength: '',
    content_attitude: '',
    content_direction: '',
    teacher_memo: '',
    parent_request: ''
  })

  const currentYear = new Date().getFullYear()

  useEffect(() => {
    loadReport()
  }, [reportId])

  async function loadReport() {
    const { data: report } = await supabase
      .from('reports')
      .select('*')
      .eq('id', reportId)
      .single()

    if (!report) {
      alert('리포트를 찾을 수 없습니다.')
      router.back()
      return
    }

    setFormData({
      period_start: report.period_start || '',
      period_end: report.period_end || '',
      content_form: report.content_form || '',
      content_color: report.content_color || '',
      content_expression: report.content_expression || '',
      content_strength: report.content_strength || '',
      content_attitude: report.content_attitude || '',
      content_direction: report.content_direction || '',
      teacher_memo: report.teacher_memo || '',
      parent_request: report.parent_request || ''
    })

    // 학생 정보 조회
    if (report.student_id) {
      const { data: studentData } = await supabase
        .from('students')
        .select('id, name, birth_year')
        .eq('id', report.student_id)
        .single()

      if (studentData) setStudent(studentData)
    }

    setLoading(false)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  async function handleSave() {
    if (!formData.period_start || !formData.period_end) {
      alert('지도 기간을 입력해주세요.')
      return
    }

    setSaving(true)

    try {
      const { error } = await supabase
        .from('reports')
        .update({
          period_start: formData.period_start,
          period_end: formData.period_end,
          content_form: formData.content_form,
          content_color: formData.content_color,
          content_expression: formData.content_expression,
          content_strength: formData.content_strength,
          content_attitude: formData.content_attitude,
          content_direction: formData.content_direction,
          teacher_memo: formData.teacher_memo,
          parent_request: formData.parent_request
        })
        .eq('id', reportId)

      if (error) {
        alert('저장 실패: ' + error.message)
        return
      }

      alert('리포트가 수정되었습니다!')
      router.push(`/reports/${reportId}`)

    } catch (error) {
      alert('저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const getAge = (birthYear: number) => currentYear - birthYear + 1

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><p>로딩 중...</p></div>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <button onClick={() => router.back()} className="text-gray-600">← 뒤로</button>
            <h1 className="text-lg font-bold">리포트 수정</h1>
            <div className="w-10"></div>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* 학생 정보 */}
        {student && (
          <div className="bg-teal-50 rounded-lg p-4 mb-6">
            <p className="font-bold text-teal-800">
              {student.name} ({getAge(student.birth_year)}세)
            </p>
          </div>
        )}

        {/* 지도 기간 */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-bold mb-4">📅 지도 기간</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">시작일</label>
              <input
                type="date"
                name="period_start"
                value={formData.period_start}
                onChange={handleChange}
                className="w-full px-4 py-2 border rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">종료일</label>
              <input
                type="date"
                name="period_end"
                value={formData.period_end}
                onChange={handleChange}
                className="w-full px-4 py-2 border rounded-lg"
              />
            </div>
          </div>
        </div>

        {/* 작품 변화 */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-bold mb-4">🎨 작품 변화</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">형태</label>
              <textarea
                name="content_form"
                value={formData.content_form}
                onChange={handleChange}
                rows={3}
                className="w-full px-4 py-2 border rounded-lg"
                placeholder="형태 표현의 변화를 작성해주세요"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">색채</label>
              <textarea
                name="content_color"
                value={formData.content_color}
                onChange={handleChange}
                rows={3}
                className="w-full px-4 py-2 border rounded-lg"
                placeholder="색채 사용의 변화를 작성해주세요"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">표현</label>
              <textarea
                name="content_expression"
                value={formData.content_expression}
                onChange={handleChange}
                rows={3}
                className="w-full px-4 py-2 border rounded-lg"
                placeholder="표현력의 변화를 작성해주세요"
              />
            </div>
          </div>
        </div>

        {/* 지도교사 코멘트 */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-bold mb-4">💬 지도교사 코멘트</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">강점</label>
              <textarea
                name="content_strength"
                value={formData.content_strength}
                onChange={handleChange}
                rows={3}
                className="w-full px-4 py-2 border rounded-lg"
                placeholder="학생의 강점을 작성해주세요"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">수업 태도 및 감성</label>
              <textarea
                name="content_attitude"
                value={formData.content_attitude}
                onChange={handleChange}
                rows={3}
                className="w-full px-4 py-2 border rounded-lg"
                placeholder="수업 태도와 감성적 특징을 작성해주세요"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">향후 지도방향</label>
              <textarea
                name="content_direction"
                value={formData.content_direction}
                onChange={handleChange}
                rows={3}
                className="w-full px-4 py-2 border rounded-lg"
                placeholder="향후 지도 방향을 작성해주세요"
              />
            </div>
          </div>
        </div>

        {/* 메모 */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-bold mb-4">📝 참고 사항</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">교사 메모 (내부용)</label>
              <textarea
                name="teacher_memo"
                value={formData.teacher_memo}
                onChange={handleChange}
                rows={2}
                className="w-full px-4 py-2 border rounded-lg"
                placeholder="PDF에 표시되지 않는 내부 메모입니다"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">학부모 요청사항</label>
              <textarea
                name="parent_request"
                value={formData.parent_request}
                onChange={handleChange}
                rows={2}
                className="w-full px-4 py-2 border rounded-lg"
                placeholder="학부모의 요청사항이 있다면 기록해주세요"
              />
            </div>
          </div>
        </div>

        {/* 버튼 */}
        <div className="flex gap-3">
          <button
            onClick={() => router.back()}
            className="flex-1 bg-gray-200 text-gray-700 py-4 rounded-lg font-medium hover:bg-gray-300"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-teal-500 text-white py-4 rounded-lg font-medium hover:bg-teal-600 disabled:bg-gray-400"
          >
            {saving ? '저장 중...' : '💾 저장'}
          </button>
        </div>
      </div>
    </div>
  )
}