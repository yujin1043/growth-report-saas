// ============================================================
// 파일: app/loading.tsx (신규 파일)
// 목적: Next.js가 페이지 전환 시 자동으로 보여주는 로딩 UI
//       기존 각 페이지의 로딩 스피너와 동일한 디자인 유지
// ============================================================

export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-500 mx-auto mb-4"></div>
        <p className="text-slate-500">로딩 중...</p>
      </div>
    </div>
  )
}
