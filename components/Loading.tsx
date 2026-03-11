export default function Loading({ text = '로딩 중...' }: { text?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-500 mx-auto mb-4"></div>
        <p className="text-gray-500">{text}</p>
      </div>
    </div>
  )
}

export function LoadingSpinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass: Record<string, string> = { sm: 'h-5 w-5', md: 'h-8 w-8', lg: 'h-12 w-12' }
  return <div className={`animate-spin rounded-full border-b-2 border-teal-500 ${sizeClass[size]}`}></div>
}
