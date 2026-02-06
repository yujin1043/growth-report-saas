// 날짜 포맷
export function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString('ko-KR')
}

// 통화 포맷
export function formatCurrency(amount: number) {
  return new Intl.NumberFormat('ko-KR').format(amount) + '원'
}

// 과금 계산
export function getBillingInfo(count: number): { tier: string; amount: number } {
  if (count <= 30) return { tier: '~30명', amount: 30000 }
  if (count <= 50) return { tier: '31~50명', amount: 40000 }
  if (count <= 80) return { tier: '51~80명', amount: 60000 }
  if (count <= 120) return { tier: '81~120명', amount: 80000 }
  if (count <= 150) return { tier: '121~150명', amount: 100000 }
  const extra = (count - 150) * 500
  return { tier: '150명+', amount: 100000 + extra }
}

// 작성률 색상
export function getRateColor(rate: number) {
  if (rate >= 80) return 'text-emerald-600'
  if (rate >= 50) return 'text-amber-600'
  return 'text-red-600'
}

// 역할 텍스트
export function getRoleText(role: string) {
  switch (role) {
    case 'admin': return '본사'
    case 'director': return '원장'
    case 'manager': return '실장'
    case 'teacher': return '강사'
    default: return role
  }
}

// 상태 텍스트
export function getStatusText(status: string) {
  switch (status) {
    case 'active': return '활성'
    case 'inactive': return '비활성'
    case 'paused': return '휴원'
    default: return status
  }
}

// 나이 계산
export function getAge(birthYear: number) {
  return new Date().getFullYear() - birthYear
}

// 수업일 수 계산 (이번달 현재까지)
export function getBusinessDaysSoFar() {
  const now = new Date()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  let count = 0
  for (let d = 1; d <= Math.min(now.getDate(), daysInMonth); d++) {
    const day = new Date(now.getFullYear(), now.getMonth(), d).getDay()
    if (day !== 0 && day !== 6) count++
  }
  return count
}
