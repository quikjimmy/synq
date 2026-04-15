'use strict';

const { v4: uuidv4 } = require('uuid');
const pool = require('../db/pool');

async function vesselRoutes(fastify) {
  // Create vessel
  fastify.post('/operators/vessels', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    if (req.user.role !== 'operator') return reply.code(403).send({ error: 'Operators only' });
    const { name, capacity } = req.body;
    if (!name) return reply.code(400).send({ error: 'name required' });

    const { rows } = await pool.query(
      'INSERT INTO vessels (operator_id, name, capacity) VALUES ($1,$2,$3) RETURNING *',
      [req.user.sub, name, capacity || 50],
    );
    return reply.code(201).send(rows[0]);
  });

  // List vessels
  fastify.get('/operators/vessels', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    if (req.user.role !== 'operator') return reply.code(403).send({ error: 'Operators only' });
    const { rows } = await pool.query(
      'SELECT * FROM vessels WHERE operator_id = $1 ORDER BY created_at',
      [req.user.sub],
    );
    return rows;
  });

  // Get readers for vessel
  fastify.get('/operators/vessels/:vesselId/readers', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const { vesselId } = req.params;
    const { rows } = await pool.query(
      'SELECT id, vessel_id, name, is_exit, last_seen_at, created_at FROM readers WHERE vessel_id = $1 ORDER BY created_at',
      [vesselId],
    );
    return rows;
  });

  // Create reader
  fastify.post('/operators/vessels/:vesselId/readers', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    if (req.user.role !== 'operator') return reply.code(403).send({ error: 'Operators only' });
    const { vesselId } = req.params;
    const { name, is_exit } = req.body;
    if (!name) return reply.code(400).send({ error: 'name required' });

    const apiKey = `rdr_${uuidv4().replace(/-/g, '')}`;
    const { rows } = await pool.query(
      `INSERT INTO readers (vessel_id, name, api_key, is_exit)
       VALUES ($1,$2,$3,$4)
       RETURNING id, vessel_id, name, is_exit, last_seen_at, created_at`,
      [vesselId, name, apiKey, is_exit || false],
    );
    return reply.code(201).send({ reader: rows[0], api_key: apiKey });
  });

  // List trips for vessel
  fastify.get('/operators/vessels/:vesselId/trips', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const { vesselId } = req.params;
    const { rows } = await pool.query(
      'SELECT * FROM trips WHERE vessel_id = $1 ORDER BY created_at DESC',
      [vesselId],
    );
    return rows;
  });
}

module.exports = vesselRoutes;
