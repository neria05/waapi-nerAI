require('dotenv').config(); // הוספת שורת קוד זו לייבוא משתני הסביבה
const express = require("express");
const {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
} = require("@whiskeysockets/baileys");
const QRCode = require("qrcode");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const basicAuth = require('express-basic-auth'); // ייבוא הספרייה לאימות בסיסי

const app = express();
const port = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// הוספת אימות בסיסי
app.use(basicAuth({
  users: { [process.env.USERNAME]: process.env.PASSWORD },
  challenge: true,
  unauthorizedResponse: 'Unauthorized'
}));

let sessions = {};

// Load API keys from a file (if it exists)
const apiKeysFilePath = path.join(__dirname, "api_keys.json");
let apiKeys = {};
if (fs.existsSync(apiKeysFilePath)) {
  apiKeys = JSON.parse(fs.readFileSync(apiKeysFilePath, "utf-8"));
}

// Save API keys to a file
const saveApiKeys = () => {
  fs.writeFileSync(apiKeysFilePath, JSON.stringify(apiKeys, null, 2));
};

// Load webhook URLs from a file (if it exists)
const webhookFilePath = path.join(__dirname, "webhooks.json");
let webhooks = {};
if (fs.existsSync(webhookFilePath)) {
  webhooks = JSON.parse(fs.readFileSync(webhookFilePath, "utf-8"));
}

// Save webhook URLs to a file
const saveWebhooks = () => {
  fs.writeFileSync(webhookFilePath, JSON.stringify(webhooks, null, 2));
};

// Function to initialize a socket connection for a given session ID
const startSock = async (sessionId) => {
    console.log(`Starting socket for session: ${sessionId}`);
    const sessionFilePath = `./sessions/${sessionId}`;
    const { state, saveCreds } = await useMultiFileAuthState(sessionFilePath);

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false
    });

    const messageCache = new Set(); // Cache to store recently processed messages

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        console.log(`Connection update for session ${sessionId}:`, update);
        const { connection, qr, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut);
            console.log(`Connection closed for session ${sessionId}. Reconnecting: ${shouldReconnect}`);
            if (shouldReconnect) {
                startSock(sessionId);
            }
        } else if (connection === 'open') {
            console.log(`Connection opened for session ${sessionId}`);
            const userJid = sock.user.id;
            sock.sendMessage(userJid, { text: "המספר חובר בהצלחה" });
        } else if (qr) {
            console.log(`QR code generated for session ${sessionId}`);
            const qrCodeUrl = await QRCode.toDataURL(qr);
            sessions[sessionId].qrCodeUrl = qrCodeUrl;
        }
    });

    sock.ev.on('messages.upsert', async (upsert) => {
        console.log('Received new message:', upsert);
        const message = upsert.messages[0];
        const chatId = message.key.remoteJid;
        const senderNumber = chatId.split('@')[0];
        const messageId = message.key.id;
        const messageContent = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
        const fromMe = message.key.fromMe;

        // Determine message type
        let type = 'unknown';
        if (message.message?.conversation) type = 'text';
        else if (message.message?.imageMessage) type = 'image';
        else if (message.message?.documentMessage) type = 'document';
        else if (message.message?.audioMessage) type = 'audio';
        else if (message.message?.videoMessage) type = 'video';
        else if (message.message?.stickerMessage) type = 'sticker';

        // Check if this message has been processed recently
        const cacheKey = `${chatId}:${messageId}`;
        if (messageCache.has(cacheKey)) {
            console.log('Message already processed, skipping');
            return;
        }

        // Add message to cache
        messageCache.add(cacheKey);

        // Remove from cache after 1 minute to prevent memory leak
        setTimeout(() => messageCache.delete(cacheKey), 60000);

        const webhookUrl = webhooks[sessionId];
        if (webhookUrl) {
            try {
                // Prepare webhook payload
                const webhookPayload = {
                    sessionId,
                    senderNumber,
                    messageId,
                    messageContent,
                    timestamp: message.messageTimestamp,
                    chatId,
                    isGroup: chatId.endsWith('@g.us'),
                    fromMe,
                    type,
                    // Add more fields as needed
                };

                console.log('Sending webhook payload:', webhookPayload);

                const response = await axios.post(webhookUrl, JSON.stringify(webhookPayload), {
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
                
                // Send the webhook response back as a reply only if it's not from the bot itself
                if (response.data && !fromMe) {
                    const replyMessage = response.data;
                    await sock.sendMessage(chatId, { text: replyMessage });
                }
            } catch (error) {
                console.error('Error sending webhook:', error.response ? error.response.data : error.message);
                // You might want to implement a retry mechanism or queue here
            }
        } else {
            console.log(`No webhook URL configured for session ${sessionId}`);
        }
    });

    console.log(`Socket initialized for session ${sessionId}`);
    sessions[sessionId] = { sock, qrCodeUrl: null };
};

// Function to restore sessions on startup
const restoreSessions = async () => {
  try {
    const sessionsDir = "./sessions";
    if (fs.existsSync(sessionsDir)) {
      const sessionFiles = fs.readdirSync(sessionsDir);
      for (const sessionId of sessionFiles) {
        console.log(`Attempting to restore session: ${sessionId}`);
        await startSock(sessionId);
      }
    } else {
      console.log("Sessions directory not found. No sessions to restore.");
    }
  } catch (error) {
    console.error("Error restoring sessions:", error);
  }
};

restoreSessions();

// Endpoint to get all sessions
app.get("/sessions", (req, res) => {
  const sessionList = Object.keys(sessions).map((sessionId) => ({
    sessionId,
    status:
      sessions[sessionId] && sessions[sessionId].sock ? "RUNNING" : "STOPPED",
    apiKey: apiKeys[sessionId] || "",
    webhook: webhooks[sessionId] || "",
    qrCode:
      sessions[sessionId] && sessions[sessionId].qrCodeUrl
        ? sessions[sessionId].qrCodeUrl
        : null,
  }));
  res.json(sessionList);
});

// Endpoint to start the socket for a given session ID
app.get("/start/:sessionId", async (req, res) => {
  const { sessionId } = req.params;
  try {
    await startSock(sessionId);
    res.status(200).send(`STARTED : ${sessionId}`);
  } catch (error) {
    console.error(`Error starting socket for session ${sessionId}`, error);
    res.status(500).send(`Failed to start socket for session ${sessionId}`);
  }
});

// Endpoint to set the webhook URL for a specific session ID
app.post("/set-webhook/:sessionId", (req, res) => {
  const { sessionId } = req.params;
  const { webhookUrl } = req.body;

  if (!webhookUrl) {
    return res.status(400).send("Missing webhookUrl");
  }

  webhooks[sessionId] = webhookUrl;
  saveWebhooks();

  res.status(200).send(`Webhook URL set for session ${sessionId}`);
});

// Endpoint to generate a new API key for a specific session ID
app.post("/genapi/:sessionId", async (req, res) => {
  const { sessionId } = req.params;
  const apiKey = crypto.randomBytes(32).toString("hex");
  apiKeys[sessionId] = apiKey;
  saveApiKeys();

  // Initialize the session
  if (!sessions[sessionId]) {
    await startSock(sessionId);
  }

  res.status(200).send({ sessionId, apiKey });
});

// Endpoint to delete the API key and session for a specific session ID
app.delete("/delapi/:sessionId", (req, res) => {
  const { sessionId } = req.params;
  console.log(`Received request to delete session ${sessionId}`);

  if (!apiKeys[sessionId]) {
    console.log(`API key not found for session ${sessionId}`);
    return res.status(404).send(`API key not found for session ${sessionId}`);
  }

  // מחיקת מפתח ה-API
  delete apiKeys[sessionId];
  saveApiKeys();
  console.log(`API key deleted for session ${sessionId}`);

  // מחיקת הסשן עצמו
  if (sessions[sessionId]) {
    // סגירת החיבור
    sessions[sessionId].sock.end();
    delete sessions[sessionId];
    console.log(`Session ${sessionId} deleted from memory`);
  }

  // מחיקת קבצי האימות והחיבור
  const sessionFilePath = path.join(__dirname, "sessions", sessionId);
  fs.rm(sessionFilePath, { recursive: true, force: true }, (err) => {
    if (err) {
      console.error(`Error deleting session files for ${sessionId}:`, err);
      return res.status(500).send(`Failed to delete session files for ${sessionId}`);
    }

    console.log(`Session files deleted for ${sessionId}`);
    res.status(200).send(`API key and session deleted for ${sessionId}`);
  });
});

// Endpoint to get QR code for a specific session
app.get("/qr/:sessionId", (req, res) => {
  const { sessionId } = req.params;
  const session = sessions[sessionId];
  if (session && session.qrCodeUrl) {
    res.json({ qrCode: session.qrCodeUrl });
  } else if (session) {
    res
      .status(202)
      .send("QR code not yet generated. Please wait and try again.");
  } else {
    res.status(404).send("Session not found");
  }
});

// api endpoints for sessions
// Middleware to check API key
const checkApiKey = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    const { sessionId } = req.params;

    if (!apiKey) {
        return res.status(403).send('API key is required');
    }
    if (!sessionId) {
        return res.status(403).send('Session ID is required');
    }
    if (apiKeys[sessionId] !== apiKey) {
        return res.status(403).send(`Invalid API key for session ${sessionId}`);
    }

    next();
};

// Endpoint to send a message
app.post('/message/:sessionId', checkApiKey, async (req, res) => {
    const { sessionId } = req.params;
    const { id, text } = req.body;

    if (!id || !text) {
        return res.status(400).send('Missing id or text in request body');
    }

    const session = sessions[sessionId];
    if (!session || !session.sock) {
        return res.status(404).send(`Session ${sessionId} not found or not connected`);
    }

    try {
        await session.sock.sendMessage(id, { text });
        res.status(200).send('Message sent successfully');
    } catch (error) {
        console.error(`Error sending message for session ${sessionId}:`, error);
        res.status(500).send('Failed to send message');
    }
});

// Endpoint to check if a number exists on WhatsApp
app.get('/checkno/:sessionId/:phone', checkApiKey, async (req, res) => {
    const { sessionId, phone } = req.params;

    const session = sessions[sessionId];
    if (!session || !session.sock) {
        return res.status(404).send(`Session ${sessionId} not found or not connected`);
    }

    try {
        const [result] = await session.sock.onWhatsApp(phone);
        if (result.exists) {
            res.status(200).json({ exists: true, jid: result.jid });
        } else {
            res.status(200).json({ exists: false });
        }
    } catch (error) {
        console.error(`Error checking number for session ${sessionId}:`, error);
        res.status(500).send('Failed to check number');
    }
});

// Endpoint to send an image
app.post('/sendimage/:sessionId', checkApiKey, async (req, res) => {
    const { sessionId } = req.params;
    const { id, url, caption } = req.body;

    if (!id || !url) {
        return res.status(400).send('Missing id or url in request body');
    }

    const session = sessions[sessionId];
    if (!session || !session.sock) {
        return res.status(404).send(`Session ${sessionId} not found or not connected`);
    }

    try {
        await session.sock.sendMessage(id, { 
            image: { url: url },
            caption: caption || ''
        });
        res.status(200).send('Image sent successfully');
    } catch (error) {
        console.error(`Error sending image for session ${sessionId}:`, error);
        res.status(500).send('Failed to send image');
    }
});
// end API endpoints for sessions


// Serve the sessions management page
app.get("/manage", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "sessions.html"));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send("Something broke!");
});

// Start the Express server
app.listen(port, () => {
  console.log(`WhatsApp API server listening at http://localhost:${port}`);
});
