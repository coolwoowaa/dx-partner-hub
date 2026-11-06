// Supabase 프로젝트 → Project Settings → API 에서 복사해 붙여 넣으세요.
// anon(publishable) 키는 브라우저에 공개돼도 되는 키입니다. 데이터 보호는 DB의 RLS 규칙이 맡습니다.
// service_role(secret) 키는 절대 여기에 넣지 마세요.
window.HUB_CONFIG = {
  SUPABASE_URL: 'https://YOUR_PROJECT_REF.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR_SUPABASE_ANON_KEY'
};
