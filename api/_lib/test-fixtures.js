function kstDate(offsetDays = 0) {
  const now = new Date(Date.now() + (9 * 60 * 60 * 1000));
  now.setUTCDate(now.getUTCDate() + offsetDays);
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
}

const TEST_USERS = [
  { id:'test_admin_001', name:'테스트 관리자', username:'test_admin', email:'admin@example.test', phone:'010-0000-0001', isAdmin:true, isSpecial:true, gender:'여', birthyear:'1980' },
  { id:'test_user_001', name:'테스트 사용자', username:'test_user', email:'user1@example.test', phone:'010-0000-0002', isAdmin:false, isSpecial:false, gender:'남', birthyear:'1975' },
  { id:'test_user_002', name:'가상 사용자 2', username:'demo_user2', email:'user2@example.test', phone:'010-0000-0003', isAdmin:false, isSpecial:true, gender:'여', birthyear:'1968' },
  { id:'test_user_003', name:'가상 사용자 3', username:'demo_user3', email:'user3@example.test', phone:'010-0000-0004', isAdmin:false, isSpecial:false, gender:'남', birthyear:'1991' },
];

function buildUserRecords(user, userIndex) {
  const offsets = [-29,-25,-22,-18,-15,-12,-9,-7,-5,-3,-1];
  return offsets.map((offset, index) => {
    const walking = 18 + userIndex * 4 + (index % 5) * 7;
    const running = index % 3 === 0 ? 10 + userIndex * 2 : 0;
    const customDuration = 15 + ((index + userIndex) % 4) * 5;
    return {
      id:`test-record-${userIndex}-${index}`,
      userId:user.id,
      date:kstDate(offset),
      weight:Number((64 + userIndex * 3.4 - index * 0.08).toFixed(1)),
      walking,
      running,
      walkingKm:Number((walking * 0.075).toFixed(1)),
      runningKm:Number((running * 0.14).toFixed(1)),
      squats:0,
      pushups:0,
      situps:0,
      water:1500 + ((index + userIndex) % 5) * 200,
      fasting:11 + (index % 3),
      diet:'가상 데이터',
      condition:3 + (index % 3),
      memo:index === offsets.length - 1 ? '테스트 관리자 화면 확인용 가상 기록' : '',
      customExercises:[{ id:`test-ex-${userIndex}-${index}`, category:'근력', name:'전신 근력운동', duration:customDuration, intensity:'보통', sets:3, reps:12 }],
      savedAt:`${kstDate(offset)}T09:00:00.000Z`,
    };
  });
}

function buildTestAdminData() {
  const createdAt = `${kstDate(-180)}T09:00:00.000Z`;
  const users = TEST_USERS.map(user => ({ ...user, createdAt, supabaseUserId:user.id, authProvider:'test' }));
  const records = users.flatMap(buildUserRecords);
  const inbodyLatest = Object.fromEntries(users.map((user, index) => [user.id, kstDate(-7 - index * 6)]));
  return { users, records, inbodyLatest };
}

function buildTestInbodyRecords(userId = 'test_admin_001') {
  const index = Math.max(0, TEST_USERS.findIndex(user => user.id === userId));
  return [-150,-120,-90,-60,-30,-5].map((offset, itemIndex) => ({
    id:`test-inbody-${index}-${itemIndex}`,
    user_id:userId,
    record_date:kstDate(offset),
    weight:Number((68.8 + index * 3.2 - itemIndex * 0.42).toFixed(1)),
    skeletal_muscle:Number((24.0 + index * 0.8 + itemIndex * 0.22).toFixed(1)),
    body_fat_mass:Number((20.5 + index - itemIndex * 0.4).toFixed(1)),
    bmi:Number((24.2 + index * 0.6 - itemIndex * 0.12).toFixed(1)),
    body_fat_percent:Number((31.2 + index * 0.7 - itemIndex * 0.58).toFixed(1)),
    ecw_ratio:Number((0.384 - itemIndex * 0.001).toFixed(3)),
    inbody_score:68 + itemIndex * 2,
    phase_angle:Number((5.0 + itemIndex * 0.08).toFixed(1)),
    image_url:null,
  }));
}

function buildTestAuditLogs() {
  return [
    { id:'test-audit-1', actor_name:'테스트 관리자', action:'view_admin_dashboard', target_type:'health_records', target_id:'가상 데이터', details:{ demo:true }, created_at:`${kstDate(0)}T00:10:00.000Z` },
    { id:'test-audit-2', actor_name:'테스트 관리자', action:'view_inbody_records', target_type:'user', target_id:'test_user_001', details:{ demo:true }, created_at:`${kstDate(-1)}T02:30:00.000Z` },
    { id:'test-audit-3', actor_name:'테스트 관리자', action:'upsert_inbody_record', target_type:'user', target_id:'test_user_002', details:{ demo:true }, created_at:`${kstDate(-2)}T04:20:00.000Z` },
  ];
}

module.exports = { buildTestAdminData, buildTestAuditLogs, buildTestInbodyRecords };
