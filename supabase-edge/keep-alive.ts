import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_ANON_KEY')!
)

// Keep-alive function
async function keepAlive() {
  try {
    console.log('🔄 [EDGE] Bot keep-alive ping at:', new Date().toISOString())
    
    // Simple health check - you can also call your bot API
    const { data, error } = await supabase
      .from('games')
      .select('count')
      .limit(1)
    
    if (error) {
      throw new Error(`Supabase error: ${error.message}`)
    }
    
    console.log('✅ [EDGE] Supabase connection healthy, games count:', data?.length || 0)
    
    // Optional: Update a heartbeat table
    await supabase
      .from('bot_heartbeat')
      .upsert({ 
        id: 1, 
        last_ping: new Date().toISOString(),
        status: 'active'
      })
      .eq('id', 1)
    
  } catch (error) {
    console.error('❌ [EDGE] Keep-alive failed:', error.message)
  }
}

// Main handler
serve(async (req) => {
  // Only allow GET requests for cron
  if (req.method !== 'GET') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { 'Content-Type': 'application/json' } }
    )
  }
  
  await keepAlive()
  
  return new Response(
    JSON.stringify({ 
      status: 'success', 
      timestamp: new Date().toISOString(),
      message: 'Bot keep-alive ping sent via Edge Function'
    }),
    { 
      status: 200, 
      headers: { 'Content-Type': 'application/json' } 
    }
  )
})

// Create heartbeat table SQL (run once in Supabase SQL):
/*
CREATE TABLE IF NOT EXISTS bot_heartbeat (
  id INTEGER PRIMARY KEY DEFAULT 1,
  last_ping TIMESTAMP WITH TIME ZONE,
  status TEXT DEFAULT 'active'
);
*/
