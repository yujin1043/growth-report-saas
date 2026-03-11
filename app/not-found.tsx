import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 p-4">
      <div className="w-full max-w-md text-center">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <span className="text-3xl">🔍</span>
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">페이지를 찾을 수 없습니다</h2>
          <p className="text-gray-500 mb-6">
            요청하신 페이지가 존재하지 않거나<br />
            이동되었을 수 있습니다.
          </p>
          <Link
            href="/dashboard"
            className="block w-full bg-gradient-to-r from-teal-500 to-cyan-500 text-white py-3 rounded-xl font-medium hover:from-teal-600 hover:to-cyan-600 transition shadow-lg shadow-teal-500/30 text-center"
          >
            홈으로 이동
          </Link>
        </div>
      </div>
    </div>
  )
}
