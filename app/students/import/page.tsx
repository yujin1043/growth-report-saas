'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import * as XLSX from 'xlsx'

interface ClassOption {
  id: string
  name: string
  branch_id: string
}

interface Branch {
  id: string
  name: string
  code: string
}

interface StudentRow {
  name: string
  age: number
  birth_year: number
  class_name: string
  parent_name?: string
  parent_phone?: string
  status: string
  isValid: boolean
  error?: string
}

// 나이/학년 텍스트를 숫자 나이로 변환
function parseAge(value: string | number): number | null {
  if (typeof value === 'number') {
    // 숫자가 2000 이상이면 출생년도로 간주
    if (value >= 2000) {
      return new Date().getFullYear() - value + 1
    }
    return value
  }
  
  const str = String(value).trim()
  
  // 숫자만 있는 경우
  const numOnly = parseInt(str)
  if (!isNaN(numOnly)) {
    if (numOnly >= 2000) {
      return new Date().getFullYear() - numOnly + 1
    }
    return numOnly
  }
  
  // "7세", "8세" 형식
  const ageMatch = str.match(/(\d+)\s*세/)
  if (ageMatch) return parseInt(ageMatch[1])
  
  // "유치부7세", "유치7세" 형식
  const kindergartenMatch = str.match(/유치\s*(?:부)?\s*(\d+)\s*세?/)
  if (kindergartenMatch) return parseInt(kindergartenMatch[1])
  
  // "초등1학년", "초1", "초등 1학년" 형식
  const elemMatch = str.match(/초\s*(?:등)?\s*(\d+)\s*(?:학년)?/)
  if (elemMatch) return parseInt(elemMatch[1]) + 7
  
  // "중등1학년", "중1" 형식
  const middleMatch = str.match(/중\s*(?:등|학)?\s*(\d+)\s*(?:학년)?/)
  if (middleMatch) return parseInt(middleMatch[1]) + 13
  
  return null
}

export default function ImportStudentsPage() {
  const router = useRouter()
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [students, setStudents] = useState<StudentRow[]>([])
  const [saving, setSaving] = useState(false)
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(true)
  
  // 사용자 정보
  const [userRole, setUserRole] = useState('')
  const [userBranchId, setUserBranchId] = useState<string | null>(null)
  const [userBranch, setUserBranch] = useState<Branch | null>(null)
  
  // 본사용: 선택된 지점
  const [selectedBranchId, setSelectedBranchId] = useState('')

  const currentYear = new Date().getFullYear()

  useEffect(() => {
    loadData()
  }, [])

  // 본사 계정: 지점 선택 시 해당 지점의 반 목록 로드
  useEffect(() => {
    if (userRole === 'admin' && selectedBranchId) {
      loadClassesByBranch(selectedBranchId)
    }
  }, [selectedBranchId, userRole])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      router.push('/login')
      return
    }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('branch_id, role')
      .eq('id', user.id)
      .single()

    if (profile) {
      setUserBranchId(profile.branch_id)
      setUserRole(profile.role)

      // 본사 계정: 모든 지점 로드
      if (profile.role === 'admin') {
        const { data: branchData } = await supabase
          .from('branches')
          .select('id, name, code')
          .order('name')

        if (branchData) setBranches(branchData)
      }
      // 일반 사용자: 소속 지점의 반 로드
      else if (profile.branch_id) {
        const { data: branchData } = await supabase
          .from('branches')
          .select('id, name, code')
          .eq('id', profile.branch_id)
          .single()

        if (branchData) setUserBranch(branchData)

        const { data: classData } = await supabase
          .from('classes')
          .select('id, name, branch_id')
          .eq('branch_id', profile.branch_id)
          .order('name')

        if (classData) setClasses(classData)
      }
    }

    setLoading(false)
  }

  async function loadClassesByBranch(branchId: string) {
    const { data: classData } = await supabase
      .from('classes')
      .select('id, name, branch_id')
      .eq('branch_id', branchId)
      .order('name')

    if (classData) setClasses(classData)

    const selectedBranch = branches.find(b => b.id === branchId)
    if (selectedBranch) setUserBranch(selectedBranch)
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
        
        // 나이 파싱 (나이, 학년, 출생년도 모두 지원)
        const ageValue = row['나이'] || row['학년'] || row['age'] || row['출생년도'] || row['birth_year'] || ''
        const parsedAge = parseAge(ageValue)
        
        const rawClassName = String(row['반'] || row['class'] || '').trim()
        const parentName = row['학부모'] || row['parent_name'] || ''
        const parentPhone = row['연락처'] || row['parent_phone'] || ''

        // 반 이름 유연 매칭: '01반', '1반', '1', '01' 등 모두 인식
        const matchClass = (input: string) => {
          if (!input) return null
          // 정확히 일치하면 바로 반환
          const exact = classes.find(c => c.name === input)
          if (exact) return exact.name

          // 숫자만 추출 (예: '01반' → '01', '1반' → '1', '01' → '01')
          const numMatch = input.replace(/[반班\s]/g, '').trim()
          
          for (const c of classes) {
            const classNum = c.name.replace(/[반班\s]/g, '').trim()
            // 숫자 비교 (앞의 0 제거해서 비교: '01' == '1')
            if (parseInt(numMatch) === parseInt(classNum) && !isNaN(parseInt(numMatch))) {
              return c.name
            }
            // 문자열 그대로 비교
            if (numMatch === classNum) {
              return c.name
            }
          }
          return null
        }

        const matchedClassName = matchClass(rawClassName)

        let isValid = true
        let error = ''

        if (!name) {
          isValid = false
          error = '이름 없음'
        } else if (!parsedAge || parsedAge < 4 || parsedAge > 20) {
          isValid = false
          error = '나이 오류 (4~20세)'
        } else if (!rawClassName) {
          isValid = false
          error = '반 없음'
        } else if (!matchedClassName) {
          isValid = false
          error = `존재하지 않는 반 (${rawClassName})`
        }

        return {
          name,
          age: parsedAge || 0,
          birth_year: parsedAge ? currentYear - parsedAge + 1 : 0,
          class_name: matchedClassName || rawClassName,
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
      // 지점 ID 결정
      const targetBranchId = userRole === 'admin' ? selectedBranchId : userBranchId

      // 해당 지점의 코드 가져오기
      const targetBranch = userRole === 'admin'
        ? branches.find(b => b.id === selectedBranchId)
        : userBranch

      if (!targetBranch?.code) {
        alert('지점 코드를 찾을 수 없습니다.')
        setSaving(false)
        return
      }

      const branchCode = targetBranch.code

      // 해당 지점코드로 시작하는 학생 중 마지막 번호 조회
      const { data: lastStudent } = await supabase
        .from('students')
        .select('student_code')
        .like('student_code', `${branchCode}%`)
        .order('student_code', { ascending: false })
        .limit(1)
        .single()

      let nextNum = 1
      if (lastStudent?.student_code) {
        const lastSeq = parseInt(lastStudent.student_code.substring(branchCode.length))
        if (!isNaN(lastSeq)) {
          nextNum = lastSeq + 1
        }
      }

      const today = new Date().toISOString().split('T')[0]

      for (const student of validStudents) {
        const classObj = classes.find(c => c.name === student.class_name)
        const studentCode = `${branchCode}${String(nextNum).padStart(4, '0')}`
        
        await supabase.from('students').insert({
          name: student.name,
          birth_year: student.birth_year,
          class_id: classObj?.id,
          branch_id: targetBranchId,
          parent_name: student.parent_name || null,
          parent_phone: student.parent_phone || null,
          status: 'active',
          student_code: studentCode,
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
      { '이름': '홍길동', '나이': '7세', '반': '01반', '학부모': '홍부모', '연락처': '010-1234-5678' },
      { '이름': '김철수', '나이': '초등1학년', '반': '01반', '학부모': '김부모', '연락처': '010-2345-6789' },
      { '이름': '이영희', '나이': '6', '반': '02반', '학부모': '이부모', '연락처': '010-3456-7890' },
    ]
    const ws = XLSX.utils.json_to_sheet(template)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '학생목록')
    XLSX.writeFile(wb, '학생등록_양식.xlsx')
  }

  const validCount = students.filter(s => s.isValid).length
  const invalidCount = students.filter(s => !s.isValid).length

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

  // 본사가 아닌데 지점이 없는 경우
  if (userRole !== 'admin' && !userBranchId) {
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
        <div className="max-w-4xl mx-auto px-4 py-12 text-center">
          <p className="text-4xl mb-4">⚠️</p>
          <p className="text-gray-600 mb-2">지점이 설정되지 않았습니다.</p>
          <p className="text-gray-500 text-sm">관리자에게 지점 배정을 요청해주세요.</p>
        </div>
      </div>
    )
  }

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
        
        {/* 본사 계정: 지점 선택 */}
        {userRole === 'admin' && step === 1 && (
          <div className="bg-purple-50 rounded-lg p-4 mb-6">
            <p className="text-sm text-purple-700 mb-3">
              🏢 <span className="font-bold">본사 계정</span> - 학생을 등록할 지점을 먼저 선택하세요
            </p>
            <select
              value={selectedBranchId}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              className="w-full px-4 py-3 bg-white border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500"
            >
              <option value="">지점을 선택하세요</option>
              {branches.map(branch => (
                <option key={branch.id} value={branch.id}>
                  {branch.name} ({branch.code})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* 일반 사용자: 소속 지점 표시 */}
        {userRole !== 'admin' && step === 1 && (
          <div className="bg-teal-50 rounded-lg p-4 mb-6">
            <p className="text-sm text-teal-700">
              📍 등록 지점: <span className="font-bold">{userBranch?.name}</span>
            </p>
          </div>
        )}

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

              {/* 본사는 지점 선택 필수 */}
              {userRole === 'admin' && !selectedBranchId ? (
                <div className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center">
                  <p className="text-gray-400">위에서 지점을 먼저 선택해주세요</p>
                </div>
              ) : (
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
              )}
            </div>

            <div className="bg-blue-50 rounded-lg p-4">
              <h3 className="font-bold text-blue-800 mb-2">📋 컬럼 안내</h3>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>• <strong>이름</strong> (필수)</li>
                <li>• <strong>나이</strong> (필수) - 예: 7, 7세, 유치부7세, 초등1학년, 초1</li>
                <li>• <strong>반</strong> (필수) - 예: 01반, 1반, 1, 01 모두 인식</li>
                <li>• 학부모 (선택)</li>
                <li>• 연락처 (선택)</li>
              </ul>
              <p className="text-xs text-blue-600 mt-3">
                💡 나이는 숫자(7), 세(7세), 학년(초등1학년, 초1), 유치부(유치부7세) 형식 모두 인식됩니다.
              </p>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            {/* 선택된 지점 표시 */}
            <div className={`${userRole === 'admin' ? 'bg-purple-50' : 'bg-teal-50'} rounded-lg p-4`}>
              <p className={`text-sm ${userRole === 'admin' ? 'text-purple-700' : 'text-teal-700'}`}>
                📍 등록 지점: <span className="font-bold">{userBranch?.name}</span>
              </p>
            </div>

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
                      <th className="px-3 py-2 text-left">나이</th>
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
                        <td className="px-3 py-2">{student.age ? `${student.age}세` : '-'}</td>
                        <td className="px-3 py-2 text-gray-500">{student.birth_year || '-'}</td>
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
