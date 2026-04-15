'use strict';

const pool = require('../db/pool');

async function tripRoutes(fastify) {
  // Create trip
  fastify.post('/trips', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    if (req.user.role !== 'operator') return reply.code(403).send({ error: 'Operators only' });
    const { vessel_id } = req.body;
    if (!vessel_id) return reply.code(400).send({ error: 'vessel_id required' });

    const { rows } = await pool.query(
      'INSERT INTO trips (vessel_id, operator_id) VALUES ($1,$2) RETURNING *',
      [vessel_id, req.user.sub],
    );
    return reply.code(201).send(rows[0]);
  });

  // Get full trip (manifest)
  fastify.get('/trips/:tripId', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const { tripId } = req.params;
    const { rows: tripRows } = await pool.query(
      `SELECT t.*, v.name AS vessel_name, v.capacity
       FROM trips t JOIN vessels v ON v.id = t.vessel_id
       WHERE t.id = $1`,
      [tripId],
    );
    const trip = tripRows[0];
    if (!trip) return reply.code(404).send({ error: 'Trip not found' });

    const { rows: passengers } = await pool.query(
      `SELECT me.*, g.name, g.dob, g.emergency_contact, g.rfid_uuid,
              r.name AS last_reader
       FROM manifest_entries me
       JOIN guests g ON g.id = me.guest_id
       LEFT JOIN readers r ON r.id = me.last_reader_id
       WHERE me.trip_id = $1
       ORDER BY me.created_at`,
      [tripId],
    );

    const headcount = passengers.filter((p) => p.status === 'on_board').length;
    return {
      ...trip,
      vessel: { name: trip.vessel_name, capacity: trip.capacity },
      passengers,
      headcount,
    };
  });

  // Poll manifest (lightweight)
  fastify.get('/trips/:tripId/manifest', async (req, reply) => {
    const { tripId } = req.params;
    // Accept JWT or reader API key
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');

    let authorized = false;
    if (token) {
      try {
        await fastify.jwt.verify(token);
        authorized = true;
      } catch (_) {
        // check reader API key
        const { rows } = await pool.query(
          'SELECT id FROM readers WHERE api_key = $1',
          [token],
        );
        authorized = rows.length > 0;
      }
    }
    if (!authorized) return reply.code(401).send({ error: 'Unauthorized' });

    const { rows: passengers } = await pool.query(
      `SELECT me.guest_id, g.name, me.status, me.last_seen_at,
              r.name AS last_reader
       FROM manifest_entries me
       JOIN guests g ON g.id = me.guest_id
       LEFT JOIN readers r ON r.id = me.last_reader_id
       WHERE me.trip_id = $1
       ORDER BY me.created_at`,
      [tripId],
    );
    const headcount = passengers.filter((p) => p.status === 'on_board').length;
    return { trip_id: tripId, passengers, headcount };
  });

  // Lock trip
  fastify.patch('/trips/:tripId/lock', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    if (req.user.role !== 'operator') return reply.code(403).send({ error: 'Operators only' });
    const { tripId } = req.params;

    const { rows } = await pool.query('SELECT * FROM trips WHERE id = $1', [tripId]);
    if (!rows[0]) return reply.code(404).send({ error: 'Trip not found' });
    if (rows[0].locked_at) return reply.code(409).send({ error: 'Already locked' });

    const { rows: updated } = await pool.query(
      'UPDATE trips SET locked_at = NOW() WHERE id = $1 RETURNING *',
      [tripId],
    );
    return updated[0];
  });

  // Manual check-in override
  fastify.post('/trips/:tripId/override', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    if (req.user.role !== 'operator') return reply.code(403).send({ error: 'Operators only' });
    const { tripId } = req.params;
    const { guest_id, status } = req.body;

    const validStatuses = ['pre_board', 'on_board', 'disembarked'];
    if (!guest_id || !validStatuses.includes(status)) {
      return reply.code(400).send({ error: 'guest_id and valid status required' });
    }

    const { rows } = await pool.query(
      `UPDATE manifest_entries SET status = $1, last_seen_at = NOW()
       WHERE trip_id = $2 AND guest_id = $3 RETURNING *`,
      [status, tripId, guest_id],
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Manifest entry not found' });

    // Broadcast via WebSocket
    const { rows: guestRows } = await pool.query(
      'SELECT name FROM guests WHERE id = $1',
      [guest_id],
    );
    const headcountRes = await pool.query(
      `SELECT COUNT(*) FROM manifest_entries WHERE trip_id = $1 AND status = 'on_board'`,
      [tripId],
    );
    fastify.broadcastManifestUpdate(tripId, {
      guest_id,
      name: guestRows[0]?.name,
      status,
      last_reader: null,
      last_seen_at: rows[0].last_seen_at,
    }, parseInt(headcountRes.rows[0].count, 10));

    return rows[0];
  });
}

module.exports = tripRoutes;
