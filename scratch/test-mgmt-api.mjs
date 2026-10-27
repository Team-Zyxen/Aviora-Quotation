const SUPABASE_URL = 'https://zqxkhdfofovullcjypto.supabase.co'
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxeGtoZGZvZm92dWxsY2p5cHRvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4ODg5MTg3NywiZXhwIjoyMTA0NDY3ODc3fQ.Cohutl7KTOm5Csmia_67IQrDA9RMSBp2gugPip1cj7E'

async function testMgmtApi() {
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/zqxkhdfofovullcjypto/db/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query: 'SELECT 1;' })
    })
    console.log('Mgmt API status:', res.status, await res.text())
  } catch (err) {
    console.log('Mgmt API error:', err.message)
  }
}

testMgmtApi()
