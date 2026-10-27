import { Client } from 'pg'

const connectionStrings = [
  'postgresql://postgres:a0l0FfQShpCIIzLb@db.zqxkhdfofovullcjypto.supabase.co:5432/postgres',
  'postgresql://postgres.zqxkhdfofovullcjypto:a0l0FfQShpCIIzLb@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres',
  'postgresql://postgres.zqxkhdfofovullcjypto:a0l0FfQShpCIIzLb@aws-0-ap-south-1.pooler.supabase.com:6543/postgres',
  'postgresql://postgres.zqxkhdfofovullcjypto:a0l0FfQShpCIIzLb@aws-0-us-east-1.pooler.supabase.com:6543/postgres',
  'postgresql://postgres.zqxkhdfofovullcjypto:a0l0FfQShpCIIzLb@aws-0-eu-central-1.pooler.supabase.com:6543/postgres',
]

async function testConnections() {
  for (const connStr of connectionStrings) {
    console.log('Testing connection string:', connStr.replace(':a0l0FfQShpCIIzLb@', ':****@'))
    const client = new Client({ connectionString: connStr, connectionTimeoutMillis: 5000, ssl: { rejectUnauthorized: false } })
    try {
      await client.connect()
      console.log('✅ SUCCESS! Connected to new database using:', connStr.replace(':a0l0FfQShpCIIzLb@', ':****@'))
      await client.end()
      return connStr
    } catch (err) {
      console.log('❌ Failed:', err.message)
    }
  }
}

testConnections()
