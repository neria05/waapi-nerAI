# WhatsApp API - Multi-Session Support 🚀

A secure WhatsApp API server built with Node.js and Baileys, supporting multiple sessions with webhook integration and API key authentication.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Node](https://img.shields.io/badge/node-%3E%3D14.0.0-green)
![License](https://img.shields.io/badge/license-MIT-orange)

---

## 🌟 Features

✅ **Multi-Session Support** - Manage multiple WhatsApp accounts simultaneously  
✅ **Secure Authentication** - API key-based security for all endpoints  
✅ **Web Dashboard** - Visual management panel for sessions  
✅ **Webhook Integration** - Auto-forward incoming messages to your backend  
✅ **Message Types** - Support for text, images, documents, audio, video, stickers  
✅ **Password Hashing** - bcrypt encryption for admin credentials  
✅ **Auto-Generate Keys** - Master API keys and JWT secrets auto-generated  
✅ **Interactive Setup** - Secure installation wizard with validation  

---

## 📋 Prerequisites

- **Node.js** ≥ 14.0.0
- **npm** or **yarn**
- WhatsApp account (for each session)

---

## 🚀 Quick Start

### 1️⃣ Clone & Install

```bash
git clone https://github.com/neria05/waapi-nerAI.git
cd waapi-nerAI
npm install
```

### 2️⃣ Run Setup Wizard

```bash
npm run setup
```

This will:
- Ask for admin username (min 3 chars)
- Ask for admin password (min 6 chars)
- Create `.env` file with hashed credentials
- Generate API Master Key
- Generate JWT Secret
- Update `.gitignore`

### 3️⃣ Start Server

```bash
npm start
```

Server runs on `http://localhost:3000`

---

## 🔐 Security Features

### Credentials Management

When you run `npm run setup`, it:
- Validates username (minimum 3 characters)
- Validates password (minimum 6 characters)
- Hashes password with **bcrypt** (10 salt rounds)
- Generates secure random keys
- Stores credentials in `.env` (never committed to git)

### Environment Variables

**DO NOT commit `.env` file!** It's already in `.gitignore`

```env
# Your .env will have:
USERNAME=your-username
PASSWORD_HASH=bcrypt_hashed_password
API_MASTER_KEY=auto-generated-32-char-key
JWT_SECRET=auto-generated-32-char-secret
PORT=3000
NODE_ENV=production
```

---

## 📡 API Endpoints

### Session Management

#### Get All Sessions
```http
GET /sessions
```

Response:
```json
[
  {
    "sessionId": "session1",
    "status": "RUNNING",
    "apiKey": "your-api-key",
    "webhook": "https://your-webhook-url",
    "qrCode": "data:image/png;base64,..."
  }
]
```

#### Start Session
```http
GET /start/:sessionId
```

#### Generate API Key
```http
POST /genapi/:sessionId
Content-Type: application/json

Response:
{
  "sessionId": "session1",
  "apiKey": "api_key_here"
}
```

#### Delete API Key
```http
DELETE /delapi/:sessionId
```

#### Get QR Code
```http
GET /qr/:sessionId
```

#### Set Webhook URL
```http
POST /set-webhook/:sessionId
Content-Type: application/json

Body:
{
  "webhookUrl": "https://your-backend.com/webhook"
}
```

---

### Messaging API

**All messaging endpoints require:**
- Header: `x-api-key: your-api-key`
- Valid session ID

#### Send Text Message
```http
POST /message/:sessionId
x-api-key: your-api-key
Content-Type: application/json

Body:
{
  "id": "1234567890@c.us",
  "text": "Hello, World!"
}

Response: 200 OK - "Message sent successfully"
```

#### Send Image
```http
POST /sendimage/:sessionId
x-api-key: your-api-key
Content-Type: application/json

Body:
{
  "id": "1234567890@c.us",
  "url": "https://example.com/image.jpg",
  "caption": "Check this out!"
}
```

#### Check Number on WhatsApp
```http
GET /checkno/:sessionId/:phone
x-api-key: your-api-key

Response:
{
  "exists": true,
  "jid": "1234567890@s.whatsapp.net"
}
```

---

## 🔗 Webhook Integration

### How It Works

1. Set webhook URL: `POST /set-webhook/:sessionId`
2. When a message arrives, your webhook receives:

```json
{
  "sessionId": "session1",
  "senderNumber": "1234567890",
  "messageId": "message_id_hash",
  "messageContent": "User message text",
  "timestamp": 1234567890,
  "chatId": "1234567890@c.us",
  "isGroup": false,
  "fromMe": false,
  "type": "text"
}
```

### Webhook Response

Return text to auto-reply:
```json
"Thanks for your message!"
```

---

## 📱 Number Formats

- **Individual**: `1234567890@c.us`
- **Group**: `120363011234567890-1234567890@g.us`
- **WhatsApp Business**: `1234567890@c.us`

Get JID from `checkno` endpoint before sending messages.

---

## 🛠️ Development

### Run with Hot Reload
```bash
npm run dev
```

Requires nodemon (already in devDependencies)

---

## 📁 Project Structure

```
waapi-nerAI/
├── app.js                 # Main server file
├── setup.js              # Interactive setup wizard
├── package.json          # Dependencies
├── .env.example          # Example environment variables
├── .gitignore            # Git ignore rules
├── public/
│   └── sessions.html     # Web dashboard
└── sessions/             # WhatsApp session data (auto-created)
```

---

## ⚠️ Important Security Notes

1. **Never commit `.env`** - It contains sensitive credentials
2. **Use strong passwords** - Minimum 6 characters recommended (use 12+)
3. **Protect API keys** - Treat them like passwords
4. **HTTPS in production** - Always use HTTPS for webhook URLs
5. **Validate webhooks** - Verify webhook origin to prevent abuse
6. **Rotate credentials regularly** - Change passwords periodically

---

## 🐛 Troubleshooting

### QR Code not generating?
- Ensure session is properly started: `GET /start/:sessionId`
- Check server logs for errors
- Try creating a new session

### Messages not sending?
- Verify API key is correct
- Check number format: `1234567890@c.us`
- Ensure number exists: `GET /checkno/:sessionId/:phone`
- Verify session is connected

### Webhook not triggering?
- Confirm webhook URL is reachable
- Check webhook URL in `/sessions` endpoint
- Verify your backend is accepting POST requests
- Monitor server logs for webhook errors

---

## 📝 Example: Complete Flow

```bash
# 1. Setup
npm run setup
npm start

# 2. Get API key
curl -X POST http://localhost:3000/genapi/session1

# 3. Set webhook
curl -X POST http://localhost:3000/set-webhook/session1 \
  -H "Content-Type: application/json" \
  -d '{"webhookUrl": "https://your-backend.com/webhook"}'

# 4. Start session (scan QR)
curl http://localhost:3000/start/session1

# 5. Send message
curl -X POST http://localhost:3000/message/session1 \
  -H "x-api-key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "1234567890@c.us",
    "text": "Hello!"
  }'
```

---

## 📦 Dependencies

- **@whiskeysockets/baileys** ^7.9.0 - WhatsApp API
- **express** ^4.21.0 - Web server
- **bcryptjs** ^2.4.3 - Password hashing
- **axios** ^1.7.7 - HTTP client
- **dotenv** ^16.4.5 - Environment variables
- **qrcode** ^1.5.4 - QR code generation
- **pino** ^9.4.0 - Logger
- **nodemon** ^3.1.4 - Development server (dev only)

---

## 📄 License

MIT License - Feel free to use this project for personal or commercial purposes.

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

## ⚡ Tips & Best Practices

1. **Use one session per account** - Don't share sessions between users
2. **Implement rate limiting** - Prevent webhook spam
3. **Log all API calls** - For debugging and auditing
4. **Monitor session status** - Check `/sessions` periodically
5. **Handle webhook errors** - Implement retry logic in your backend
6. **Keep Baileys updated** - Check for security updates regularly

---

## 🆘 Need Help?

- Check the [Baileys documentation](https://github.com/WhiskeySockets/Baileys)
- Review WhatsApp's ToS before using
- Test in development first
- Monitor your WhatsApp account for security alerts

---

## ⚖️ Legal Disclaimer

This project is provided as-is for educational and legitimate purposes. Users are responsible for:

- Complying with WhatsApp's Terms of Service
- Obtaining proper consent before sending messages
- Not using for spam, phishing, or harassment
- Respecting user privacy and data protection laws (GDPR, CCPA, etc.)
- Not bypassing WhatsApp security measures

**Use responsibly!** ⚖️

---

**Made with ❤️ by [neria05](https://github.com/neria05)**
