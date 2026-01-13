'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Branch {
  id: string
  name: string
  address: string | null
  phone: string | null
  class_count: number
}

interface ClassItem {
  id: string
  name: string
  code: string
  branch_id: string
}

export default function BranchesPage() {
  const router = useRouter()
  const [branches, setBranches] = useState<Branch[]>([])
  const [classes, setClasses] = useState<ClassItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  
  // 지점 모달
  const [showBranchModal, setShowBranchModal] = useState(false)
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null)
  const [branchForm, setBranchForm] = useState({ 
    name: '', 
    address: '', 
    phone: '',
    class_count: 1
  })

  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const { data: branchData } = await supabase
      .from('branches')
      .select('*')
      .order('name')

    if (branchData) setBranches(branchData)

    const { data: classData } = await supabase
      .from('classes')
      .select('*')
      .order('name')

    if (classData) setClasses(classData)

    setLoading(false)
  }

  function openBranchModal(branch?: Branch) {
    if (branch) {
      setEditingBranch(branch)
      setBranchForm({
        name: branch.name,
        address: branch.address || '',
        phone: branch.phone || '',
        class_count: branch.class_count || 1
      })
    } else {
      setEditingBranch(null)
      setBranchForm({ name: '', address: '', phone: '', class_count: 1 })
    }
    setShowBranchModal(true)
  }

  async function handleSaveBranch() {
    if (!branchForm.name.trim()) {
      alert('지점명을 입력해주세요.')
      return
    }

    setSaving(true)

    try {
      if (editingBranch) {
        const { error } = await supabase
          .from('branches')
          .update({
            name: branchForm.name,
            address: branchForm.address || null,
            phone: branchForm.phone || null,
            class_count: branchForm.class_count
          })
          .eq('id', editingBranch.id)

        if (error) {
          alert('수정 실패: ' + error.message)
          setSaving(false)
          return
        }

        await adjustClasses(editingBranch.id, branchForm.name, branchForm.class_count)
        alert('지점이 수정되었습니다!')
      } else {
        const { data: newBranch, error } = await supabase
          .from('branches')
          .insert({
            name: branchForm.name,
            address: branchForm.address || null,
            phone: branchForm.phone || null,
            class_count: branchForm.class_count
          })
          .select()
          .single()

        if (error) {
          alert('등록 실패: ' + error.message)
          setSaving(false)
          return
        }

        await createClassesForBranch(newBranch.id, branchForm.name, branchForm.class_count)
        alert('지점이 등록되었습니다!')
      }

      setShowBranchModal(false)
      loadData()
    } catch (error) {
      console.error(error)
      alert('저장에 실패했습니다.')
    }

    setSaving(false)
  }

  async function createClassesForBranch(branchId: string, branchName: string, count: number) {
    for (let i = 1; i <= count; i++) {
      const className = `${String(i).padStart(2, '0')}반`
      const classCode = `${branchName}_${className}`.replace(/\s/g, '')
      
      await supabase.from('classes').insert({
        name: className,
        code: classCode,
        branch_id: branchId
      })
    }
  }

  async function adjustClasses(branchId: string, branchName: string, newCount: number) {
    const branchClasses = classes.filter(c => c.branch_id === branchId)
    const currentCount = branchClasses.length

    if (newCount > currentCount) {
      for (let i = currentCount + 1; i <= newCount; i++) {
        const className = `${String(i).padStart(2, '0')}반`
        const classCode = `${branchName}_${className}`.replace(/\s/g, '')
        
        await supabase.from('classes').insert({
          name: className,
          code: classCode,
          branch_id: branchId
        })
      }
    } else if (newCount < currentCount) {
      const classesToDelete = branchClasses
        .sort((a, b) => b.name.localeCompare(a.name))
        .slice(0, currentCount - newCount)

      for (const cls of classesToDelete) {
        const { count } = await supabase
          .from('students')
          .select('*', { count: 'exact', head: true })
          .eq('class_id', cls.id)

        if (count && count > 0) {
          alert(`"${cls.name}"에 학생이 있어 삭제할 수 없습니다.\n먼저 학생을 다른 반으로 이동해주세요.`)
          return
        }

        await supabase.from('classes').delete().eq('id', cls.id)
      }
    }
  }

  async function handleDeleteBranch(id: string, name: string) {
    const { count: studentCount } = await supabase
      .from('students')
      .select('*', { count: 'exact', head: true })
      .eq('branch_id', id)

    if (studentCount && studentCount > 0) {
      alert(`"${name}" 지점에 ${studentCount}명의 학생이 있습니다.\n먼저 학생을 다른 지점으로 이동해주세요.`)
      return
    }
    
    if (!confirm(`"${name}" 지점을 삭제하시겠습니까?\n해당 지점의 모든 반도 함께 삭제됩니다.`)) return

    await supabase.from('classes').delete().eq('branch_id', id)

    const { error } = await supabase
      .from('branches')
      .delete()
      .eq('id', id)

    if (error) {
      alert('삭제 실패: ' + error.message)
    } else {
      loadData()
    }
  }

  // 검색 필터링
  const filteredBranches = branches.filter(branch => 
    branch.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (branch.address && branch.address.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><p>로딩 중...</p></div>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <button onClick={() => router.push('/dashboard')} className="text-gray-600">← 대시보드</button>
            <h1 className="text-lg font-bold">지점/반 관리</h1>
            <div className="w-10"></div>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* 검색 및 추가 */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex gap-3">
            <div className="flex-1">
              <input
                type="text"
                placeholder="🔍 지점명 또는 주소로 검색"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
            </div>
            <button
              onClick={() => openBranchModal()}
              className="bg-teal-500 text-white px-4 py-2 rounded-lg font-medium hover:bg-teal-600 whitespace-nowrap"
            >
              + 새 지점
            </button>
          </div>
        </div>

        {/* 지점 수 표시 */}
        <div className="mb-4 text-sm text-gray-600">
          {searchTerm ? (
            <>검색 결과: <span className="font-bold text-teal-600">{filteredBranches.length}</span>개 지점</>
          ) : (
            <>총 <span className="font-bold text-teal-600">{branches.length}</span>개 지점</>
          )}
        </div>

        {/* 지점 목록 */}
        <div className="bg-white rounded-lg shadow">
          <div className="divide-y">
            {filteredBranches.map(branch => {
              const branchClasses = classes.filter(c => c.branch_id === branch.id)
              return (
                <div key={branch.id} className="px-6 py-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <p className="font-bold text-lg">{branch.name}</p>
                        <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">
                          {branchClasses.length}개 반
                        </span>
                      </div>
                      {branch.address && (
                        <p className="text-sm text-gray-500 mb-1">📍 {branch.address}</p>
                      )}
                      {branch.phone && (
                        <p className="text-sm text-gray-500 mb-2">📞 {branch.phone}</p>
                      )}
                      <div className="flex flex-wrap gap-2 mt-3">
                        {branchClasses
                          .sort((a, b) => a.name.localeCompare(b.name))
                          .map(cls => (
                            <span 
                              key={cls.id} 
                              className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm"
                            >
                              {cls.name}
                            </span>
                          ))
                        }
                      </div>
                    </div>
                    <div className="flex gap-2 ml-4">
                      <button
                        onClick={() => openBranchModal(branch)}
                        className="text-teal-600 hover:text-teal-700 text-sm font-medium"
                      >
                        수정
                      </button>
                      <button
                        onClick={() => handleDeleteBranch(branch.id, branch.name)}
                        className="text-red-500 hover:text-red-700 text-sm font-medium"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
            {filteredBranches.length === 0 && (
              <div className="px-6 py-12 text-center text-gray-500">
                {searchTerm ? (
                  <>
                    <p className="text-4xl mb-2">🔍</p>
                    <p>"{searchTerm}" 검색 결과가 없습니다</p>
                  </>
                ) : (
                  <>
                    <p className="text-4xl mb-2">🏢</p>
                    <p>등록된 지점이 없습니다</p>
                    <p className="text-sm mt-1">새 지점을 추가해보세요!</p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 지점 추가/수정 모달 */}
      {showBranchModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6">
            <h3 className="text-lg font-bold mb-4">
              🏢 {editingBranch ? '지점 수정' : '새 지점 추가'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  지점명 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={branchForm.name}
                  onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })}
                  placeholder="강남점"
                  className="w-full px-4 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">주소</label>
                <input
                  type="text"
                  value={branchForm.address}
                  onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })}
                  placeholder="서울시 강남구..."
                  className="w-full px-4 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">전화번호</label>
                <input
                  type="tel"
                  value={branchForm.phone}
                  onChange={(e) => setBranchForm({ ...branchForm, phone: e.target.value })}
                  placeholder="02-1234-5678"
                  className="w-full px-4 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  반 개수 <span className="text-red-500">*</span>
                </label>
                <select
                  value={branchForm.class_count}
                  onChange={(e) => setBranchForm({ ...branchForm, class_count: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 border rounded-lg"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                    <option key={num} value={num}>{num}개 반</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  01반 ~ {String(branchForm.class_count).padStart(2, '0')}반이 자동 생성됩니다.
                </p>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowBranchModal(false)}
                className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg hover:bg-gray-300"
              >
                취소
              </button>
              <button
                onClick={handleSaveBranch}
                disabled={saving}
                className="flex-1 bg-teal-500 text-white py-2 rounded-lg hover:bg-teal-600 disabled:bg-gray-400"
              >
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}