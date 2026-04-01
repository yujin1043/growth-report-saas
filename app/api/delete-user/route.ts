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

    // ── auth.users 참조 테이블 정리 ──
    await adminClient.from('daily_messages').update({ teacher_id: null }).eq('teacher_id', userId)
    await adminClient.from('monthly_curriculum').update({ created_by: null }).eq('created_by', userId)
    await adminClient.from('reports').update({ created_by: null }).eq('created_by', userId)

    // ── user_profiles 참조 테이블 정리 ──
    await adminClient.from('teacher_classes').delete().eq('teacher_id', userId)
    await adminClient.from('student_consultations').update({ counselor_id: null }).eq('counselor_id', userId)
    await adminClient.from('student_status_history').update({ changed_by: null }).eq('changed_by', userId)
    await adminClient.from('students').update({ teacher_id: null }).eq('teacher_id', userId)
    await adminClient.from('regions').update({ manager_id: null }).eq('manager_id', userId)
    await adminClient.from('branches').update({ manager_id: null }).eq('manager_id', userId)
    await adminClient.from('user_invitations').update({ requested_by: null }).eq('requested_by', userId)
    await adminClient.from('user_invitations').update({ processed_by: null }).eq('processed_by', userId)

    // ── user_profiles 삭제 ──
    const { error: profileError } = await adminClient
      .from('user_profiles')
      .delete()
      .eq('id', userId)

    if (profileError) {
      return NextResponse.json({ error: 'Profile 삭제 실패: ' + profileError.message }, { status: 400 })
    }

    // ── Auth 계정 삭제 (auth 스키마 내 테이블은 자동 CASCADE) ──
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