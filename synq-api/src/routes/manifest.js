'use strict';

const PDFDocument = require('pdfkit');
const pool = require('../db/pool');

async function manifestRoutes(fastify) {
  /**
   * GET /trips/:tripId/manifest.pdf
   *
   * Streams a Coast Guard-format passenger manifest PDF.
   * Auth: operator JWT.
   * Target: <30s (typically <1s for 25 passengers).
   */
  fastify.get('/trips/:tripId/manifest.pdf', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const { tripId } = req.params;

    // Fetch trip + vessel in one query
    const { rows: tripRows } = await pool.query(
      `SELECT t.*, v.name AS vessel_name, v.capacity,
              o.name AS operator_name
       FROM trips t
       JOIN vessels v ON v.id = t.vessel_id
       JOIN operators o ON o.id = t.operator_id
       WHERE t.id = $1`,
      [tripId],
    );
    const trip = tripRows[0];
    if (!trip) return reply.code(404).send({ error: 'Trip not found' });

    // Fetch all manifest entries with guest details
    const { rows: passengers } = await pool.query(
      `SELECT me.status, me.last_seen_at, me.checked_in_at,
              g.name, g.dob, g.emergency_contact, g.rfid_uuid,
              r.name AS last_reader_name
       FROM manifest_entries me
       JOIN guests g ON g.id = me.guest_id
       LEFT JOIN readers r ON r.id = me.last_reader_id
       WHERE me.trip_id = $1
       ORDER BY me.checked_in_at ASC NULLS LAST, g.name ASC`,
      [tripId],
    );

    const onBoardCount = passengers.filter((p) => p.status === 'on_board').length;
    const lockedAt = trip.locked_at ? new Date(trip.locked_at) : null;
    const tripDate = new Date(trip.created_at);

    // Build PDF
    reply.raw.setHeader('Content-Type', 'application/pdf');
    reply.raw.setHeader(
      'Content-Disposition',
      `attachment; filename="manifest-${tripId.slice(0, 8)}.pdf"`,
    );

    const doc = new PDFDocument({ margin: 50, size: 'LETTER' });
    doc.pipe(reply.raw);

    // — Header —
    doc.fontSize(18).font('Helvetica-Bold').text('PASSENGER MANIFEST', { align: 'center' });
    doc.fontSize(11).font('Helvetica').text('(U.S. Coast Guard Format)', { align: 'center' });
    doc.moveDown(0.5);

    // Vessel info block
    const dateStr = tripDate.toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    });
    const timeStr = tripDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    drawInfoRow(doc, 'Vessel Name:', trip.vessel_name);
    drawInfoRow(doc, 'Operator:', trip.operator_name);
    drawInfoRow(doc, 'Trip Date:', dateStr);
    drawInfoRow(doc, 'Departure Time:', timeStr);
    drawInfoRow(doc, 'Trip ID:', tripId);
    if (lockedAt) {
      drawInfoRow(doc, 'Manifest Locked:', lockedAt.toLocaleString('en-US'));
    }
    doc.moveDown(1);

    // — Passenger table header —
    const PAGE_WIDTH = doc.page.width - 100; // margins = 50 each side
    const COL = {
      num: 25,
      name: 140,
      dob: 75,
      status: 80,
      checkin: 85,
      emergency: PAGE_WIDTH - 25 - 140 - 75 - 80 - 85,
    };

    doc.fontSize(9).font('Helvetica-Bold');
    let x = 50;
    let y = doc.y;
    doc.rect(x, y, PAGE_WIDTH, 16).fill('#e8eaed');
    doc.fillColor('#111');
    doc.text('#', x, y + 4, { width: COL.num });
    x += COL.num;
    doc.text('PASSENGER NAME', x, y + 4, { width: COL.name });
    x += COL.name;
    doc.text('DATE OF BIRTH', x, y + 4, { width: COL.dob });
    x += COL.dob;
    doc.text('STATUS', x, y + 4, { width: COL.status });
    x += COL.status;
    doc.text('CHECK-IN', x, y + 4, { width: COL.checkin });
    x += COL.checkin;
    doc.text('EMERGENCY CONTACT', x, y + 4, { width: COL.emergency });
    doc.moveDown(0.2);

    // — Rows —
    doc.font('Helvetica').fontSize(8);
    passengers.forEach((p, i) => {
      // Page break if needed
      if (doc.y > doc.page.height - 120) {
        doc.addPage();
      }

      y = doc.y;
      x = 50;
      const rowBg = i % 2 === 0 ? '#ffffff' : '#f8f9fb';
      doc.rect(x, y, PAGE_WIDTH, 14).fill(rowBg);
      doc.fillColor('#111');

      const dobStr = p.dob ? new Date(p.dob).toLocaleDateString('en-US') : '—';
      const checkinStr = p.checked_in_at
        ? new Date(p.checked_in_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        : '—';
      const statusLabel = { pre_board: 'Pre-Board', on_board: 'On Board', disembarked: 'Disembarked' }[p.status] || p.status;

      doc.text(String(i + 1), x, y + 3, { width: COL.num });
      x += COL.num;
      doc.text(p.name || '—', x, y + 3, { width: COL.name - 4, ellipsis: true });
      x += COL.name;
      doc.text(dobStr, x, y + 3, { width: COL.dob });
      x += COL.dob;

      // Color-coded status
      const statusColor = { pre_board: '#888', on_board: '#16a34a', disembarked: '#b45309' }[p.status] || '#888';
      doc.fillColor(statusColor).text(statusLabel, x, y + 3, { width: COL.status });
      doc.fillColor('#111');
      x += COL.status;

      doc.text(checkinStr, x, y + 3, { width: COL.checkin });
      x += COL.checkin;
      doc.text(p.emergency_contact || '—', x, y + 3, { width: COL.emergency - 4, ellipsis: true });

      doc.moveDown(0.15);
    });

    // — Footer summary —
    doc.moveDown(1);
    doc.moveTo(50, doc.y).lineTo(50 + PAGE_WIDTH, doc.y).stroke();
    doc.moveDown(0.4);

    doc.font('Helvetica-Bold').fontSize(10);
    doc.text(`Total Passengers: ${passengers.length}`, 50);
    doc.text(`On Board: ${onBoardCount}`, 50);
    doc.text(
      `Disembarked: ${passengers.filter((p) => p.status === 'disembarked').length}`,
      50,
    );
    doc.moveDown(1.5);

    // Signature field
    doc.font('Helvetica').fontSize(9);
    doc.text('Operator Signature: ___________________________________    Date: ___________', 50);
    doc.moveDown(0.5);
    doc.text('Printed Name: ___________________________________', 50);

    // Finalize
    doc.end();

    // Signal Fastify that we handled the reply via raw stream
    await reply;
  });
}

function drawInfoRow(doc, label, value) {
  doc.fontSize(10)
    .font('Helvetica-Bold').text(label + ' ', { continued: true })
    .font('Helvetica').text(String(value || '—'));
}

module.exports = manifestRoutes;
