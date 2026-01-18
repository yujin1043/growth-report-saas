'use client'

import { useEffect } from 'react'

declare global {
  interface Window {
    Kakao: any
  }
}

export default function KakaoProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://t1.kakaocdn.net/kakao_js_sdk/2.5.0/kakao.min.js'
    script.async = true
    script.onload = () => {
      if (window.Kakao && !window.Kakao.isInitialized()) {
        window.Kakao.init(process.env.NEXT_PUBLIC_KAKAO_JS_KEY)
        console.log('Kakao SDK initialized')
      }
    }
    document.head.appendChild(script)
  }, [])

  return <>{children}</>
}
