CREATE TABLE IF NOT EXISTS bot_heartbeat (
  id INTEGER PRIMARY KEY DEFAULT 1,
  last_ping TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bot_heartbeat_status ON bot_heartbeat(status);

INSERT INTO bot_heartbeat (id, status) 
VALUES (1, 'active') 
ON CONFLICT (id) DO NOTHING;
