'use strict';

const pool = require('../db/pool');

async function rfidRoutes(fastify) {
  fastify.post('/rfid/events', async (req, reply) => {
    const authHeader = req.headers.authorization || '';
    const readerApiKey = authHeader.replace(/^Bearer\s+/i, '');
    if (!readerApiKey) return reply.code(401).send({ error: 'Reader API key required' });

    // Validate reader
    const { rows: readerRows } = await pool.query(
      'SELECT * FROM readers WHERE api_key = $1',
      [readerApiKey],
    );
    const reader = readerRows[0];
    if (!reader) return reply.code(401).send({ error: 'Invalid reader API key' });

    // Update reader last_seen_at
    await pool.query('UPDATE readers SET last_seen_at = NOW() WHERE id = $1', [reader.id]);

    const { rfid_uuid, reader_id, detected_at } = req.body;
    const resolvedReaderId = reader_id || reader.id;
    if (!rfid_uuid) return reply.code(400).send({ error: 'rfid_uuid required' });

    // Resolve guest
    const { rows: guestRows } = await pool.query(
      'SELECT * FROM guests WHERE rfid_uuid = $1',
      [rfid_uuid],
    );
    const guest = guestRows[0];
    if (!guest) return reply.code(404).send({ error: 'Unknown wristband UUID' });

    // Find active trip for this reader's vessel
    const { rows: tripRows } = await pool.query(
      `SELECT t.* FROM trips t
       WHERE t.vessel_id = $1 AND t.locked_at IS NULL
       ORDER BY t.created_at DESC LIMIT 1`,
      [reader.vessel_id],
    );
    const trip = tripRows[0];
    if (!trip) return reply.code(422).send({ error: 'No active trip for this vessel' });

    // Get or create manifest entry
    let { rows: entryRows } = await pool.query(
      'SELECT * FROM manifest_entries WHERE trip_id = $1 AND guest_id = $2',
      [trip.id, guest.id],
    );
    let entry = entryRows[0];
    if (!entry) {
      const ins = await pool.query(
        `INSERT INTO manifest_entries (trip_id, guest_id, status, last_reader_id, last_seen_at)
         VALUES ($1,$2,'pre_board',$3,NOW()) RETURNING *`,
        [trip.id, guest.id, resolvedReaderId],
      );
      entry = ins.rows[0];
    }

    // State machine
    let newStatus = entry.status;
    if (reader.is_exit) {
      if (entry.status === 'on_board') newStatus = 'disembarked';
    } else {
      if (entry.status === 'pre_board') {
        // Capacity check
        const { rows: capRows } = await pool.query(
          `SELECT COUNT(*) FROM manifest_entries
           WHERE trip_id = $1 AND status = 'on_board'`,
          [trip.id],
        );
        const { rows: vesselRows } = await pool.query(
          'SELECT capacity FROM vessels WHERE id = $1',
          [reader.vessel_id],
        );
        const onBoard = parseInt(capRows[0].count, 10);
        const cap = vesselRows[0]?.capacity || 50;
        if (onBoard >= cap) {
          return reply.code(422).send({ error: 'Vessel at capacity' });
        }
        newStatus = 'on_board';
      } else if (entry.status === 'disembarked') {
        newStatus = 'on_board';
      }
      // on_board -> on_board: zone update, no status change
    }

    const { rows: updated } = await pool.query(
      `UPDATE manifest_entries
       SET status = $1, last_reader_id = $2, last_seen_at = NOW(),
           checked_in_at = CASE WHEN $1 = 'on_board' AND checked_in_at IS NULL THEN NOW() ELSE checked_in_at END
       WHERE trip_id = $3 AND guest_id = $4 RETURNING *`,
      [newStatus, resolvedReaderId, trip.id, guest.id],
    );
    entry = updated[0];

    // Audit row
    await pool.query(
      `INSERT INTO rfid_events (trip_id, reader_id, guest_id, rfid_uuid, detected_at)
       VALUES ($1,$2,$3,$4,$5)`,
      [trip.id, resolvedReaderId, guest.id, rfid_uuid, detected_at || new Date().toISOString()],
    );

    // Headcount
    const { rows: hcRows } = await pool.query(
      `SELECT COUNT(*) FROM manifest_entries WHERE trip_id = $1 AND status = 'on_board'`,
      [trip.id],
    );
    const headcount = parseInt(hcRows[0].count, 10);

    // Broadcast
    fastify.broadcastManifestUpdate(trip.id, {
      guest_id: guest.id,
      name: guest.name,
      status: newStatus,
      last_reader: reader.name,
      last_seen_at: entry.last_seen_at,
    }, headcount);

    return { ok: true, status: newStatus, headcount };
  });
}

module.exports = rfidRoutes;
