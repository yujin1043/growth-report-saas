// components/Skeleton.tsx
// 재사용 가능한 스켈레톤 컴포넌트 모음

export function SkeletonBox({ className = '' }: { className?: string }) {
    return (
      <div className={`animate-pulse bg-gray-200 rounded-xl ${className}`} />
    )
  }
  
  export function SkeletonText({ lines = 1, className = '' }: { lines?: number, className?: string }) {
    return (
      <div className={`space-y-2 ${className}`}>
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className="animate-pulse bg-gray-200 rounded h-4"
            style={{ width: i === lines - 1 && lines > 1 ? '70%' : '100%' }}
          />
        ))}
      </div>
    )
  }
  
  export function SkeletonCircle({ size = 'w-10 h-10' }: { size?: string }) {
    return <div className={`animate-pulse bg-gray-200 rounded-full ${size}`} />
  }
  
  // ===== 일일 메시지 페이지 스켈레톤 =====
  export function DailyMessageSkeleton() {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 pb-8">
        <header className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-40 border-b border-gray-200/50">
          <div className="max-w-5xl mx-auto px-4 py-3">
            <div className="flex items-center justify-center min-h-[40px]">
              <h1 className="text-lg font-bold text-gray-800">💬 일일 메시지</h1>
            </div>
          </div>
        </header>
  
        <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
          {/* 전체 결과 배너 */}
          <div className="animate-pulse bg-white rounded-2xl border border-gray-100 p-4 h-14" />
  
          {/* 반 선택 */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div className="animate-pulse bg-gray-200 rounded h-5 w-20 mb-3" />
            <div className="animate-pulse bg-gray-100 rounded-xl h-12" />
          </div>
  
          {/* 학생 선택 */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div className="animate-pulse bg-gray-200 rounded h-5 w-24 mb-3" />
            <div className="animate-pulse bg-gray-100 rounded-xl h-12" />
          </div>
  
          {/* 작품 사진 */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div className="animate-pulse bg-gray-200 rounded h-5 w-36 mb-3" />
            <div className="grid grid-cols-4 gap-2">
              <div className="animate-pulse bg-gray-100 rounded-xl aspect-square" />
            </div>
          </div>
  
          {/* 수업 유형 */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div className="animate-pulse bg-gray-200 rounded h-5 w-24 mb-3" />
            <div className="grid grid-cols-2 gap-2">
              <div className="animate-pulse bg-gray-100 rounded-xl h-12" />
              <div className="animate-pulse bg-gray-100 rounded-xl h-12" />
            </div>
          </div>
  
          {/* 버튼 */}
          <div className="animate-pulse bg-gray-200 rounded-2xl h-14" />
        </div>
      </div>
    )
  }
  
  // ===== 대시보드 스켈레톤 (지점 계정) =====
  export function DashboardBranchSkeleton() {
    return (
      <div className="min-h-screen" style={{ background: '#F8FAFB' }}>
        <div className="max-w-3xl mx-auto px-4 py-5 md:py-7 space-y-5">
          {/* 인사 헤더 */}
          <div className="flex items-center gap-3.5">
            <div className="animate-pulse w-12 h-12 rounded-xl bg-gray-200" />
            <div className="space-y-2 flex-1">
              <div className="animate-pulse bg-gray-200 rounded h-6 w-48" />
              <div className="animate-pulse bg-gray-200 rounded h-4 w-32" />
            </div>
          </div>
  
          {/* 커리큘럼 배너 */}
          <div className="animate-pulse rounded-2xl h-28" style={{ background: 'linear-gradient(135deg, #d1e7eb 0%, #c5dde3 100%)' }} />
  
          {/* 오늘의 할 일 */}
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <div className="animate-pulse bg-gray-200 rounded h-5 w-24 mb-4" />
            <div className="animate-pulse rounded-xl h-20 mb-3" style={{ background: '#f5e9a0' }} />
            <div className="grid grid-cols-2 gap-2.5">
              <div className="animate-pulse bg-gray-100 border border-gray-200 rounded-xl h-20" />
              <div className="animate-pulse bg-gray-100 border border-gray-200 rounded-xl h-20" />
            </div>
          </div>
  
          {/* 관리 필요 원생 */}
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <div className="animate-pulse bg-gray-200 rounded h-5 w-28 mb-4" />
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="animate-pulse bg-gray-50 rounded-xl h-16 border border-gray-100" />
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }
  
  // ===== 대시보드 스켈레톤 (본사 admin) =====
  export function DashboardAdminSkeleton() {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <header className="bg-white shadow-sm border-b border-slate-200">
          <div className="max-w-5xl mx-auto px-4 py-4">
            <h1 className="text-lg font-bold text-slate-800">🎛 HQ 통합 대시보드</h1>
          </div>
        </header>
  
        <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
          <div className="animate-pulse bg-gray-200 rounded h-4 w-64 mx-auto" />
  
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white rounded-2xl border border-slate-200 p-5 text-center">
                <div className="animate-pulse bg-gray-200 rounded h-4 w-16 mx-auto mb-2" />
                <div className="animate-pulse bg-gray-200 rounded h-9 w-20 mx-auto" />
              </div>
            ))}
          </div>
  
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="animate-pulse bg-gray-200 rounded h-5 w-28 mb-4" />
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="animate-pulse bg-gray-50 rounded-xl h-12" />
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }
  
  // ===== 결과 목록 스켈레톤 =====
  export function ResultsSkeleton() {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 pb-8">
        <header className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-40 border-b border-gray-200/50">
          <div className="max-w-7xl mx-auto px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-gray-400">← 뒤로</span>
              <h1 className="text-lg font-bold text-gray-800">전체 결과</h1>
              <div className="w-16" />
            </div>
          </div>
        </header>
  
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="animate-pulse bg-white rounded-xl h-12 mb-4" />
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 bg-orange-50 border-b border-orange-200">
              <div className="animate-pulse bg-orange-200 rounded h-5 w-28" />
            </div>
            <div className="divide-y divide-gray-100">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="animate-pulse bg-gray-200 rounded h-5 w-20" />
                    <div className="animate-pulse bg-gray-200 rounded h-4 w-12" />
                  </div>
                  <div className="flex gap-1 mb-2">
                    {[1, 2].map(j => (
                      <div key={j} className="animate-pulse bg-gray-200 rounded-lg w-12 h-12" />
                    ))}
                  </div>
                  <div className="animate-pulse bg-gray-100 rounded h-10" />
                  <div className="flex gap-2 mt-3">
                    <div className="animate-pulse bg-gray-200 rounded-lg h-8 flex-1" />
                    <div className="animate-pulse bg-gray-200 rounded-lg h-8 flex-1" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }
  