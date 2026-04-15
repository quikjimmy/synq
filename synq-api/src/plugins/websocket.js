'use strict';

const fp = require('fastify-plugin');

/**
 * Registers the WebSocket route and exposes `fastify.broadcastManifestUpdate`.
 *
 * WS /ws/trips/:tripId  — subscribe to live manifest updates for a trip.
 * On connect: sends { type: "connected", tripId }
 * On manifest change: broadcasts { type: "manifest_update", passenger: {...}, headcount, trip_id }
 */
async function websocketPlugin(fastify) {
  // Map of tripId -> Set<WebSocket>
  const tripSockets = new Map();

  fastify.get('/ws/trips/:tripId', { websocket: true }, (socket, req) => {
    const { tripId } = req.params;

    if (!tripSockets.has(tripId)) tripSockets.set(tripId, new Set());
    tripSockets.get(tripId).add(socket);

    socket.send(JSON.stringify({ type: 'connected', tripId }));

    socket.on('close', () => {
      const sockets = tripSockets.get(tripId);
      if (sockets) {
        sockets.delete(socket);
        if (sockets.size === 0) tripSockets.delete(tripId);
      }
    });
  });

  fastify.decorate('broadcastManifestUpdate', (tripId, passenger, headcount) => {
    const sockets = tripSockets.get(tripId);
    if (!sockets || sockets.size === 0) return;
    const payload = JSON.stringify({ type: 'manifest_update', passenger, headcount, trip_id: tripId });
    for (const ws of sockets) {
      if (ws.readyState === 1 /* OPEN */) {
        ws.send(payload);
      }
    }
  });
}

// fastify-plugin is not in package.json — inline the wrapper
module.exports = async function registerWs(fastify) {
  await websocketPlugin(fastify);
};
