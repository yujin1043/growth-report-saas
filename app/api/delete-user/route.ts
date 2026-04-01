import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  try {
    const { userId } = await request.json()

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // 1. teacher_classes (FK 아니지만 관련 데이터 정리)
    await adminClient.from('teacher_classes').delete().eq('teacher_id', userId)

    // 2. daily_messages.teacher_id → NULL 처리 (데이터 보존)
    await adminClient.from('daily_messages').update({ teacher_id: null }).eq('teacher_id', userId)

    // 3. monthly_curriculum.created_by → NULL 처리
    await adminClient.from('monthly_curriculum').update({ created_by: null }).eq('created_by', userId)

    // 4. reports.created_by → NULL 처리
    await adminClient.from('reports').update({ created_by: null }).eq('created_by', userId)

    // 5. user_profiles 삭제
    const { error: profileError } = await adminClient
      .from('user_profiles')
      .delete()
      .eq('id', userId)

    if (profileError) {
      return NextResponse.json({ error: 'Profile 삭제 실패: ' + profileError.message }, { status: 400 })
    }

    // 6. Auth 계정 삭제 (auth 스키마 내 테이블은 자동 CASCADE)
    const { error: authError } = await adminClient.auth.admin.deleteUser(userId)

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error('delete-user error:', e)
    return NextResponse.json({ error: e.message || '서버 오류' }, { status: 500 })
  }
}