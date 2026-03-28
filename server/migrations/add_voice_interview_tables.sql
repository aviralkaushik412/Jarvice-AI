-- Add voice_mode column to interview_sessions table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'interview_sessions' AND column_name = 'voice_mode'
  ) THEN
    ALTER TABLE interview_sessions ADD COLUMN voice_mode BOOLEAN DEFAULT false;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'interview_sessions' AND column_name = 'session_id'
  ) THEN
    ALTER TABLE interview_sessions ADD COLUMN session_id VARCHAR(255);
  END IF;
END $$;

-- Create voice_interview_sessions table
CREATE TABLE IF NOT EXISTS voice_interview_sessions (
  id SERIAL PRIMARY KEY,
  session_db_id INTEGER NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  transcription JSONB NOT NULL,
  metrics JSONB,
  duration INTEGER DEFAULT 0,
  questions_count INTEGER DEFAULT 0,
  answers_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance 
CREATE INDEX IF NOT EXISTS idx_voice_interview_user_id ON voice_interview_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_voice_interview_created_at ON voice_interview_sessions(created_at);

-- Add index on interview_sessions if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE tablename = 'interview_sessions' AND indexname = 'idx_interview_sessions_voice_mode'
  ) THEN
    CREATE INDEX idx_interview_sessions_voice_mode ON interview_sessions(voice_mode);
  END IF;
END $$;
