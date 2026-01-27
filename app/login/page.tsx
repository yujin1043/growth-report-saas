'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // 이미 로그인 되어있으면 대시보드로 이동
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        router.push('/dashboard')
      }
    })
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (error) {
      setError('이메일 또는 비밀번호가 올바르지 않습니다.')
      setLoading(false)
      return
    }

    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen flex">
      {/* 왼쪽: 브랜드 영역 */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-teal-500 via-teal-600 to-cyan-600 p-12 flex-col justify-between">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2 flex items-center gap-3">
            <span>🎨</span>
            그리마노트
          </h1>
          <p className="text-teal-100 text-lg">그리마미술 학생 관리 시스템</p>
        </div>
        
        <div className="space-y-8">
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6">
            <h3 className="text-white font-bold text-xl mb-4">
              ✨ 아이들의 성장을 기록하세요
            </h3>
            <ul className="space-y-3 text-teal-50">
              <li className="flex items-center gap-3">
                <span className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center text-sm">✓</span>
                일일 수업 메시지 발송
              </li>
              <li className="flex items-center gap-3">
                <span className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center text-sm">✓</span>
                AI 기반 성장 리포트 생성
              </li>
              <li className="flex items-center gap-3">
                <span className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center text-sm">✓</span>
                학생별 상담 일지 관리
              </li>
            </ul>
          </div>
        </div>

        <p className="text-teal-200 text-sm">
          © 2026 그리마미술. All rights reserved.
        </p>
      </div>

      {/* 오른쪽: 로그인 폼 */}
      <div className="flex-1 flex items-center justify-center p-8 bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="w-full max-w-md">
          {/* 모바일 로고 */}
          <div className="lg:hidden text-center mb-8">
            <h1 className="text-3xl font-bold text-teal-600 flex items-center justify-center gap-2">
              <span>🎨</span>
              그리마노트
            </h1>
            <p className="text-gray-500 mt-1">그리마미술 학생 관리 시스템</p>
          </div>

          <div className="bg-white rounded-2xl shadow-xl p-8">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-800">로그인</h2>
              <p className="text-gray-500 mt-1">계정에 로그인하세요</p>
            </div>

            {error && (
              <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl mb-6 text-sm">
                ⚠️ {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-5">
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
                    required
                    className="w-full pl-12 pr-4 py-3 bg-gray-50 border-0 rounded-xl focus:ring-2 focus:ring-teal-500 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  비밀번호
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">🔒</span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full pl-12 pr-12 py-3 bg-gray-50 border-0 rounded-xl focus:ring-2 focus:ring-teal-500 transition"
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
                    로그인 중...
                  </span>
                ) : '로그인'}
              </button>
            </form>

            {/* 비밀번호 찾기 링크 추가 */}
            <div className="mt-6 text-center">
              <button 
                onClick={() => router.push('/forgot-password')}
                className="text-sm text-gray-500 hover:text-teal-600 transition"
              >
                비밀번호를 잊으셨나요?
              </button>
            </div>
          </div>

          <p className="text-center text-gray-400 text-sm mt-8">
            문의: contact@grimaart.com
          </p>
        </div>
      </div>
    </div>
  )
}
