'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('App error:', error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 p-4">
      <div className="w-full max-w-md text-center">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <span className="text-3xl">⚠️</span>
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">문제가 발생했습니다</h2>
          <p className="text-gray-500 mb-6">
            네트워크 연결을 확인하고 다시 시도해주세요.<br />
            문제가 계속되면 관리자에게 문의하세요.
          </p>
          <div className="space-y-3">
            <button
              onClick={reset}
              className="w-full bg-gradient-to-r from-teal-500 to-cyan-500 text-white py-3 rounded-xl font-medium hover:from-teal-600 hover:to-cyan-600 transition shadow-lg shadow-teal-500/30"
            >
              다시 시도
            </button>
            <button
              onClick={() => window.location.href = '/dashboard'}
              className="w-full bg-gray-100 text-gray-600 py-3 rounded-xl font-medium hover:bg-gray-200 transition"
            >
              홈으로 이동
            </button>
          </div>
        </div>
        <p className="text-gray-400 text-sm mt-6">문의: contact@grimaart.com</p>
      </div>
    </div>
  )
}
