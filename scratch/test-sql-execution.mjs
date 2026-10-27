import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://zqxkhdfofovullcjypto.supabase.co'
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxeGtoZGZvZm92dWxsY2p5cHRvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4ODg5MTg3NywiZXhwIjoyMTA0NDY3ODc3fQ.Cohutl7KTOm5Csmia_67IQrDA9RMSBp2gugPip1cj7E'

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

async function testSql() {
  // Test pg-meta or rpc or sql endpoint
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query: 'SELECT 1;' })
    })
    console.log('exec_sql status:', res.status, await res.text())
  } catch (err) {
    console.log('exec_sql error:', err.message)
  }
}

testSql()
