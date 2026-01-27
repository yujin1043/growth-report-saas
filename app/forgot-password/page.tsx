'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function ForgotPasswordPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!email.trim()) {
      setError('이메일을 입력해주세요.')
      return
    }

    setLoading(true)

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })

      if (error) {
        setError('비밀번호 재설정 이메일 발송에 실패했습니다.')
        setLoading(false)
        return
      }

      setSent(true)
    } catch (err) {
      setError('오류가 발생했습니다. 다시 시도해주세요.')
    } finally {
      setLoading(false)
    }
  }

  // 발송 완료 화면
  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
            <div className="w-16 h-16 bg-gradient-to-br from-teal-400 to-cyan-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-teal-500/30">
              <span className="text-3xl">✉️</span>
            </div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">이메일을 확인하세요</h2>
            <p className="text-gray-600 mb-6">
              <span className="font-medium text-teal-600">{email}</span>으로<br />
              비밀번호 재설정 링크를 보내드렸습니다.
            </p>
            <div className="bg-amber-50 rounded-xl p-4 mb-6 text-left">
              <p className="text-sm text-amber-800">
                💡 <strong>안내사항</strong>
              </p>
              <ul className="text-sm text-amber-700 mt-2 space-y-1">
                <li>• 이메일이 도착하지 않으면 스팸함을 확인해주세요.</li>
                <li>• 링크는 24시간 동안 유효합니다.</li>
              </ul>
            </div>
            <button
              onClick={() => router.push('/login')}
              className="w-full bg-gradient-to-r from-teal-500 to-cyan-500 text-white py-3 rounded-xl font-medium hover:from-teal-600 hover:to-cyan-600 transition shadow-lg shadow-teal-500/30"
            >
              로그인으로 돌아가기
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* 헤더 */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-teal-400 to-cyan-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-teal-500/30">
              <span className="text-3xl">🔐</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-800">비밀번호 찾기</h1>
            <p className="text-gray-500 mt-2">
              가입하신 이메일을 입력하시면<br />
              비밀번호 재설정 링크를 보내드립니다.
            </p>
          </div>

          {/* 폼 */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                이메일
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">📧</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@email.com"
                  className="w-full pl-12 pr-4 py-3 bg-gray-50 border-0 rounded-xl focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>

            {error && (
              <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm">
                ⚠️ {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-teal-500 to-cyan-500 text-white py-3 rounded-xl font-medium hover:from-teal-600 hover:to-cyan-600 transition shadow-lg shadow-teal-500/30 disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  발송 중...
                </span>
              ) : '비밀번호 재설정 링크 받기'}
            </button>
          </form>

          {/* 하단 링크 */}
          <div className="mt-6 text-center">
            <button 
              onClick={() => router.push('/login')}
              className="text-sm text-gray-500 hover:text-teal-600 transition"
            >
              ← 로그인으로 돌아가기
            </button>
          </div>
        </div>

        <p className="text-center text-gray-400 text-sm mt-6">
          문의: contact@grimaart.com
        </p>
      </div>
    </div>
  )
}
