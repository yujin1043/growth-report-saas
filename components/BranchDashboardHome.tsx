'use client'

import { useRouter } from 'next/navigation'
import BranchLayout from '@/components/BranchLayout'

interface NeedReportStudent {
  id: string
  name: string
  days_since_report: number
}

interface BranchDashboardHomeProps {
  userName: string
  className: string
  monthlyReports: number
  needReportStudents: NeedReportStudent[]
}

export default function BranchDashboardHome({
  userName,
  className,
  monthlyReports,
  needReportStudents
}: BranchDashboardHomeProps) {
  const router = useRouter()

  return (
    <BranchLayout userName={userName} className={className}>
      <div className="p-8 max-w-4xl">
        {/* Header */}
        <header className="mb-7">
          <h1 className="text-2xl font-bold text-slate-800 mb-1">
            👋 {userName}님, 안녕하세요!
          </h1>
          <p className="text-slate-500">{className}</p>
        </header>

        {/* Today's Curriculum */}
        <div 
          onClick={() => router.push('/curriculum')}
          className="bg-gradient-to-r from-teal-500 to-cyan-500 rounded-2xl p-6 mb-6 cursor-pointer hover:shadow-lg transition relative overflow-hidden"
        >
          <div className="absolute -top-8 -right-8 w-32 h-32 bg-white/10 rounded-full" />
          <div className="absolute -bottom-10 right-16 w-24 h-24 bg-white/5 rounded-full" />
          
          <div className="relative z-10">
            <div className="inline-flex items-center bg-white/20 rounded-full px-3 py-1 mb-3">
              <span className="text-sm text-white font-medium">📚 오늘의 커리큘럼</span>
            </div>
            <h2 className="text-xl font-bold text-white mb-1">
              1월 유치부 - 겨울 풍경화
            </h2>
            <p className="text-white/80 text-sm">
              터치하면 지도 포인트 확인 →
            </p>
          </div>
        </div>

        {/* Today's Tasks */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
          <h3 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
            <span className="w-1 h-4 bg-gradient-to-b from-amber-400 to-pink-400 rounded-full" />
            오늘 할 일
          </h3>
          
          {/* Daily Message - Main Button */}
          <button
            onClick={() => router.push('/daily-message')}
            className="w-full bg-gradient-to-r from-amber-400 to-yellow-400 rounded-2xl p-5 mb-4 flex items-center gap-4 hover:shadow-md transition text-left"
          >
            <div className="w-14 h-14 bg-white/40 rounded-xl flex items-center justify-center text-2xl">
              💬
            </div>
            <div className="flex-1">
              <p className="font-bold text-amber-900 mb-0.5">일일 메시지 발송</p>
              <p className="text-sm text-amber-700">수업 후 학부모 알림</p>
            </div>
            <span className="text-amber-900 text-xl">→</span>
          </button>

          {/* Secondary Buttons */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => router.push('/reports/new')}
              className="bg-slate-50 rounded-xl p-4 flex items-center gap-3 hover:bg-slate-100 transition"
            >
              <div className="w-11 h-11 bg-teal-50 rounded-xl flex items-center justify-center text-xl">
                📝
              </div>
              <span className="font-semibold text-slate-700">리포트 작성</span>
            </button>
            
            <button
              onClick={() => router.push('/students')}
              className="bg-slate-50 rounded-xl p-4 flex items-center gap-3 hover:bg-slate-100 transition"
            >
              <div className="w-11 h-11 bg-pink-50 rounded-xl flex items-center justify-center text-xl">
                👨‍🎓
              </div>
              <span className="font-semibold text-slate-700">학생 관리</span>
            </button>
          </div>
        </div>

        {/* Report Alert */}
        {needReportStudents.length > 0 && (
          <div className="bg-white rounded-2xl border-2 border-red-100 p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="bg-red-500 text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
                ⚠️ 리포트 필요
              </span>
              <span className="bg-red-50 text-red-500 text-sm font-bold px-3 py-1 rounded-full">
                {needReportStudents.length}명
              </span>
            </div>

            <div className="space-y-2 mb-4">
              {needReportStudents.slice(0, 5).map((student) => (
                <div 
                  key={student.id}
                  className="flex items-center p-3 bg-slate-50 rounded-xl"
                >
                  <div className="w-10 h-10 bg-gradient-to-br from-pink-100 to-teal-100 rounded-lg flex items-center justify-center text-lg mr-3">
                    🎨
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-slate-800">{student.name}</p>
                    <p className="text-sm text-red-500">
                      {student.days_since_report === 999 ? '리포트 없음' : `${Math.floor(student.days_since_report / 30)}개월 경과`}
                    </p>
                  </div>
                  <button
                    onClick={() => router.push(`/reports/new?studentId=${student.id}`)}
                    className="bg-gradient-to-r from-teal-500 to-cyan-500 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:shadow-md transition"
                  >
                    작성하기
                  </button>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-dashed border-slate-200 flex items-center gap-2">
              <span className="text-lg">📊</span>
              <span className="text-sm text-slate-500">이번달 리포트</span>
              <span className="text-sm font-bold text-teal-500">{monthlyReports}건</span>
              <span className="text-sm text-slate-500">작성</span>
            </div>
          </div>
        )}
      </div>
    </BranchLayout>
  )
}
