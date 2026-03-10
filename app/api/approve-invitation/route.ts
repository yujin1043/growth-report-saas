import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  try {
    const { invitationId } = await request.json()

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: inv, error: invErr } = await adminClient
      .from('user_invitations').select('*').eq('id', invitationId).single()

    if (invErr || !inv) {
      return NextResponse.json({ error: '초대 정보를 찾을 수 없습니다.' }, { status: 404 })
    }
    if (inv.status !== 'pending') {
      return NextResponse.json({ error: '이미 처리된 요청입니다.' }, { status: 400 })
    }

    const tempPassword = Math.random().toString(36).slice(-8) + '!'

    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email: inv.email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { name: inv.name }
    })

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }

    const { error: profileError } = await adminClient.from('user_profiles').insert({
      id: authData.user.id,
      name: inv.name,
      email: inv.email,
      role: inv.role,
      branch_id: inv.branch_id,
      phone: inv.phone,
      status: 'active'
    })

    if (profileError) {
      await adminClient.auth.admin.deleteUser(authData.user.id)
      return NextResponse.json({ error: profileError.message }, { status: 400 })
    }

    // 강사인 경우 담당반 등록
    if (inv.role === 'teacher' && inv.class_ids && inv.class_ids.length > 0) {
      await adminClient.from('teacher_classes').insert(
        inv.class_ids.map((classId: string) => ({
          teacher_id: authData.user.id,
          class_id: classId
        }))
      )
    }

    await adminClient.from('user_invitations').update({
      status: 'approved',
      temp_password: tempPassword,
      processed_at: new Date().toISOString()
    }).eq('id', invitationId)

    return NextResponse.json({ success: true, tempPassword })
  } catch (e) {
    console.error('approve-invitation error:', e)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
