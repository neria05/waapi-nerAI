const fs = require('fs');
const path = require('path');
const readline = require('readline');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function setup() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║   WhatsApp API - Security Setup                        ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  const envPath = path.join(__dirname, '.env');
  let existingConfig = {};

  if (fs.existsSync(envPath)) {
    console.log('⚠️  .env file already exists. We\'ll help you update it.\n');
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
      const [key, value] = line.split('=');
      if (key && value) existingConfig[key] = value;
    });
  }

  // Ask for username
  let username = existingConfig.USERNAME || '';
  while (!username || username.trim().length < 3) {
    username = await question('📝 Enter admin username (min 3 chars): ');
    if (username.trim().length < 3) {
      console.log('❌ Username must be at least 3 characters long!\n');
      username = '';
    }
  }
  username = username.trim();

  // Ask for password
  let password = '';
  let passwordConfirm = '';
  while (!password || password.length < 6) {
    password = await question('🔑 Enter admin password (min 6 chars): ');
    if (password.length < 6) {
      console.log('❌ Password must be at least 6 characters long!\n');
      password = '';
    }
  }

  while (passwordConfirm !== password) {
    passwordConfirm = await question('🔑 Confirm password: ');
    if (passwordConfirm !== password) {
      console.log('❌ Passwords don\'t match! Try again.\n');
      passwordConfirm = '';
    }
  }

  // Hash password
  console.log('\n🔐 Hashing password...');
  const hashedPassword = await bcrypt.hash(password, 10);

  // Generate API Master Key
  const apiMasterKey = crypto.randomBytes(32).toString('hex');

  // Generate JWT Secret
  const jwtSecret = crypto.randomBytes(32).toString('hex');

  // Create .env content
  const envContent = `# Admin Credentials (auto-generated during setup)
USERNAME=${username}
PASSWORD_HASH=${hashedPassword}

# Security Keys (auto-generated during setup)
API_MASTER_KEY=${apiMasterKey}
JWT_SECRET=${jwtSecret}

# Server Configuration
PORT=3000
NODE_ENV=production

# Webhook Configuration (optional)
# WEBHOOK_SECRET=your-webhook-secret-here
`;

  // Write .env file
  fs.writeFileSync(envPath, envContent);
  console.log('✅ .env file created successfully\n');

  // Create .env.example if it doesn't exist
  const envExamplePath = path.join(__dirname, '.env.example');
  const exampleContent = `# Admin Credentials
# After setup, check your .env file (never commit it!)
USERNAME=admin
PASSWORD_HASH=bcrypt_hashed_password

# Security Keys (auto-generated)
API_MASTER_KEY=your-api-master-key
JWT_SECRET=your-jwt-secret

# Server Configuration
PORT=3000
NODE_ENV=production

# Webhook Configuration (optional)
# WEBHOOK_SECRET=your-webhook-secret-here
`;

  fs.writeFileSync(envExamplePath, exampleContent);

  // Create .gitignore entry
  let gitignore = '';
  const gitignorePath = path.join(__dirname, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    gitignore = fs.readFileSync(gitignorePath, 'utf-8');
  }

  if (!gitignore.includes('.env')) {
    gitignore += '\n# Environment variables\n.env\n.env.local\napi_keys.json\nwebhooks.json\nsessions/\n';
    fs.writeFileSync(gitignorePath, gitignore);
    console.log('✅ .gitignore updated\n');
  }

  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║              ✅ Setup Complete!                        ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');
  console.log('📋 Setup Summary:');
  console.log(`   Username: ${username}`);
  console.log(`   Password: ••••••••`);
  console.log(`   API Master Key: ${apiMasterKey.substring(0, 16)}...`);
  console.log('\n⚠️  IMPORTANT:');
  console.log('   ✓ Your .env file contains sensitive data - NEVER commit it!');
  console.log('   ✓ .env is already in .gitignore');
  console.log('   ✓ Share only .env.example with your team');
  console.log('   ✓ Keep your credentials safe!\n');
  console.log('🚀 You can now run: npm start\n');

  rl.close();
}

setup().catch(err => {
  console.error('❌ Setup failed:', err.message);
  process.exit(1);
});
