const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const WebSocket = require('ws');

const app = express();
const PORT = 3000;

// Middleware to parse binary payload
app.use(bodyParser.raw({ type: 'application/octet-stream', limit: '10kb' }));
app.use(cors());

// SQLite Database Initialization
const db = new sqlite3.Database('gps_data.db', (err) => {
    if (err) console.error('Error opening database:', err.message);
    else {
        console.log('Connected to SQLite database.');
        // Create table if it doesn't exist
        db.run(`CREATE TABLE IF NOT EXISTS gps_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            latitude REAL,
            longitude REAL,
            timestamp INTEGER,
            rssi INTEGER,
            snr REAL
        )`);
    }
});

// WebSocket Server
const wss = new WebSocket.Server({ port: 8080 });
console.log('WebSocket server running on ws://localhost:8080');

// Broadcast Data
const broadcastData = (data) => {
    const timestamp = new Date(data.timestamp * 1000); // Convert seconds to milliseconds
    const formattedDate = `${String(timestamp.getDate()).padStart(2, '0')}-${String(timestamp.getMonth() + 1).padStart(2, '0')}-${timestamp.getFullYear()}`;
    const formattedTime = `${String(timestamp.getHours()).padStart(2, '0')}:${String(timestamp.getMinutes()).padStart(2, '0')}:${String(timestamp.getSeconds()).padStart(2, '0')}`;

    const enhancedData = {
        latitude: data.latitude,
        longitude: data.longitude,
        date: formattedDate,
        time: formattedTime,
    };

    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(enhancedData));
        }
    });
};

// Decode Payload to Latitude and Longitude
const decodePayload = (payload) => {
    if (payload.length < 6) {
        throw new Error('Payload too short');
    }
    const latRaw = (payload[0] << 16) | (payload[1] << 8) | payload[2];
    const lonRaw = (payload[3] << 16) | (payload[4] << 8) | payload[5];

    // Handle sign extension for negative values
    const lat = ((latRaw << 8) >> 8) / 1e5;
    const lon = ((lonRaw << 8) >> 8) / 1e5;

    return { latitude: lat, longitude: lon };
};

// Endpoint to Receive GPS Data
app.post('/uplink', (req, res) => {
    try {
        const payload = req.body; // req.body is a Buffer containing the binary payload
        const { latitude, longitude } = decodePayload(payload);

        const timestamp = Math.floor(Date.now() / 1000); // Use current time as timestamp
        const rssi = null; // Set to null or extract from payload if available
        const snr = null;

        // Insert into SQLite Database with retry logic
        const insertWithRetry = (retries = 5) => {
            db.run(
                `INSERT INTO gps_data (latitude, longitude, timestamp, rssi, snr)
                 VALUES (?, ?, ?, ?, ?)`,
                [latitude, longitude, timestamp, rssi, snr],
                function (err) {
                    if (err && err.code === 'SQLITE_BUSY' && retries > 0) {
                        console.log('Database is locked. Retrying...');
                        setTimeout(() => insertWithRetry(retries - 1), 100); // Retry after 100ms
                    } else if (err) {
                        console.error('Error inserting data:', err.message);
                        res.status(500).send('Failed to store data.');
                    } else {
                        console.log('Inserted successfully:', { latitude, longitude, timestamp });
                        broadcastData({ latitude, longitude, timestamp });
                        res.status(200).send('Data received and stored.');
                    }
                }
            );
        };

        insertWithRetry();
    } catch (err) {
        console.error('Error processing uplink:', err.message);
        res.status(500).send('Failed to process data.');
    }
});

// Serve Static Files (Frontend)
app.use(express.static('public'));

// Start HTTP Server
app.listen(PORT, () => {
    console.log(`HTTP server is running on http://localhost:${PORT}`);
});
