const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 60001;
const AUTH_DIR = path.join(__dirname, 'auth_info');

let sock = null;
let currentQR = null;
let isConnected = false;
let connectionStatus = 'disconnected';

if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        auth: state,
        version,
        logger: pino({ level: 'silent' }),
        browser: ['WhatsApp Panel', 'Chrome', '4.0.0']
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            currentQR = qr;
            isConnected = false;
            connectionStatus = 'waiting_scan';
            console.log('QR received - ready to scan');
        }

        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            console.log('Connection closed. Reason:', reason);

            if (reason === DisconnectReason.loggedOut) {
                console.log('Logged out - clearing auth');
                fs.rmSync(AUTH_DIR, { recursive: true, force: true });
                fs.mkdirSync(AUTH_DIR, { recursive: true });
                currentQR = null;
                isConnected = false;
                connectionStatus = 'logged_out';
                startBot();
            } else if (reason !== DisconnectReason.loggedOut) {
                currentQR = null;
                isConnected = false;
                connectionStatus = 'reconnecting';
                startBot();
            }
        }

        if (connection === 'open') {
            currentQR = null;
            isConnected = true;
            connectionStatus = 'connected';
            console.log('Connected to WhatsApp!');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.key.fromMe && msg.message) {
            const from = msg.key.remoteJid;
            const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
            console.log(`Message from ${from}: ${text}`);
        }
    });
}

// Health check
app.get('/', (req, res) => {
    res.json({ status: 'ok', service: 'WhatsApp Baileys Server', connected: isConnected });
});

// Get QR code
app.get('/qr', (req, res) => {
    if (isConnected) {
        return res.json({ connected: true, message: 'Already connected' });
    }
    if (currentQR) {
        return res.json({ connected: false, qr: currentQR });
    }
    res.json({ connected: false, qr: null, message: 'QR not ready yet. Wait a moment and try again.' });
});

// Get connection status
app.get('/status', (req, res) => {
    res.json({
        connected: isConnected,
        status: connectionStatus,
        hasQR: !!currentQR
    });
});

// Send message
app.post('/send-message', async (req, res) => {
    if (!isConnected || !sock) {
        return res.status(503).json({ success: false, error: 'Not connected to WhatsApp' });
    }

    const { phone, message } = req.body;
    if (!phone || !message) {
        return res.status(400).json({ success: false, error: 'Phone and message are required' });
    }

    try {
        const jid = phone.includes('@') ? phone : phone + '@s.whatsapp.net';
        const result = await sock.sendMessage(jid, { text: message });
        res.json({ success: true, messageId: result.key.id, to: phone });
    } catch (err) {
        console.error('Send error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Send image
app.post('/send-image', async (req, res) => {
    if (!isConnected || !sock) {
        return res.status(503).json({ success: false, error: 'Not connected to WhatsApp' });
    }

    const { phone, imageUrl, caption } = req.body;
    if (!phone || !imageUrl) {
        return res.status(400).json({ success: false, error: 'Phone and imageUrl are required' });
    }

    try {
        const jid = phone.includes('@') ? phone : phone + '@s.whatsapp.net';
        const result = await sock.sendMessage(jid, {
            image: { url: imageUrl },
            caption: caption || ''
        });
        res.json({ success: true, messageId: result.key.id, to: phone });
    } catch (err) {
        console.error('Send image error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Logout
app.post('/logout', async (req, res) => {
    try {
        if (sock) {
            await sock.logout();
            sock = null;
        }
        isConnected = false;
        currentQR = null;
        connectionStatus = 'logged_out';
        if (fs.existsSync(AUTH_DIR)) {
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
            fs.mkdirSync(AUTH_DIR, { recursive: true });
        }
        res.json({ success: true, message: 'Logged out' });
    } catch (err) {
        console.error('Logout error:', err.message);
        res.json({ success: false, error: err.message });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Baileys server running on port ${PORT}`);
    startBot();
});
