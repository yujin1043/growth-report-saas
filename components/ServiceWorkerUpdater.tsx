'use client'

import { useEffect } from 'react'

export default function ServiceWorkerUpdater() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

    // SW 등록 및 업데이트 감지
    navigator.serviceWorker.register('/sw.js').then((registration) => {
      // 즉시 업데이트 체크
      registration.update()

      // 새 SW가 대기 중이면 바로 활성화
      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' })
      }

      // 새 SW가 설치되면 자동으로 활성화 요청
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing
        if (!newWorker) return

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // 새 버전 설치 완료 → 즉시 활성화
            newWorker.postMessage({ type: 'SKIP_WAITING' })
          }
        })
      })
    }).catch((error) => {
      console.log('SW registration failed:', error)
    })

    // SW에서 업데이트 완료 메시지를 받으면 페이지 새로고침
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'SW_UPDATED') {
        // 자동 새로고침으로 최신 버전 적용
        window.location.reload()
      }
    })

    // 새 SW가 컨트롤러를 인수받으면 새로고침
    let refreshing = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true
        window.location.reload()
      }
    })

    // 30분마다 업데이트 체크 (앱이 열려있는 동안)
    const interval = setInterval(() => {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg) reg.update()
      })
    }, 30 * 60 * 1000)

    return () => clearInterval(interval)
  }, [])

  return null
}
