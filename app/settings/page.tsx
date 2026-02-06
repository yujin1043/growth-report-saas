'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function SettingsPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [formData, setFormData] = useState({
    newPassword: '',
    confirmPassword: ''
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()

    if (!formData.newPassword) {
      alert('새 비밀번호를 입력해주세요.')
      return
    }

    if (formData.newPassword.length < 6) {
      alert('비밀번호는 6자 이상이어야 합니다.')
      return
    }

    if (formData.newPassword !== formData.confirmPassword) {
      alert('새 비밀번호가 일치하지 않습니다.')
      return
    }

    setSaving(true)

    try {
      const { error } = await supabase.auth.updateUser({
        password: formData.newPassword
      })

      if (error) {
        alert('비밀번호 변경 실패: ' + error.message)
        return
      }

      alert('비밀번호가 변경되었습니다!')
      setFormData({
        newPassword: '',
        confirmPassword: ''
      })
    } catch (error) {
      alert('비밀번호 변경에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <header className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-40 border-b border-gray-200/50">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center justify-center min-h-[40px]">
            <h1 className="text-lg font-bold text-gray-800">⚙️ 설정</h1>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-4 md:py-6">
        <form onSubmit={handleChangePassword}>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 md:p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-gradient-to-br from-teal-400 to-cyan-500 rounded-xl flex items-center justify-center text-white text-lg shadow-lg shadow-teal-500/30">
                🔐
              </div>
              <div>
                <h2 className="font-bold text-gray-800">비밀번호 변경</h2>
                <p className="text-xs text-gray-500">새로운 비밀번호를 설정하세요</p>
              </div>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  새 비밀번호
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">🔒</span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="newPassword"
                    value={formData.newPassword}
                    onChange={handleChange}
                    placeholder="6자 이상 입력"
                    className="w-full pl-11 pr-12 py-3 bg-gray-50 border-0 rounded-xl focus:ring-2 focus:ring-teal-500 focus:bg-white transition text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
                  >
                    {showPassword ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  새 비밀번호 확인
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">🔒</span>
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    placeholder="비밀번호 다시 입력"
                    className="w-full pl-11 pr-12 py-3 bg-gray-50 border-0 rounded-xl focus:ring-2 focus:ring-teal-500 focus:bg-white transition text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
                  >
                    {showConfirmPassword ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>

              {formData.confirmPassword && (
                <div className={`flex items-center gap-2 text-sm ${
                  formData.newPassword === formData.confirmPassword 
                    ? 'text-teal-600' 
                    : 'text-rose-500'
                }`}>
                  {formData.newPassword === formData.confirmPassword ? (
                    <>✓ 비밀번호가 일치합니다</>
                  ) : (
                    <>✗ 비밀번호가 일치하지 않습니다</>
                  )}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full mt-6 bg-gradient-to-r from-teal-500 to-cyan-500 text-white py-3 rounded-xl font-medium hover:from-teal-600 hover:to-cyan-600 transition shadow-lg shadow-teal-500/30 disabled:opacity-50"
            >
              {saving ? '변경 중...' : '비밀번호 변경'}
            </button>
          </div>
        </form>

        <div className="mt-4 bg-white rounded-2xl shadow-sm border border-gray-100 p-5 md:p-6">
          <h3 className="font-semibold text-gray-800 mb-4">기타</h3>
          <button
            onClick={async () => {
              if (confirm('로그아웃 하시겠습니까?')) {
                await supabase.auth.signOut()
                router.push('/login')
              }
            }}
            className="w-full py-3 bg-gray-100 text-gray-600 rounded-xl font-medium hover:bg-gray-200 transition"
          >
            🚪 로그아웃
          </button>
        </div>
      </div>
    </div>
  )
}
