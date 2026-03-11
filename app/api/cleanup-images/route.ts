import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'edge'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const { data: oldMessages, error: fetchError } = await supabase
      .from('daily_messages')
      .select('id, image_urls')
      .lt('created_at', sevenDaysAgo.toISOString())
      .not('image_urls', 'is', null)

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    let deletedCount = 0

    for (const message of oldMessages || []) {
      if (message.image_urls && message.image_urls.length > 0) {
        for (const url of message.image_urls) {
          try {
            const path = url.split('/daily-message-images/')[1]
            if (path) {
              await supabase.storage
                .from('daily-message-images')
                .remove([decodeURIComponent(path)])
              deletedCount++
            }
          } catch (e) {
            console.error('Delete error:', e)
          }
        }

        await supabase
          .from('daily_messages')
          .update({ image_urls: [] })
          .eq('id', message.id)
      }
    }

    return NextResponse.json({ 
      success: true, 
      deletedImages: deletedCount,
      processedMessages: oldMessages?.length || 0
    })

  } catch (error) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
