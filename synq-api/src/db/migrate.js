'use strict';

require('dotenv').config();
const pool = require('./pool');

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS operators (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS vessels (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        operator_id UUID NOT NULL REFERENCES operators(id),
        name TEXT NOT NULL,
        capacity INTEGER NOT NULL DEFAULT 50,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS readers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        vessel_id UUID NOT NULL REFERENCES vessels(id),
        name TEXT NOT NULL,
        api_key TEXT UNIQUE NOT NULL,
        is_exit BOOLEAN DEFAULT FALSE,
        last_seen_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS guests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        dob DATE,
        emergency_contact TEXT,
        rfid_uuid TEXT UNIQUE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS trips (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        vessel_id UUID NOT NULL REFERENCES vessels(id),
        operator_id UUID NOT NULL REFERENCES operators(id),
        locked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS manifest_entries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        trip_id UUID NOT NULL REFERENCES trips(id),
        guest_id UUID NOT NULL REFERENCES guests(id),
        status TEXT NOT NULL DEFAULT 'pre_board',
        last_reader_id UUID REFERENCES readers(id),
        last_seen_at TIMESTAMPTZ,
        checked_in_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(trip_id, guest_id)
      );

      CREATE TABLE IF NOT EXISTS rfid_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        trip_id UUID REFERENCES trips(id),
        reader_id UUID REFERENCES readers(id),
        guest_id UUID REFERENCES guests(id),
        rfid_uuid TEXT,
        detected_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_manifest_trip_status ON manifest_entries(trip_id, status);
      CREATE INDEX IF NOT EXISTS idx_guests_rfid ON guests(rfid_uuid) WHERE rfid_uuid IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_trips_vessel ON trips(vessel_id);
    `);
    console.log('Migration complete.');
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
