'use strict';

const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db/pool');

async function authRoutes(fastify) {
  // Operator login
  fastify.post('/auth/operator/login', async (req, reply) => {
    const { email, password } = req.body;
    if (!email || !password) return reply.code(400).send({ error: 'email and password required' });

    const { rows } = await pool.query(
      'SELECT * FROM operators WHERE email = $1',
      [email.toLowerCase()],
    );
    const op = rows[0];
    if (!op || !(await bcrypt.compare(password, op.password_hash))) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    const token = fastify.jwt.sign(
      { sub: op.id, role: 'operator', email: op.email, name: op.name },
      { expiresIn: '7d' },
    );
    return { token, operator: { id: op.id, email: op.email, name: op.name } };
  });

  // Operator register (for demo setup)
  fastify.post('/auth/operator/register', async (req, reply) => {
    const { email, password, name } = req.body;
    if (!email || !password || !name) {
      return reply.code(400).send({ error: 'email, password, name required' });
    }
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      'INSERT INTO operators (email, password_hash, name) VALUES ($1,$2,$3) RETURNING id, email, name',
      [email.toLowerCase(), hash, name],
    );
    const op = rows[0];
    const token = fastify.jwt.sign(
      { sub: op.id, role: 'operator', email: op.email, name: op.name },
      { expiresIn: '7d' },
    );
    return reply.code(201).send({ token, operator: op });
  });

  // Guest register
  fastify.post('/auth/guest/register', async (req, reply) => {
    const { email, password, name, dob, emergency_contact, rfid_uuid } = req.body;
    if (!email || !password || !name) {
      return reply.code(400).send({ error: 'email, password, name required' });
    }
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO guests (email, password_hash, name, dob, emergency_contact, rfid_uuid)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, email, name, dob, emergency_contact, rfid_uuid`,
      [email.toLowerCase(), hash, name, dob || null, emergency_contact || null, rfid_uuid || null],
    );
    const guest = rows[0];
    const token = fastify.jwt.sign(
      { sub: guest.id, role: 'guest', email: guest.email, name: guest.name },
      { expiresIn: '7d' },
    );
    return reply.code(201).send({ token, guest });
  });

  // Guest wristband link (PATCH /guests/me/wristband)
  fastify.patch(
    '/guests/me/wristband',
    { preHandler: fastify.authenticate },
    async (req, reply) => {
      const { rfid_uuid } = req.body || {};
      if (!rfid_uuid) return reply.code(400).send({ error: 'rfid_uuid required' });
      const guestId = req.user.sub;
      const { rows } = await pool.query(
        `UPDATE guests SET rfid_uuid = $1 WHERE id = $2
         RETURNING id, email, name, dob, emergency_contact, rfid_uuid`,
        [rfid_uuid, guestId],
      );
      if (!rows[0]) return reply.code(404).send({ error: 'Guest not found' });
      return rows[0];
    },
  );

  // Guest login
  fastify.post('/auth/guest/login', async (req, reply) => {
    const { email, password } = req.body;
    if (!email || !password) return reply.code(400).send({ error: 'email and password required' });

    const { rows } = await pool.query(
      'SELECT * FROM guests WHERE email = $1',
      [email.toLowerCase()],
    );
    const guest = rows[0];
    if (!guest || !(await bcrypt.compare(password, guest.password_hash))) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    const token = fastify.jwt.sign(
      { sub: guest.id, role: 'guest', email: guest.email, name: guest.name },
      { expiresIn: '7d' },
    );
    return { token, guest: { id: guest.id, email: guest.email, name: guest.name, rfid_uuid: guest.rfid_uuid } };
  });
}

module.exports = authRoutes;
