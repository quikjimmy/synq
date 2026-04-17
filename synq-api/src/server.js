'use strict';

require('dotenv').config();

const Fastify = require('fastify');

async function build() {
  const fastify = Fastify({ logger: { level: 'info' } });

  // CORS
  await fastify.register(require('@fastify/cors'), {
    origin: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // JWT
  await fastify.register(require('@fastify/jwt'), {
    secret: process.env.JWT_SECRET || 'synq-demo-secret',
  });

  // Auth decorator
  fastify.decorate('authenticate', async function (req, reply) {
    try {
      await req.jwtVerify();
    } catch (err) {
      reply.code(401).send({ error: 'Unauthorized' });
    }
  });

  // WebSocket (must register before routes that use websocket: true)
  await fastify.register(require('@fastify/websocket'));
  await fastify.register(require('./plugins/websocket'));

  // Routes
  await fastify.register(require('./routes/auth'));
  await fastify.register(require('./routes/vessels'));
  await fastify.register(require('./routes/trips'));
  await fastify.register(require('./routes/rfid'));
  await fastify.register(require('./routes/manifest'));

  // Health + root
  fastify.get('/health', async () => ({ ok: true, ts: new Date().toISOString() }));
  fastify.get('/', async () => ({ service: 'synq-api', status: 'ok', version: '1.0.0', docs: '/health' }));

  return fastify;
}

async function start() {
  const app = await build();
  const port = parseInt(process.env.PORT || '3200', 10);
  try {
    await app.listen({ port, host: '0.0.0.0' });
    console.log(`Synq API listening on port ${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();

module.exports = build;
