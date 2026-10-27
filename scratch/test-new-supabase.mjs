import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://zqxkhdfofovullcjypto.supabase.co'
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxeGtoZGZvZm92dWxsY2p5cHRvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4ODg5MTg3NywiZXhwIjoyMTA0NDY3ODc3fQ.Cohutl7KTOm5Csmia_67IQrDA9RMSBp2gugPip1cj7E'

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

async function testConnection() {
  console.log('Testing connection to new Supabase project...')
  
  // 1. Create branding storage bucket
  const { data: bucketData, error: bucketError } = await supabase.storage.createBucket('branding', {
    public: true,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'],
    fileSizeLimit: 10485760, // 10MB
  })

  if (bucketError) {
    console.log('Bucket creation message:', bucketError.message)
  } else {
    console.log('Bucket "branding" created successfully:', bucketData)
  }

  // 2. Check existing tables
  const { data: tableData, error: tableError } = await supabase.from('company_settings').select('*')
  if (tableError) {
    console.log('company_settings table query status:', tableError.message)
  } else {
    console.log('company_settings table exists. Rows:', tableData.length)
  }
}

testConnection()
