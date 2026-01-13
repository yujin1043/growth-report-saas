'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import * as XLSX from 'xlsx'

interface ClassOption {
  id: string
  name: string
}

interface StudentRow {
  name: string
  birth_year: number
  class_name: string
  parent_name?: string
  parent_phone?: string
  status: string
  isValid: boolean
  error?: string
}

export default function ImportStudentsPage() {
  const router = useRouter()
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [students, setStudents] = useState<StudentRow[]>([])
  const [saving, setSaving] = useState(false)
  const [step, setStep] = useState(1)

  useEffect(() => {
    loadClasses()
  }, [])

  async function loadClasses() {
    const { data } = await supabase
      .from('classes')
      .select('id, name')
      .order('name')
    if (data) setClasses(data)
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const data = event.target?.result
      const workbook = XLSX.read(data, { type: 'binary' })
      const sheetName = workbook.SheetNames[0]
      const sheet = workbook.Sheets[sheetName]
      const jsonData = XLSX.utils.sheet_to_json(sheet)

      const parsed: StudentRow[] = jsonData.map((row: any) => {
        const name = row['이름'] || row['name'] || ''
        const birthYear = parseInt(row['출생년도'] || row['birth_year'] || '0')
        const className = row['반'] || row['class'] || ''
        const parentName = row['학부모'] || row['parent_name'] || ''
        const parentPhone = row['연락처'] || row['parent_phone'] || ''

        let isValid = true
        let error = ''

        if (!name) {
          isValid = false
          error = '이름 없음'
        } else if (!birthYear || birthYear < 2000 || birthYear > 2025) {
          isValid = false
          error = '출생년도 오류'
        } else if (!className) {
          isValid = false
          error = '반 없음'
        } else if (!classes.find(c => c.name === className)) {
          isValid = false
          error = '존재하지 않는 반'
        }

        return {
          name,
          birth_year: birthYear,
          class_name: className,
          parent_name: parentName,
          parent_phone: parentPhone,
          status: 'active',
          isValid,
          error
        }
      })

      setStudents(parsed)
      setStep(2)
    }
    reader.readAsBinaryString(file)
  }

  async function handleImport() {
    const validStudents = students.filter(s => s.isValid)
    if (validStudents.length === 0) {
      alert('등록할 수 있는 학생이 없습니다.')
      return
    }

    setSaving(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('branch_id')
        .eq('id', user?.id)
        .single()

      const { data: lastStudent } = await supabase
        .from('students')
        .select('student_code')
        .order('student_code', { ascending: false })
        .limit(1)
        .single()

      let nextNum = 10001
      if (lastStudent?.student_code) {
        nextNum = parseInt(lastStudent.student_code) + 1
      }

      const today = new Date().toISOString().split('T')[0]

      for (const student of validStudents) {
        const classObj = classes.find(c => c.name === student.class_name)
        
        await supabase.from('students').insert({
          name: student.name,
          birth_year: student.birth_year,
          class_id: classObj?.id,
          branch_id: profile?.branch_id,
          parent_name: student.parent_name || null,
          parent_phone: student.parent_phone || null,
          status: 'active',
          student_code: String(nextNum).padStart(6, '0'),
          enrolled_at: today
        })

        nextNum++
      }

      alert(`${validStudents.length}명의 학생이 등록되었습니다!`)
      router.push('/students')

    } catch (error) {
      console.error('Error:', error)
      alert('등록 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  function downloadTemplate() {
    const template = [
      { '이름': '홍길동', '출생년도': 2018, '반': '01반', '학부모': '홍부모', '연락처': '010-1234-5678' },
      { '이름': '김철수', '출생년도': 2017, '반': '01반', '학부모': '김부모', '연락처': '010-2345-6789' },
    ]
    const ws = XLSX.utils.json_to_sheet(template)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '학생목록')
    XLSX.writeFile(wb, '학생등록_양식.xlsx')
  }

  const validCount = students.filter(s => s.isValid).length
  const invalidCount = students.filter(s => !s.isValid).length

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <button onClick={() => router.back()} className="text-gray-600">← 뒤로</button>
            <h1 className="text-lg font-bold">학생 일괄 등록</h1>
            <div className="w-10"></div>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {step === 1 && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-bold mb-4">📥 엑셀 파일 업로드</h2>
              
              <div className="mb-6">
                <p className="text-gray-600 mb-4">
                  엑셀 파일(.xlsx)을 업로드하면 여러 학생을 한번에 등록할 수 있습니다.
                </p>
                <button
                  onClick={downloadTemplate}
                  className="text-teal-600 hover:text-teal-700 font-medium"
                >
                  📄 양식 다운로드
                </button>
              </div>

              <label className="block">
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-teal-500 transition">
                  <p className="text-4xl mb-2">📁</p>
                  <p className="text-gray-600">클릭하여 엑셀 파일 선택</p>
                  <p className="text-sm text-gray-400 mt-1">.xlsx 파일만 지원</p>
                </div>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            <div className="bg-blue-50 rounded-lg p-4">
              <h3 className="font-bold text-blue-800 mb-2">📋 필수 컬럼</h3>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>• 이름 (필수)</li>
                <li>• 출생년도 (필수, 예: 2018)</li>
                <li>• 반 (필수, 예: 01반)</li>
                <li>• 학부모 (선택)</li>
                <li>• 연락처 (선택)</li>
              </ul>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-bold mb-4">📊 업로드 결과</h2>
              
              <div className="flex gap-4 mb-6">
                <div className="flex-1 bg-green-50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-green-600">{validCount}</p>
                  <p className="text-sm text-green-700">등록 가능</p>
                </div>
                <div className="flex-1 bg-red-50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-red-600">{invalidCount}</p>
                  <p className="text-sm text-red-700">오류</p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-3 py-2 text-left">상태</th>
                      <th className="px-3 py-2 text-left">이름</th>
                      <th className="px-3 py-2 text-left">출생년도</th>
                      <th className="px-3 py-2 text-left">반</th>
                      <th className="px-3 py-2 text-left">학부모</th>
                      <th className="px-3 py-2 text-left">오류</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {students.map((student, idx) => (
                      <tr key={idx} className={student.isValid ? '' : 'bg-red-50'}>
                        <td className="px-3 py-2">
                          {student.isValid ? (
                            <span className="text-green-600">✓</span>
                          ) : (
                            <span className="text-red-600">✗</span>
                          )}
                        </td>
                        <td className="px-3 py-2">{student.name || '-'}</td>
                        <td className="px-3 py-2">{student.birth_year || '-'}</td>
                        <td className="px-3 py-2">{student.class_name || '-'}</td>
                        <td className="px-3 py-2">{student.parent_name || '-'}</td>
                        <td className="px-3 py-2 text-red-600">{student.error || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setStep(1); setStudents([]) }}
                className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-lg font-medium hover:bg-gray-300"
              >
                다시 업로드
              </button>
              <button
                onClick={handleImport}
                disabled={saving || validCount === 0}
                className="flex-1 bg-teal-500 text-white py-3 rounded-lg font-medium hover:bg-teal-600 disabled:bg-gray-400"
              >
                {saving ? '등록 중...' : `${validCount}명 등록하기`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}