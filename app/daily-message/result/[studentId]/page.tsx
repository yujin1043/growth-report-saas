'use client'

declare global {
  interface Window {
    Kakao: any
  }
}

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Result {
  id: string
  studentId: string
  studentName: string
  message: string
  imageUrls: string[]
  isSent: boolean
  createdAt: string
}

export default function ResultPage() {
  const router = useRouter()
  const params = useParams()
  const studentId = params.studentId as string
  
  const [result, setResult] = useState<Result | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editedMessage, setEditedMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sharing, setSharing] = useState(false)

  useEffect(() => {
    setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent))
    loadResult()
  }, [studentId])

  async function loadResult() {
    try {
      const { data: message, error: messageError } = await supabase
        .from('daily_messages')
        .select('id, student_id, message, is_sent, created_at')
        .eq('student_id', studentId)
        .gte('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (messageError || !message) {
        setLoading(false)
        return
      }

      const [studentResult, imagesResult] = await Promise.all([
        supabase.from('students').select('name').eq('id', studentId).single(),
        supabase.from('daily_message_images').select('image_url').eq('daily_message_id', message.id).order('image_order')
      ])

      setResult({
        id: message.id,
        studentId: message.student_id,
        studentName: studentResult.data?.name || '',
        message: message.message,
        imageUrls: imagesResult.data?.map(img => img.image_url) || [],
        isSent: message.is_sent,
        createdAt: message.created_at
      })
      setEditedMessage(message.message)
    } catch (error) {
      console.error('Load result error:', error)
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId('message')
      setTimeout(() => setCopiedId(null), 2000)
    } catch (error) {
      console.error('Copy failed:', error)
    }
  }

  const shareAll = async () => {
    if (!result) return
    setSharing(true)
    try {
      // 이미지 파일 생성
      const files: File[] = []
      if (result.imageUrls.length > 0) {
        for (let i = 0; i < result.imageUrls.length; i++) {
          try {
            const res = await fetch(result.imageUrls[i])
            const blob = await res.blob()
            const file = new File([blob], `${result.studentName}_작품_${i + 1}.jpg`, { type: 'image/jpeg' })
            files.push(file)
          } catch (e) {
            console.error('이미지 로드 실패:', e)
          }
        }
      }

      // 파일+텍스트 공유
      if (navigator.share && files.length > 0 && navigator.canShare && navigator.canShare({ files })) {
        await navigator.share({ text: result.message, files: files })
        setCopiedId('shared')
        await markAsSent()
        setTimeout(() => setCopiedId(null), 2000)
        return
      }

      // 텍스트만 공유
      if (navigator.share) {
        await navigator.share({ text: result.message })
        setCopiedId('shared')
        await markAsSent()
        setTimeout(() => setCopiedId(null), 2000)
        return
      }

      // 클립보드 복사
      await copyToClipboard(result.message)
      
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('공유 실패:', error)
        await copyToClipboard(result.message)
      }
    } finally {
      setSharing(false)
    }
  }

  const downloadImages = async () => {
    if (!result) return
    
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
      setCopiedId('download')
      setTimeout(() => setCopiedId(null), 2000)
    } catch (error) {
      console.error('Download failed:', error)
    }
  }

  const markAsSent = async () => {
    if (!result) return
    
    try {
      await supabase
        .from('daily_messages')
        .update({ is_sent: true, sent_at: new Date().toISOString() })
        .eq('id', result.id)

      setResult({ ...result, isSent: true })
    } catch (error) {
      console.error('Mark as sent error:', error)
    }
  }

  const saveEditedMessage = async () => {
    if (!result) return
    
    setSaving(true)
    try {
      const { error } = await supabase
        .from('daily_messages')
        .update({ message: editedMessage })
        .eq('id', result.id)

      if (!error) {
        setResult({ ...result, message: editedMessage })
        setIsEditing(false)
      } else {
        alert('저장에 실패했습니다. 다시 시도해주세요.')
      }
    } catch (error) {
      console.error('Save error:', error)
      alert('저장에 실패했습니다. 다시 시도해주세요.')
    } finally {
      setSaving(false)
    }
  }

  const cancelEdit = () => {
    if (result) {
      setEditedMessage(result.message)
    }
    setIsEditing(false)
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

  if (!result) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-gray-500 mb-4">결과를 찾을 수 없습니다</p>
          <button
            onClick={() => router.push('/daily-message')}
            className="text-teal-500 hover:underline"
          >
            입력 페이지로 돌아가기
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 pb-8">
      <header className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-40 border-b border-gray-200/50">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <button onClick={() => router.push('/daily-message')} className="text-gray-500 hover:text-gray-700">
              ← 뒤로
            </button>
            <h1 className="text-lg font-bold text-gray-800">메시지 결과</h1>
            <div className="w-10"></div>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <span className="text-2xl">👤</span>
          </div>
          <h2 className="text-xl font-bold text-gray-800">{result.studentName}</h2>
          {result.isSent && (
            <span className="inline-block mt-2 px-3 py-1 bg-green-100 text-green-700 text-sm rounded-full">
              ✓ 발송 완료
            </span>
          )}
        </div>

        {result.imageUrls.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <h3 className="font-semibold text-gray-800 mb-3">📷 작품 사진</h3>
            <div className="grid grid-cols-4 gap-2">
              {result.imageUrls.map((url, index) => (
                <img 
                  key={index} 
                  src={url} 
                  alt="" 
                  className="w-full aspect-square object-cover rounded-xl" 
                />
              ))}
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-800">📝 생성된 문구</h3>
            {!isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="text-sm text-teal-600 hover:text-teal-700 font-medium"
              >
                ✏️ 수정
              </button>
            )}
          </div>
          
          {isEditing ? (
            <div>
              <textarea
                value={editedMessage}
                onChange={(e) => setEditedMessage(e.target.value)}
                className="w-full bg-gray-50 rounded-xl p-4 text-gray-700 leading-relaxed border border-gray-200 focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
                rows={5}
              />
              <div className="flex gap-2 mt-3">
                <button
                  onClick={saveEditedMessage}
                  disabled={saving}
                  className="flex-1 py-2 rounded-xl text-sm font-medium bg-teal-500 text-white hover:bg-teal-600 transition disabled:opacity-50"
                >
                  {saving ? '저장 중...' : '저장'}
                </button>
                <button
                  onClick={cancelEdit}
                  disabled={saving}
                  className="flex-1 py-2 rounded-xl text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition disabled:opacity-50"
                >
                  취소
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">
                {result.message}
              </p>
            </div>
          )}
        </div>

        {!isEditing && (
          <div className="space-y-2">
            {isMobile ? (
              <button
                onClick={shareAll}
                disabled={sharing}
                className={`w-full py-4 rounded-2xl text-base font-medium transition flex items-center justify-center gap-2 ${
                  copiedId === 'shared'
                    ? 'bg-green-500 text-white'
                    : 'bg-yellow-400 text-yellow-900 hover:bg-yellow-500'
                }`}
              >
                {sharing ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-yellow-900"></div>
                    준비 중...
                  </>
                ) : copiedId === 'shared' ? (
                  '✓ 공유됨'
                ) : (
                  <>📤 카톡 공유하기 {result.imageUrls.length > 0 ? '(이미지+문구)' : '(문구)'}</>
                )}
              </button>
            ) : (
              <>
                {result.imageUrls.length > 0 && (
                  <button
                    onClick={downloadImages}
                    className={`w-full py-4 rounded-2xl text-base font-medium transition ${
                      copiedId === 'download'
                        ? 'bg-green-500 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {copiedId === 'download' ? '✓ 저장됨' : '📥 이미지 모두 저장'}
                  </button>
                )}
                <button
                  onClick={() => copyToClipboard(result.message)}
                  className={`w-full py-4 rounded-2xl text-base font-medium transition ${
                    copiedId === 'message'
                      ? 'bg-green-500 text-white'
                      : 'bg-teal-500 text-white hover:bg-teal-600'
                  }`}
                >
                  {copiedId === 'message' ? '✓ 복사됨' : '📋 문구 복사하기'}
                </button>
              </>
            )}

            {!result.isSent && (
              <button
                onClick={markAsSent}
                className="w-full py-3 rounded-2xl text-sm font-medium bg-green-100 text-green-700 hover:bg-green-200 transition"
              >
                ✓ 발송 완료로 표시
              </button>
            )}
          </div>
        )}

        {!isEditing && (
          <div className="pt-4 space-y-2">
            <button
              onClick={() => router.push('/daily-message')}
              className="w-full py-3 rounded-2xl text-sm font-medium bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            >
              ➕ 다른 학생 추가하기
            </button>
            
            <button
              onClick={() => router.push('/daily-message/results')}
              className="w-full py-3 rounded-2xl text-sm font-medium bg-white border border-teal-200 text-teal-600 hover:bg-teal-50"
            >
              📋 전체 결과 보기
            </button>
          </div>
        )}
      </div>
    </div>
  )
}