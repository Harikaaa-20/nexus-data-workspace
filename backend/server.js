require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const csv = require('csv-parser');
const sqlite3 = require('sqlite3').verbose();

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const upload = multer({ dest: 'uploads/' });

const db = new sqlite3.Database('./database.sqlite', (err) => {
  if (err) console.error("Database error:", err.message);
  else {
    console.log("Connected to the SQLite database.");
    db.serialize(() => {
      db.run(`CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id TEXT,
        username TEXT,
        text TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS datasets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id TEXT,
        filename TEXT,
        columns TEXT,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS dataset_rows (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dataset_id INTEGER,
        row_data TEXT
      )`);
    });
  }
});

const activeRoomDatasets = {};

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Collaborative AI Data Workspace Server is running' });
});

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const roomId = req.body.room_id || 'default';
  const results = [];
  const columns = new Set();

  fs.createReadStream(req.file.path)
    .pipe(csv())
    .on('data', (data) => {
      Object.keys(data).forEach(key => columns.add(key.trim().toLowerCase()));
      const parsedRow = {};
      for (const [key, val] of Object.entries(data)) {
        const num = parseFloat(val);
        parsedRow[key.trim().toLowerCase()] = isNaN(num) ? val : num;
      }
      results.push(parsedRow);
    })
    .on('end', () => {
      const colArray = Array.from(columns);
      db.run(`INSERT INTO datasets (room_id, filename, columns) VALUES (?, ?, ?)`, [roomId, req.file.originalname, JSON.stringify(colArray)], function (err) {
        if (err) {
          console.error("Failed to save dataset info", err);
          return res.status(500).json({ error: 'Database error' });
        }

        const datasetId = this.lastID;
        const stmt = db.prepare(`INSERT INTO dataset_rows (dataset_id, row_data) VALUES (?, ?)`);

        db.serialize(() => {
          db.run("BEGIN TRANSACTION");
          results.forEach(row => {
            stmt.run(datasetId, JSON.stringify(row));
          });
          stmt.finalize();
          db.run("COMMIT", err => {
            if (err) console.error("Transaction commit error", err);

            activeRoomDatasets[roomId] = {
              id: datasetId,
              filename: req.file.originalname,
              columns: colArray,
              rows: results
            };

            fs.unlinkSync(req.file.path);

            const fileMetaData = {
              id: datasetId,
              originalName: req.file.originalname,
              size: req.file.size,
              columns: colArray,
              rowCount: results.length
            };

            io.to(roomId).emit('data_uploaded', fileMetaData);

            db.all("SELECT id, filename, uploaded_at FROM datasets WHERE room_id = ? ORDER BY id DESC", [roomId], (err, rows) => {
              if (!err && rows) {
                io.to(roomId).emit('available_datasets', rows);
                io.to(roomId).emit('dataset_changed', fileMetaData);
              }
            });

            res.json({ success: true, metadata: fileMetaData });
          });
        });
      });
    });
});

function processDataQuery(queryStr, dataset) {
  const query = queryStr.toLowerCase();

  if (!dataset || !dataset.rows || dataset.rows.length === 0) {
    return { title: 'No Data Uploaded', type: 'error', data: [] };
  }

  let chartData = [];
  let title = queryStr;
  let chartType = 'bar';

  if (query.includes('trend') || query.includes('over time') || query.includes('line')) {
    chartType = 'line';
  } else if (query.includes('proportion') || query.includes('share') || query.includes('pie')) {
    chartType = 'pie';
  }

  const isAverage = query.includes('average') || query.includes('avg');

  if (query.includes('by')) {
    const preWhere = query.split('where')[0];
    const postWhere = query.split('where')[1];

    const parts = preWhere.replace('show', '').replace('plot', '').trim().split('by');
    const valueRaw = parts[0].trim();
    const categoryRaw = parts[1] ? parts[1].trim() : '';

    const valueCol = dataset.columns.find(c => valueRaw.includes(c) || c.includes(valueRaw));
    const categoryCol = dataset.columns.find(c => categoryRaw.includes(c) || c.includes(categoryRaw));

    // Handle WHERE filters mathematically
    let filterCatCol = null;
    let filterValRaw = null;
    if (postWhere && postWhere.includes(' is ')) {
      const wParts = postWhere.split(' is ');
      filterCatCol = dataset.columns.find(c => wParts[0].trim().includes(c) || c.includes(wParts[0].trim()));
      filterValRaw = wParts[1].trim();
    }

    if (valueCol && categoryCol) {
      title = `${isAverage ? 'AVG' : 'SUM'} of ${valueCol.toUpperCase()} by ${categoryCol.toUpperCase()}`;
      if (filterCatCol && filterValRaw) title += ` (Filtered: ${filterCatCol}=${filterValRaw})`;

      const map = {};
      const counts = {};
      dataset.rows.forEach(row => {
        if (filterCatCol && filterValRaw) {
          const actualCell = String(row[filterCatCol] || '').toLowerCase();
          if (!actualCell.includes(filterValRaw)) return; // Skip mathematically
        }

        const cat = row[categoryCol] || 'Unknown';
        const val = Number(row[valueCol]) || 0;
        if (!map[cat]) { map[cat] = 0; counts[cat] = 0; }
        map[cat] += val;
        counts[cat]++;
      });

      if (isAverage) {
        Object.keys(map).forEach(key => { map[key] = parseFloat((map[key] / counts[key]).toFixed(2)); });
      }

      chartData = Object.entries(map).map(([name, value]) => ({ name, value }));

      chartData.sort((a, b) => b.value - a.value);
      chartData = chartData.slice(0, 7);
    } else {
      title = "Columns not found (Auto-fallback)";
      chartData = dataset.rows.slice(0, 5).map((row, i) => {
        const fallbackVal = Number(row[dataset.columns[1]]);
        return {
          name: String(row[dataset.columns[0]] || `Item ${i}`),
          value: isNaN(fallbackVal) ? Math.floor(Math.random() * 100) + 10 : fallbackVal
        };
      });
    }
  } else {
    title = "Data Preview";
    chartData = dataset.rows.slice(0, 5).map((row, i) => {
      const fallbackVal = Number(row[dataset.columns[1]]);
      return {
        name: String(row[dataset.columns[0]] || `Item ${i}`),
        value: isNaN(fallbackVal) ? Math.floor(Math.random() * 100) + 10 : fallbackVal
      };
    });
  }

  return { title, type: chartType, data: chartData };
}

io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  socket.on('join_workspace', (data) => {
    const roomId = data.roomId || 'default';
    socket.join(roomId);

    socket.roomId = roomId;
    socket.to(roomId).emit('user_joined', { username: data.username, id: socket.id });

    // Send persistent chat history scoped to this room
    db.all("SELECT username, text FROM messages WHERE room_id = ? ORDER BY timestamp ASC LIMIT 50", [roomId], (err, rows) => {
      if (!err && rows) {
        socket.emit('chat_history', rows.map(r => ({ user: r.username, text: r.text })));
      }
    });

    // Send available datasets for this room
    db.all("SELECT id, filename, uploaded_at FROM datasets WHERE room_id = ? ORDER BY id DESC", [roomId], (err, rows) => {
      if (!err && rows) {
        socket.emit('available_datasets', rows);
      }
    });

    // Lazy load room active dataset if not loaded
    if (!activeRoomDatasets[roomId]) {
      db.get("SELECT id, filename, columns FROM datasets WHERE room_id = ? ORDER BY id DESC LIMIT 1", [roomId], (err, row) => {
        if (row) {
          activeRoomDatasets[roomId] = {
            id: row.id,
            filename: row.filename,
            columns: JSON.parse(row.columns),
            rows: []
          };
          db.all("SELECT row_data FROM dataset_rows WHERE dataset_id = ?", [row.id], (err, rows) => {
            if (rows) {
              activeRoomDatasets[roomId].rows = rows.map(r => JSON.parse(r.row_data));
              socket.emit('dataset_changed', {
                id: row.id,
                originalName: row.filename,
                columns: activeRoomDatasets[roomId].columns,
                rowCount: activeRoomDatasets[roomId].rows.length
              });
            }
          });
        }
      });
    } else {
      socket.emit('dataset_changed', {
        id: activeRoomDatasets[roomId].id,
        originalName: activeRoomDatasets[roomId].filename,
        columns: activeRoomDatasets[roomId].columns,
        rowCount: activeRoomDatasets[roomId].rows.length
      });
    }
  });

  socket.on('switch_dataset', (datasetId) => {
    const roomId = socket.roomId || 'default';
    db.get("SELECT id, filename, columns FROM datasets WHERE id = ? AND room_id = ?", [datasetId, roomId], (err, row) => {
      if (row) {
        activeRoomDatasets[roomId] = {
          id: row.id,
          filename: row.filename,
          columns: JSON.parse(row.columns),
          rows: []
        };
        db.all("SELECT row_data FROM dataset_rows WHERE dataset_id = ?", [row.id], (err, rows) => {
          if (rows) {
            activeRoomDatasets[roomId].rows = rows.map(r => JSON.parse(r.row_data));
            const meta = {
              id: row.id,
              originalName: row.filename,
              columns: activeRoomDatasets[roomId].columns,
              rowCount: activeRoomDatasets[roomId].rows.length
            };
            io.to(roomId).emit('dataset_changed', meta);

            const msg = `Workspace active dataset switched to: \${row.filename}`;
            db.run("INSERT INTO messages (room_id, username, text) VALUES (?, ?, ?)", [roomId, 'System', msg]);
            io.to(roomId).emit('new_message', { system: true, text: msg });
          }
        });
      }
    });
  });

  socket.on('ai_query', (queryData) => {
    const roomId = socket.roomId || 'default';
    db.run("INSERT INTO messages (room_id, username, text) VALUES (?, ?, ?)", [roomId, queryData.username, queryData.query]);
    socket.to(roomId).emit('new_message', { user: queryData.username, text: queryData.query });
    io.to(roomId).emit('ai_typing', { status: true });

    setTimeout(() => {
      io.to(roomId).emit('ai_typing', { status: false });
      const generatedChart = processDataQuery(queryData.query, activeRoomDatasets[roomId]);
      generatedChart.generatedBy = queryData.username;

      io.to(roomId).emit('chart_generated', generatedChart);
      db.run("INSERT INTO messages (room_id, username, text) VALUES (?, ?, ?)", [roomId, 'AI', `Generated chart: \${generatedChart.title}`]);
    }, 1200);
  });

  socket.on('cursor_move', (cursorData) => {
    if (!socket.roomId) return;
    socket.to(socket.roomId).emit('cursor_moved', {
      id: socket.id,
      username: cursorData.username,
      x: cursorData.x,
      y: cursorData.y,
      color: cursorData.color
    });
  });

  socket.on('disconnect', () => {
    if (socket.roomId) {
      io.to(socket.roomId).emit('user_left', { id: socket.id });
    }
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
