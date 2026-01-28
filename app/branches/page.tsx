'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useUserContext } from '@/lib/UserContext'

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
  const { userRole, isLoading: userLoading } = useUserContext()
  
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

  // 권한 체크: admin만 접근 가능
  useEffect(() => {
    if (!userLoading && userRole !== 'admin') {
      router.push('/dashboard')
    }
  }, [userLoading, userRole, router])

  useEffect(() => {
    if (!userLoading && userRole === 'admin') {
      loadData()
    }
  }, [userLoading, userRole])

  async function loadData() {
    // 모든 데이터를 병렬로 가져오기 (성능 최적화)
    const [branchResult, classResult] = await Promise.all([
      supabase.from('branches').select('*').order('name'),
      supabase.from('classes').select('*').order('name')
    ])

    if (branchResult.data) setBranches(branchResult.data)
    if (classResult.data) setClasses(classResult.data)

    setLoading(false)
  }

  // admin 아니면 로딩 표시 (리다이렉트 전)
  if (userLoading || userRole !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-500 mx-auto mb-4"></div>
          <p className="text-slate-500">로딩 중...</p>
        </div>
      </div>
    )
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
    const classInserts = Array.from({ length: count }, (_, i) => {
      const className = `${String(i + 1).padStart(2, '0')}반`
      const classCode = `${branchName}_${className}`.replace(/\s/g, '')
      return { name: className, code: classCode, branch_id: branchId }
    })

    await supabase.from('classes').insert(classInserts)
  }

  async function adjustClasses(branchId: string, branchName: string, newCount: number) {
    const branchClasses = classes.filter(c => c.branch_id === branchId)
    const currentCount = branchClasses.length

    if (newCount > currentCount) {
      const classInserts = Array.from({ length: newCount - currentCount }, (_, i) => {
        const num = currentCount + i + 1
        const className = `${String(num).padStart(2, '0')}반`
        const classCode = `${branchName}_${className}`.replace(/\s/g, '')
        return { name: className, code: classCode, branch_id: branchId }
      })

      await supabase.from('classes').insert(classInserts)
    } else if (newCount < currentCount) {
      const classesToDelete = branchClasses
        .sort((a, b) => b.name.localeCompare(a.name))
        .slice(0, currentCount - newCount)

      const studentCountChecks = await Promise.all(
        classesToDelete.map(cls =>
          supabase.from('students')
            .select('*', { count: 'exact', head: true }).eq('class_id', cls.id)
            .then(result => ({ cls, count: result.count || 0 }))
        )
      )

      const classWithStudents = studentCountChecks.find(item => item.count > 0)
      if (classWithStudents) {
        alert(`"${classWithStudents.cls.name}"에 학생이 있어 삭제할 수 없습니다.\n먼저 학생을 다른 반으로 이동해주세요.`)
        return
      }

      await Promise.all(
        classesToDelete.map(cls => supabase.from('classes').delete().eq('id', cls.id))
      )
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
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-500 mx-auto mb-4"></div>
          <p className="text-gray-500">로딩 중...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* 헤더 - 다른 페이지와 통일 */}
      <header className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-40 border-b border-gray-200/50">
        <div className="max-w-4xl mx-auto px-4 py-3 md:py-4">
          <div className="flex items-center justify-between">
            <button 
              onClick={() => router.push('/dashboard')} 
              className="text-gray-500 hover:text-gray-700 transition text-sm md:text-base"
            >
              ← 대시보드
            </button>
            <h1 className="text-base md:text-lg font-bold text-gray-800">지점/반 관리</h1>
            <div className="w-16 md:w-20"></div>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-4 md:py-6">
        {/* 검색 및 추가 - 통일된 스타일 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-5 mb-4 md:mb-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
              <input
                type="text"
                placeholder="지점명 또는 주소로 검색"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-gray-50 border-0 rounded-xl focus:ring-2 focus:ring-teal-500 text-sm md:text-base"
              />
            </div>
            <button
              onClick={() => openBranchModal()}
              className="bg-gradient-to-r from-teal-500 to-cyan-500 text-white px-5 py-3 rounded-xl font-medium hover:from-teal-600 hover:to-cyan-600 transition shadow-lg shadow-teal-500/30 whitespace-nowrap text-sm md:text-base"
            >
              + 새 지점
            </button>
          </div>
        </div>

        {/* 지점 수 표시 */}
        <div className="mb-4 text-sm text-gray-600 px-1">
          {searchTerm ? (
            <>검색 결과: <span className="font-bold text-teal-600">{filteredBranches.length}</span>개 지점</>
          ) : (
            <>총 <span className="font-bold text-teal-600">{branches.length}</span>개 지점</>
          )}
        </div>

        {/* 지점 목록 - 통일된 카드 스타일 */}
        <div className="space-y-4">
          {filteredBranches.map(branch => {
            const branchClasses = classes.filter(c => c.branch_id === branch.id)
            return (
              <div 
                key={branch.id} 
                className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-5 hover:shadow-md transition"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 bg-gradient-to-br from-purple-400 to-indigo-500 rounded-xl flex items-center justify-center text-white font-bold shadow-lg shadow-purple-500/30">
                        {branch.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-bold text-gray-800 text-base md:text-lg">{branch.name}</p>
                        <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">
                          {branchClasses.length}개 반
                        </span>
                      </div>
                    </div>
                    
                    {(branch.address || branch.phone) && (
                      <div className="ml-13 space-y-1 mt-3">
                        {branch.address && (
                          <p className="text-sm text-gray-500 flex items-center gap-2">
                            <span>📍</span> {branch.address}
                          </p>
                        )}
                        {branch.phone && (
                          <p className="text-sm text-gray-500 flex items-center gap-2">
                            <span>📞</span> {branch.phone}
                          </p>
                        )}
                      </div>
                    )}
                    
                    {/* 반 목록 */}
                    <div className="flex flex-wrap gap-2 mt-4">
                      {branchClasses
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map(cls => (
                          <span 
                            key={cls.id} 
                            className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium"
                          >
                            {cls.name}
                          </span>
                        ))
                      }
                    </div>
                  </div>
                  
                  {/* 액션 버튼 */}
                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => openBranchModal(branch)}
                      className="px-4 py-2 bg-teal-50 text-teal-600 rounded-xl text-sm font-medium hover:bg-teal-100 transition"
                    >
                      수정
                    </button>
                    <button
                      onClick={() => handleDeleteBranch(branch.id, branch.name)}
                      className="px-4 py-2 bg-red-50 text-red-500 rounded-xl text-sm font-medium hover:bg-red-100 transition"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
          
          {/* 빈 상태 */}
          {filteredBranches.length === 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center text-gray-500">
              {searchTerm ? (
                <>
                  <p className="text-4xl mb-3">🔍</p>
                  <p className="font-medium">"{searchTerm}" 검색 결과가 없습니다</p>
                </>
              ) : (
                <>
                  <p className="text-4xl mb-3">🏢</p>
                  <p className="font-medium">등록된 지점이 없습니다</p>
                  <p className="text-sm mt-1">새 지점을 추가해보세요!</p>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 지점 추가/수정 모달 - 통일된 스타일 */}
      {showBranchModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            {/* 모달 헤더 */}
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-800">
                🏢 {editingBranch ? '지점 수정' : '새 지점 추가'}
              </h3>
              <button 
                onClick={() => setShowBranchModal(false)}
                className="text-gray-400 hover:text-gray-600 text-xl"
              >
                ✕
              </button>
            </div>
            
            {/* 모달 내용 */}
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  지점명 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={branchForm.name}
                  onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })}
                  placeholder="강남점"
                  className="w-full px-4 py-3 bg-gray-50 border-0 rounded-xl focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">주소</label>
                <input
                  type="text"
                  value={branchForm.address}
                  onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })}
                  placeholder="서울시 강남구..."
                  className="w-full px-4 py-3 bg-gray-50 border-0 rounded-xl focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">전화번호</label>
                <input
                  type="tel"
                  value={branchForm.phone}
                  onChange={(e) => setBranchForm({ ...branchForm, phone: e.target.value })}
                  placeholder="02-1234-5678"
                  className="w-full px-4 py-3 bg-gray-50 border-0 rounded-xl focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  반 개수 <span className="text-red-500">*</span>
                </label>
                <select
                  value={branchForm.class_count}
                  onChange={(e) => setBranchForm({ ...branchForm, class_count: parseInt(e.target.value) })}
                  className="w-full px-4 py-3 bg-gray-50 border-0 rounded-xl focus:ring-2 focus:ring-teal-500"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                    <option key={num} value={num}>{num}개 반</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-2">
                  💡 01반 ~ {String(branchForm.class_count).padStart(2, '0')}반이 자동 생성됩니다.
                </p>
              </div>
            </div>
            
            {/* 모달 푸터 */}
            <div className="px-5 py-4 bg-gray-50 flex gap-3">
              <button
                onClick={() => setShowBranchModal(false)}
                className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-xl font-medium hover:bg-gray-300 transition"
              >
                취소
              </button>
              <button
                onClick={handleSaveBranch}
                disabled={saving}
                className="flex-1 bg-gradient-to-r from-teal-500 to-cyan-500 text-white py-3 rounded-xl font-medium hover:from-teal-600 hover:to-cyan-600 transition shadow-lg shadow-teal-500/30 disabled:opacity-50"
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
