'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

declare global {
  interface Window {
    Kakao: any
  }
}

interface Result {
  id: string
  studentId: string
  studentName: string
  message: string
  imageUrls: string[]
  isSent: boolean
  createdAt: string
}

export default function AllResultsPage() {
  const router = useRouter()
  
  const [results, setResults] = useState<Result[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [sharedStatus, setSharedStatus] = useState<Map<string, { image: boolean, message: boolean }>>(new Map())
  const [isMobile, setIsMobile] = useState(false)
  const [loading, setLoading] = useState(true)
  const [kakaoReady, setKakaoReady] = useState(false)

  const filteredResults = useMemo(() => {
    if (searchQuery.trim() === '') {
      return results
    }
    const query = searchQuery.toLowerCase()
    return results.filter(r => 
      r.studentName.toLowerCase().includes(query) ||
      r.studentId.toLowerCase().includes(query)
    )
  }, [searchQuery, results])

  const { unsentResults, sentResults } = useMemo(() => ({
    unsentResults: filteredResults.filter(r => !r.isSent),
    sentResults: filteredResults.filter(r => r.isSent)
  }), [filteredResults])

  useEffect(() => {
    setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent))
    loadResults()
    
    // 카카오 SDK 로드
    if (typeof window !== 'undefined' && !window.Kakao) {
      const script = document.createElement('script')
      script.src = 'https://t1.kakaocdn.net/kakao_js_sdk/2.6.0/kakao.min.js'
      script.async = true
      script.onload = () => {
        if (window.Kakao && !window.Kakao.isInitialized()) {
          const kakaoKey = process.env.NEXT_PUBLIC_KAKAO_JS_KEY
          if (kakaoKey) {
            window.Kakao.init(kakaoKey)
            setKakaoReady(true)
          }
        }
      }
      document.head.appendChild(script)
    } else if (window.Kakao?.isInitialized()) {
      setKakaoReady(true)
    }
  }, [])

  async function loadResults() {
    try {
      const { data: messages, error: messagesError } = await supabase
        .from('daily_messages')
        .select('id, student_id, message, is_sent, created_at')
        .gte('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })

      if (messagesError || !messages || messages.length === 0) {
        setLoading(false)
        return
      }

      const studentIds = [...new Set(messages.map(m => m.student_id))]
      const messageIds = messages.map(m => m.id)

      const [studentsResult, imagesResult] = await Promise.all([
        supabase.from('students').select('id, name').in('id', studentIds),
        supabase.from('daily_message_images').select('daily_message_id, image_url').in('daily_message_id', messageIds).order('image_order')
      ])

      const studentMap = new Map(studentsResult.data?.map(s => [s.id, s.name]) || [])
      const imageMap = new Map<string, string[]>()
      imagesResult.data?.forEach(img => {
        const existing = imageMap.get(img.daily_message_id) || []
        imageMap.set(img.daily_message_id, [...existing, img.image_url])
      })

      const resultList: Result[] = messages.map(msg => ({
        id: msg.id,
        studentId: msg.student_id,
        studentName: studentMap.get(msg.student_id) || '',
        message: msg.message,
        imageUrls: imageMap.get(msg.id) || [],
        isSent: msg.is_sent,
        createdAt: msg.created_at
      }))

      setResults(resultList)
    } catch (error) {
      console.error('Load results error:', error)
    } finally {
      setLoading(false)
    }
  }

  const markAsSent = async (messageId: string) => {
    try {
      await supabase
        .from('daily_messages')
        .update({ is_sent: true, sent_at: new Date().toISOString() })
        .eq('id', messageId)

      setResults(prev => prev.map(r => 
        r.id === messageId ? { ...r, isSent: true } : r
      ))
    } catch (error) {
      console.error('Mark as sent error:', error)
    }
  }

  const handleImageAction = async (result: Result) => {
    const newStatus = new Map(sharedStatus)
    const current = newStatus.get(result.id) || { image: false, message: false }
    current.image = true
    newStatus.set(result.id, current)
    setSharedStatus(newStatus)
    
    if (current.message) {
      await markAsSent(result.id)
    }
  }

  const handleMessageAction = async (result: Result) => {
    const newStatus = new Map(sharedStatus)
    const current = newStatus.get(result.id) || { image: false, message: false }
    current.message = true
    newStatus.set(result.id, current)
    setSharedStatus(newStatus)
    
    if (current.image || result.imageUrls.length === 0) {
      await markAsSent(result.id)
    }
  }

  const copyToClipboard = async (text: string, id: string, result: Result) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(id)
      await handleMessageAction(result)
      setTimeout(() => setCopiedId(null), 2000)
    } catch (error) {
      console.error('Copy failed:', error)
    }
  }

  const downloadImages = async (result: Result) => {
    try {
      for (let i = 0; i < result.imageUrls.length; i++) {
        const response = await fetch(result.imageUrls[i])
        const blob = await response.blob()
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `${result.studentName}_작품_${i + 1}.jpg`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
      }
      setCopiedId(`download-${result.studentId}`)
      await handleImageAction(result)
      setTimeout(() => setCopiedId(null), 2000)
    } catch (error) {
      console.error('Download failed:', error)
    }
  }

  const shareImages = async (result: Result) => {
    if (result.imageUrls.length === 0) return
    
    try {
      if (navigator.share && navigator.canShare) {
        const files: File[] = []
        for (let i = 0; i < result.imageUrls.length; i++) {
          try {
            const res = await fetch(result.imageUrls[i])
            const blob = await res.blob()
            files.push(new File([blob], `${result.studentName}_작품_${i + 1}.jpg`, { type: 'image/jpeg' }))
          } catch (e) {
            console.error('Image fetch error:', e)
          }
        }
        
        if (files.length > 0 && navigator.canShare({ files })) {
          await navigator.share({ files, title: `${result.studentName} 작품 사진` })
          setCopiedId(`share-img-${result.studentId}`)
          await handleImageAction(result)
          setTimeout(() => setCopiedId(null), 2000)
          return
        }
      }
      await downloadImages(result)
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('Share failed:', error)
        await downloadImages(result)
      }
    }
  }

  const shareMessage = async (result: Result) => {
    try {
      if (kakaoReady && window.Kakao) {
        window.Kakao.Share.sendDefault({
          objectType: 'text',
          text: result.message,
          link: { mobileWebUrl: window.location.origin, webUrl: window.location.origin },
        })
        setCopiedId(`share-msg-${result.studentId}`)
        await handleMessageAction(result)
        setTimeout(() => setCopiedId(null), 2000)
        return
      }
      
      if (navigator.share) {
        await navigator.share({ text: result.message })
        setCopiedId(`share-msg-${result.studentId}`)
        await handleMessageAction(result)
        setTimeout(() => setCopiedId(null), 2000)
        return
      }
      
      await copyToClipboard(result.message, result.studentId, result)
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('Share failed:', error)
        await copyToClipboard(result.message, result.studentId, result)
      }
    }
  }

  const deleteResult = async (messageId: string) => {
    if (!confirm('삭제하시겠습니까?')) return
    
    try {
      await supabase.from('daily_messages').delete().eq('id', messageId)
      setResults(prev => prev.filter(r => r.id !== messageId))
    } catch (error) {
      console.error('Delete failed:', error)
    }
  }

  const clearAllResults = async () => {
    if (!confirm('모든 결과를 삭제하시겠습니까?')) return

    try {
      const messageIds = results.map(r => r.id)
      const batchSize = 100
      for (let i = 0; i < messageIds.length; i += batchSize) {
        const batch = messageIds.slice(i, i + batchSize)
        await supabase.from('daily_messages').delete().in('id', batch)
      }
      setResults([])
    } catch (error) {
      console.error('Clear all failed:', error)
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const month = date.getMonth() + 1
    const day = date.getDate()
    const hours = date.getHours().toString().padStart(2, '0')
    const minutes = date.getMinutes().toString().padStart(2, '0')
    return `${month}/${day} ${hours}:${minutes}`
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-500 mx-auto mb-4"></div>
          <p className="text-gray-500">로딩 중...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 pb-8">
      <header className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-40 border-b border-gray-200/50">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <button onClick={() => router.push('/daily-message')} className="text-gray-500 hover:text-gray-700">
              ← 뒤로
            </button>
            <h1 className="text-lg font-bold text-gray-800">전체 결과</h1>
            {results.length > 0 && (
              <button 
                onClick={clearAllResults}
                className="text-red-500 text-sm hover:text-red-700"
              >
                전체 삭제
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="mb-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="🔍 학생 이름으로 검색..."
            className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          />
        </div>

        {results.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">📋</span>
            </div>
            <p className="text-gray-500 mb-4">생성된 메시지가 없습니다</p>
            <button
              onClick={() => router.push('/daily-message')}
              className="text-teal-500 hover:underline"
            >
              메시지 생성하러 가기
            </button>
          </div>
        ) : filteredResults.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">검색 결과가 없습니다</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* 미발송 섹션 */}
            {unsentResults.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-orange-200 overflow-hidden">
                <div className="px-4 py-3 bg-orange-50 border-b border-orange-200">
                  <h2 className="font-semibold text-orange-800 flex items-center gap-2">
                    <span className="w-2 h-2 bg-orange-400 rounded-full"></span>
                    미발송 ({unsentResults.length}명)
                  </h2>
                </div>
                
                {/* 데스크톱 테이블 */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="px-5 py-3 text-left text-sm font-medium text-gray-600">날짜</th>
                        <th className="px-5 py-3 text-left text-sm font-medium text-gray-600">이름</th>
                        <th className="px-5 py-3 text-left text-sm font-medium text-gray-600">사진</th>
                        <th className="px-5 py-3 text-left text-sm font-medium text-gray-600">문구</th>
                        <th className="px-5 py-3 text-center text-sm font-medium text-gray-600">액션</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {unsentResults.map(result => (
                        <tr key={result.id} className="hover:bg-gray-50">
                          <td className="px-5 py-4 text-sm text-gray-500 whitespace-nowrap">
                            {formatDate(result.createdAt)}
                          </td>
                          <td className="px-5 py-4">
                            <span className="font-medium text-gray-800">{result.studentName}</span>
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex gap-1">
                              {result.imageUrls.slice(0, 3).map((url, i) => (
                                <img key={i} src={url} alt="" className="w-10 h-10 rounded-lg object-cover" />
                              ))}
                              {result.imageUrls.length > 3 && (
                                <span className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center text-xs text-gray-500">
                                  +{result.imageUrls.length - 3}
                                </span>
                              )}
                              {result.imageUrls.length === 0 && (
                                <span className="text-gray-400 text-sm">-</span>
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <p className="text-sm text-gray-600 line-clamp-2 max-w-xs">{result.message}</p>
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex items-center justify-center gap-1">
                              {result.imageUrls.length > 0 && (
                                <button
                                  onClick={() => downloadImages(result)}
                                  className={`px-2 py-1 rounded text-xs font-medium ${
                                    copiedId === `download-${result.studentId}` || sharedStatus.get(result.id)?.image
                                      ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                  }`}
                                >
                                  {copiedId === `download-${result.studentId}` || sharedStatus.get(result.id)?.image ? '✓' : '📥'}
                                </button>
                              )}
                              <button
                                onClick={() => copyToClipboard(result.message, result.studentId, result)}
                                className={`px-2 py-1 rounded text-xs font-medium ${
                                  copiedId === result.studentId || sharedStatus.get(result.id)?.message
                                    ? 'bg-green-500 text-white' : 'bg-teal-500 text-white hover:bg-teal-600'
                                }`}
                              >
                                {copiedId === result.studentId || sharedStatus.get(result.id)?.message ? '✓' : '📋'}
                              </button>
                              <button
                                onClick={() => router.push(`/daily-message/result/${result.studentId}`)}
                                className="px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200"
                              >
                                상세
                              </button>
                              <button
                                onClick={() => deleteResult(result.id)}
                                className="px-2 py-1 rounded text-xs font-medium text-red-500 hover:bg-red-50"
                              >
                                삭제
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* 모바일 카드 */}
                <div className="md:hidden divide-y divide-gray-100">
                  {unsentResults.map(result => (
                    <div key={result.id} className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-800">{result.studentName}</span>
                          <span className="text-xs text-gray-400">{formatDate(result.createdAt)}</span>
                        </div>
                        <button onClick={() => deleteResult(result.id)} className="text-red-400 text-xs">삭제</button>
                      </div>
                      
                      {result.imageUrls.length > 0 && (
                        <div className="flex gap-1 mb-2">
                          {result.imageUrls.slice(0, 4).map((url, i) => (
                            <img key={i} src={url} alt="" className="w-12 h-12 rounded-lg object-cover" />
                          ))}
                        </div>
                      )}
                      
                      <p className="text-sm text-gray-600 line-clamp-2 mb-3">{result.message}</p>
                      
                      <div className="flex gap-2">
                        {result.imageUrls.length > 0 && (
                          <button
                            onClick={() => shareImages(result)}
                            className={`flex-1 py-2 rounded-lg text-xs font-medium ${
                              copiedId === `share-img-${result.studentId}` || copiedId === `download-${result.studentId}` || sharedStatus.get(result.id)?.image
                                ? 'bg-green-500 text-white' : 'bg-yellow-400 text-yellow-900'
                            }`}
                          >
                            {copiedId === `share-img-${result.studentId}` || copiedId === `download-${result.studentId}` || sharedStatus.get(result.id)?.image ? '✓' : '📤 이미지'}
                          </button>
                        )}
                        <button
                          onClick={() => shareMessage(result)}
                          className={`flex-1 py-2 rounded-lg text-xs font-medium ${
                            copiedId === `share-msg-${result.studentId}` || sharedStatus.get(result.id)?.message
                              ? 'bg-green-500 text-white' : 'bg-yellow-400 text-yellow-900'
                          }`}
                        >
                          {copiedId === `share-msg-${result.studentId}` || sharedStatus.get(result.id)?.message ? '✓' : '📤 문구'}
                        </button>
                        <button
                          onClick={() => router.push(`/daily-message/result/${result.studentId}`)}
                          className="px-3 py-2 rounded-lg text-xs font-medium bg-gray-100 text-gray-600"
                        >
                          상세
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 발송 완료 섹션 */}
            {sentResults.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-green-200 overflow-hidden opacity-80">
                <div className="px-4 py-3 bg-green-50 border-b border-green-200">
                  <h2 className="font-semibold text-green-800 flex items-center gap-2">
                    <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                    발송 완료 ({sentResults.length}명)
                  </h2>
                </div>
                
                {/* 모바일 카드 */}
                <div className="md:hidden divide-y divide-gray-100">
                  {sentResults.map(result => (
                    <div key={result.id} className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-800">{result.studentName}</span>
                          <span className="text-green-500 text-xs">✓</span>
                          <span className="text-xs text-gray-400">{formatDate(result.createdAt)}</span>
                        </div>
                        <button onClick={() => deleteResult(result.id)} className="text-red-400 text-xs">삭제</button>
                      </div>
                      <p className="text-sm text-gray-600 line-clamp-2">{result.message}</p>
                    </div>
                  ))}
                </div>

                {/* 데스크톱 테이블 */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="px-5 py-3 text-left text-sm font-medium text-gray-600">날짜</th>
                        <th className="px-5 py-3 text-left text-sm font-medium text-gray-600">이름</th>
                        <th className="px-5 py-3 text-left text-sm font-medium text-gray-600">문구</th>
                        <th className="px-5 py-3 text-center text-sm font-medium text-gray-600">액션</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {sentResults.map(result => (
                        <tr key={result.id} className="hover:bg-gray-50">
                          <td className="px-5 py-4 text-sm text-gray-500 whitespace-nowrap">{formatDate(result.createdAt)}</td>
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-800">{result.studentName}</span>
                              <span className="text-green-500 text-xs">✓</span>
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <p className="text-sm text-gray-600 line-clamp-2 max-w-xs">{result.message}</p>
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => router.push(`/daily-message/result/${result.studentId}`)}
                                className="px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200"
                              >
                                상세
                              </button>
                              <button
                                onClick={() => deleteResult(result.id)}
                                className="px-2 py-1 rounded text-xs font-medium text-red-500 hover:bg-red-50"
                              >
                                삭제
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <button
              onClick={() => router.push('/daily-message')}
              className="w-full py-4 rounded-2xl text-base font-medium bg-gradient-to-r from-teal-500 to-cyan-500 text-white"
            >
              ➕ 학생 추가하기
            </button>
          </div>
        )}
      </div>
    </div>
  )
}