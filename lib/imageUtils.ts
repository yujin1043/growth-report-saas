// 이미지 압축 유틸리티
export async function compressImage(url: string, maxSize: number = 800, quality: number = 0.7): Promise<string> {
  const response = await fetch(url)
  const blob = await response.blob()
  const bitmap = await createImageBitmap(blob)
  
  let { width, height } = bitmap
  
  if (width > maxSize || height > maxSize) {
    if (width > height) {
      height = Math.round((height / width) * maxSize)
      width = maxSize
    } else {
      width = Math.round((width / height) * maxSize)
      height = maxSize
    }
  }
  
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    throw new Error('Canvas context not available')
  }
  
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  
  return canvas.toDataURL('image/jpeg', quality)
}