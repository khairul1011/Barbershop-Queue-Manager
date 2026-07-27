const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const db = require('./db');

const app = express();

app.use(cors());
app.use(express.json());

// GET /requests -> return semua baris, urutkan dari yang terbaru
app.get('/requests', (req, res) => {
  try {
    const stmt = db.prepare('SELECT * FROM requests ORDER BY receivedTime DESC');
    const rows = stmt.all();
    res.json(rows);
  } catch (error) {
    console.error('[API ERROR GET /requests]', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /requests -> buat baris baru
app.post('/requests', (req, res) => {
  try {
    const { senderName, senderPhone, message, extractedDay, extractedTime, extractedService } = req.body;
    
    // Asumsi: senderPhone dan message adalah field wajib menurut requirement schema
    if (!senderPhone || !message) {
      return res.status(400).json({ error: 'senderPhone and message are required' });
    }

    const id = crypto.randomUUID();
    const receivedTime = new Date().toISOString();
    const status = 'pending';

    const stmt = db.prepare(`
      INSERT INTO requests 
      (id, senderName, senderPhone, receivedTime, message, extractedDay, extractedTime, extractedService, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id, 
      senderName || null, 
      senderPhone, 
      receivedTime, 
      message, 
      extractedDay || null, 
      extractedTime || null, 
      extractedService || null, 
      status
    );

    // Ambil row yang baru saja dibuat
    const getStmt = db.prepare('SELECT * FROM requests WHERE id = ?');
    const newRow = getStmt.get(id);

    res.status(201).json(newRow);
  } catch (error) {
    console.error('[API ERROR POST /requests]', error);
    res.status(500).json({ error: error.message });
  }
});

// PATCH /requests/:id -> update status
app.patch('/requests/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['pending', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be pending, approved, or rejected.' });
    }

    const updateStmt = db.prepare('UPDATE requests SET status = ? WHERE id = ?');
    const result = updateStmt.run(status, id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }

    // Ambil row yang baru saja diupdate
    const getStmt = db.prepare('SELECT * FROM requests WHERE id = ?');
    const updatedRow = getStmt.get(id);

    res.json(updatedRow);
  } catch (error) {
    console.error('[API ERROR PATCH /requests/:id]', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = app;
