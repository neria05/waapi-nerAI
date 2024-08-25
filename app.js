const express = require("express");
const {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  makeInMemoryStore
} = require("@whiskeysockets/baileys");
const QRCode = require("qrcode");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
require('dotenv').config();

const app = express();
const port = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

let sessions = new Map();
let apiKeys = {};
let webhooks = {};

// Load API keys from file if exists
const apiKeysFilePath = path.join(__dirname, "api_keys.json");
if (fs.existsSync(apiKeysFilePath)) {
  apiKeys = JSON.parse(fs.readFileSync(apiKeysFilePath, "utf-8"));
}
// Save API keys to a file
const saveApiKeys = () => {
  fs.writeFileSync(apiKeysFilePath, JSON.stringify(apiKeys, null, 2));
};

// Load webhooks from file if exists
const webhookFilePath = path.join(__dirname, "webhooks.json");
if (fs.existsSync(webhookFilePath)) {
  webhooks = JSON.parse(fs.readFileSync(webhookFilePath, "utf-8"));
}
// Save webhook URLs to a file
const saveWebhooks = () => {
  fs.writeFileSync(webhookFilePath, JSON.stringify(webhooks, null, 2));
};

// Global authentication token
const AUTH_TOKEN = process.env.AUTHENTICATION_GLOBAL_AUTH_TOKEN;

// Middleware for API key authentication
const authenticate = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== AUTH_TOKEN) {
    return res.status(403).send('Forbidden: Invalid API key');
  }
  next();
};

// Directory for session storage
const sessionsDir = (sessionId = '') => {
  return path.join(__dirname, 'sessions', sessionId ? sessionId : '');
};

// Initialize socket connection for a session
const startSock = async (sessionId) => {
  console.log(`Starting socket for session: ${sessionId}`);
  const logger = require('pino')({ level: 'silent' });
  const store = makeInMemoryStore({ logger });
  const sessionFilePath = sessionsDir(sessionId);
  const { state, saveCreds } = await useMultiFileAuthState(sessionFilePath);

  const sock = makeWASocket({
    auth: state,
    logger,
    printQRInTerminal: false,
    browser: ['Ubuntu', 'Chrome', '20.0.04'],
  });

  store.bind(sock.ev);

  sessions.set(sessionId, { ...sock, store });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    console.log(`Connection update for session ${sessionId}:`, update);
    const { connection, qr, lastDisconnect } = update;
    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut);
      console.log(`Connection closed for session ${sessionId}. Reconnecting: ${shouldReconnect}`);
      if (shouldReconnect) {
        startSock(sessionId);
      } else {
        sessions.delete(sessionId);
      }
    } else if (connection === 'open') {
      console.log(`Connection opened for session ${sessionId}`);
      const userJid = sock.user.id;
      const userPhone = userJid.split('@')[0]; 
      const successMessage = `*המספר ${userPhone} חובר בהצלחה!*\nמזהה: ${sessionId}\nAPI: ${apiKeys[sessionId]}`;
      await sock.sendMessage(userJid, { text: successMessage });
    } else if (qr) {
      console.log(`QR code generated for session ${sessionId}`);
      const qrCodeUrl = await QRCode.toDataURL(qr);
      sessions.get(sessionId).qrCodeUrl = qrCodeUrl;
    }
  });

  // Handle incoming messages
  sock.ev.on('messages.upsert', async (upsert) => {
    console.log('Received new message:', upsert);
    const message = upsert.messages[0];
    if (!message.message) return;

    const chatId = message.key.remoteJid;
    const senderNumber = chatId.split('@')[0];
    const messageId = message.key.id;
    const messageContent = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
    const fromMe = message.key.fromMe;

    let type = 'unknown';
    if (message.message?.conversation) type = 'text';
    else if (message.message?.imageMessage) type = 'image';
    else if (message.message?.documentMessage) type = 'document';
    else if (message.message?.audioMessage) type = 'audio';
    else if (message.message?.videoMessage) type = 'video';
    else if (message.message?.stickerMessage) type = 'sticker';

    const webhookUrl = webhooks[sessionId];
    if (webhookUrl) {
      try {
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
      }
    } else {
      console.log(`No webhook URL configured for session ${sessionId}`);
    }
  });

  console.log(`Socket initialized for session ${sessionId}`);
};

// Restore sessions on startup
const restoreSessions = async () => {
  try {
    if (fs.existsSync(sessionsDir())) {
      const sessionDirs = fs.readdirSync(sessionsDir());
      for (const sessionId of sessionDirs) {
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
app.use(authenticate);

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

// Define endpoints
app.get("/sessions", (req, res) => {
  const sessionList = Array.from(sessions.keys()).map((sessionId) => {
    const session = sessions.get(sessionId);
    const status = session ? (session.sock?.ws?.socket?.readyState === 1 ? "RUNNING" : "STOPPED") : "STOPPED";
    return {
      sessionId,
      status,
      qrCode: session && session.qrCodeUrl ? session.qrCodeUrl : null,
    };
  });
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

app.post('/message/:sessionId', checkApiKey, async (req, res) => {
  const { sessionId } = req.params;
  const { id, text } = req.body;

  if (!id || !text) {
    return res.status(400).send('Missing id or text in request body');
  }

  const session = sessions.get(sessionId);
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

app.post('/sendimage/:sessionId', checkApiKey, async (req, res) => {
  const { sessionId } = req.params;
  const { id, url, caption } = req.body;

  if (!id || !url) {
    return res.status(400).send('Missing id or url in request body');
  }

  const session = sessions.get(sessionId);
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

  if (!sessions.has(sessionId)) {
    await startSock(sessionId);
  }

  res.status(200).send({ sessionId, apiKey });
});

// Endpoint to delete the API key for a specific session ID
app.delete("/delapi/:sessionId", (req, res) => {
  const { sessionId } = req.params;
  if (!apiKeys[sessionId]) {
    return res.status(404).send(`API key not found for session ${sessionId}`);
  }
  delete apiKeys[sessionId];
  saveApiKeys();
  res.status(200).send(`API key deleted for session ${sessionId}`);
});

// Endpoint to get QR code for a specific session
app.get("/qr/:sessionId", (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);
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

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "sessions.html"));
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send("Something broke!");
});

app.listen(port, () => {
  console.log(`WhatsApp API server listening at http://localhost:${port}`);
});