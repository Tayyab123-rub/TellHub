require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use(cors());
app.use(express.static('public'));

// MongoDB Atlas Connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/tellhub';
async function connectDB() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("MongoDB Atlas Connected Successfully!");
    } catch (err) {
        console.error("Database connection failed:", err);
    }
}
connectDB();

// Integrated Brevo Email Function
async function sendOtpEmail(recipientEmail, otpCode) {
    const url = 'https://api.brevo.com/v3/smtp/email';
    const apiKey = process.env.BREVO_API_KEY;

    const emailData = {
        sender: { 
            name: process.env.SENDER_NAME || "TellHub Verification", 
            email: process.env.SENDER_EMAIL || "mt4792864@gmail.com"
        },
        to: [{ email: recipientEmail }],
        subject: "TellHub - Account Verification Code",
        htmlContent: `
            <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 500px; margin: auto; border: 1px solid #e5e7eb; border-radius: 12px; background-color: #0b141a; color: #e9edef;">
                <h2 style="color: #00a884; text-align: center;">TellHub Security</h2>
                <p style="font-size: 14px; text-align: center;">Your verification code is provided below:</p>
                <div style="background-color: #111b21; padding: 15px; text-align: center; border-radius: 8px; margin: 20px 0; border: 1px solid #00a884;">
                    <span style="color: #00a884; font-size: 32px; font-weight: bold; letter-spacing: 6px;">${otpCode}</span>
                </div>
                <p style="font-size: 12px; color: #8696a0; text-align: center;">This code is valid for 2 minutes. Do not share it with anyone.</p>
            </div>
        `
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': apiKey,
                'content-type': 'application/json'
            },
            body: JSON.stringify(emailData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error("Brevo API Error:", errorData);
            return false;
        }
        return true;
    } catch (error) {
        console.error("Email Network Error:", error);
        return false;
    }
}

// Database Schemas
const userSchema = new mongoose.Schema({
    firstName: String,
    lastName: String,
    email: { type: String, unique: true },
    password: String,
    resetOtp: String,
    resetOtpExpires: Date,
    fcmToken: String,
    contacts: [{ contactEmail: String, contactName: String }]
});
const User = mongoose.model('User', userSchema);

const tempUserSchema = new mongoose.Schema({
    firstName: String,
    lastName: String,
    email: { type: String, unique: true },
    password: String,
    otp: String,
    otpExpires: Date,
    createdAt: { type: Date, default: Date.now, expires: 120 }
});
const TempUser = mongoose.model('TempUser', tempUserSchema);

const messageSchema = new mongoose.Schema({
    senderEmail: String,
    receiverEmail: String,
    message: String,
    fileData: String,
    fileType: { type: String, enum: ['none', 'image', 'video', 'document', 'audio', 'call_log'], default: 'none' },
    fileName: String,
    isViewOnce: { type: Boolean, default: false },
    isViewed: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
    deletedFor: [{ type: String }],
    status: { type: String, enum: ['sent', 'delivered', 'seen', 'scheduled'], default: 'sent' },
    scheduledAt: { type: Date, default: null },
    timestamp: { type: Date, default: Date.now, expires: 432000 } // Auto deletes documents after 5 Days (432000 seconds)
});
const Message = mongoose.model('Message', messageSchema);

const callHistorySchema = new mongoose.Schema({
    callerEmail: String,
    callerName: String,
    receiverEmail: String,
    receiverName: String,
    callType: { type: String, enum: ['Audio', 'Video'], default: 'Audio' },
    status: { type: String, enum: ['Missed', 'Answered', 'Rejected', 'Ended'], default: 'Missed' },
    timestamp: { type: Date, default: Date.now }
});
const CallHistory = mongoose.model('CallHistory', callHistorySchema);

const statusSchema = new mongoose.Schema({
    userEmail: String,
    userName: String,
    content: String,
    type: { type: String, enum: ['text', 'image'], default: 'text' },
    bgColor: { type: String, default: '#005c4b' },
    createdAt: { type: Date, default: Date.now, expires: 86400 },
    views: [{ viewerEmail: String, viewerName: String, viewedAt: { type: Date, default: Date.now } }]
});
const Status = mongoose.model('Status', statusSchema);

// HTML Page Routes
app.get('/', (req, res) => res.sendFile(__dirname + '/public/login.html'));
app.get('/home.html', (req, res) => res.sendFile(__dirname + '/public/home.html'));
app.get('/signup.html', (req, res) => res.sendFile(__dirname + '/public/signup.html'));
app.get('/login.html', (req, res) => res.sendFile(__dirname + '/public/login.html'));
app.get('/verify.html', (req, res) => res.sendFile(__dirname + '/public/verify.html'));
app.get('/forget.html', (req, res) => res.sendFile(__dirname + '/public/forget.html'));
app.get('/addNew.html', (req, res) => res.sendFile(__dirname + '/public/addNew.html'));
app.get('/status.html', (req, res) => res.sendFile(__dirname + '/public/status.html'));
app.get('/chat.html', (req, res) => res.sendFile(__dirname + '/public/chat.html'));

// Auth Endpoints
app.post('/signup', async (req, res) => {
    try {
        const { firstName, lastName, email, password } = req.body;
        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ success: false, message: "Email registered already!" });

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        await TempUser.deleteOne({ email });
        const tempUser = new TempUser({ firstName, lastName, email, password, otp, otpExpires: new Date(Date.now() + 120000) });
        await tempUser.save();

        const mailSent = await sendOtpEmail(email, otp);
        if (!mailSent) return res.status(500).json({ success: false, message: "Failed to send OTP email." });

        res.status(201).json({ success: true, message: "Verification code sent to email." });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/verify-otp', async (req, res) => {
    try {
        const { email, otp } = req.body;
        const tempUser = await TempUser.findOne({ email });
        if (!tempUser || tempUser.otp !== otp) return res.status(400).json({ success: false, message: "Invalid/Expired OTP!" });

        const newUser = new User({ firstName: tempUser.firstName, lastName: tempUser.lastName, email: tempUser.email, password: tempUser.password });
        await newUser.save();
        await TempUser.deleteOne({ email });
        res.status(200).json({ success: true, message: "Account verified successfully!" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const userExists = await User.findOne({ email });
        
        if (!userExists) return res.status(400).json({ success: false, message: "No account found with this email." });
        if (userExists.password !== password) return res.status(400).json({ success: false, message: "Incorrect password!" });

        const avatarLetter = (userExists.firstName && userExists.firstName.length > 0) ? userExists.firstName.charAt(0).toUpperCase() : userExists.email.charAt(0).toUpperCase();

        res.status(200).json({ 
            success: true, 
            message: "Login successful!", 
            user: { 
                name: `${userExists.firstName} ${userExists.lastName}`.trim(), 
                email: userExists.email,
                avatarLetter: avatarLetter
            } 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/check-user', async (req, res) => {
    try {
        const { email } = req.query;
        const targetUser = await User.findOne({ email }).lean();
        if (!targetUser) return res.status(404).json({ success: false, message: "User not found." });
        res.json({ success: true, name: `${targetUser.firstName} ${targetUser.lastName}`.trim(), email: targetUser.email });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/contacts', async (req, res) => {
    try {
        const { email } = req.query;
        const user = await User.findOne({ email }).lean();
        res.json({ success: true, contacts: user ? user.contacts : [] });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/add-contact', async (req, res) => {
    try {
        const { myEmail, contactEmail, contactName } = req.body;
        if (myEmail === contactEmail) return res.status(400).json({ success: false, message: "Cannot add yourself." });

        const targetUser = await User.findOne({ email: contactEmail }).lean();
        if (!targetUser) return res.status(404).json({ success: false, message: "User not on platform." });

        const user = await User.findOne({ email: myEmail });
        if (!user) return res.status(404).json({ success: false, message: "User session expired." });

        const exists = user.contacts.some(c => c.contactEmail === contactEmail);
        if (exists) return res.status(400).json({ success: false, message: "Contact exists already!" });

        const formattedName = contactName || `${targetUser.firstName} ${targetUser.lastName}`.trim();
        user.contacts.push({ contactEmail, contactName: formattedName });
        await user.save();

        const welcomeMsg = new Message({
            senderEmail: myEmail,
            receiverEmail: contactEmail,
            message: "A-O-A",
            fileType: 'none',
            status: 'sent'
        });
        await welcomeMsg.save();

        res.json({ success: true, message: "Contact added!", contact: { contactEmail, contactName: formattedName } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/messages', async (req, res) => {
    try {
        const { sender, receiver } = req.query;
        await Message.updateMany(
            { senderEmail: receiver, receiverEmail: sender, status: { $ne: 'seen' } },
            { status: 'seen' }
        );

        const messages = await Message.find({
            $or: [
                { senderEmail: sender, receiverEmail: receiver },
                { senderEmail: receiver, receiverEmail: sender }
            ],
            status: { $ne: 'scheduled' },
            deletedFor: { $ne: sender }
        }).sort({ timestamp: 1 }).lean();

        res.json({ success: true, messages });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/delete-message', async (req, res) => {
    try {
        const { messageId, myEmail, deleteType } = req.body;
        if (deleteType === 'everyone') {
            await Message.findByIdAndUpdate(messageId, { isDeleted: true, message: "This message was deleted" });
            io.emit('message_deleted', { messageId, deleteType: 'everyone' });
        } else {
            await Message.findByIdAndUpdate(messageId, { $addToSet: { deletedFor: myEmail } });
        }
        res.json({ success: true, message: "Message deleted" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/clear-chat', async (req, res) => {
    try {
        const { myEmail, targetEmail } = req.body;
        await Message.updateMany(
            {
                $or: [
                    { senderEmail: myEmail, receiverEmail: targetEmail },
                    { senderEmail: targetEmail, receiverEmail: myEmail }
                ]
            },
            { $addToSet: { deletedFor: myEmail } }
        );
        res.json({ success: true, message: "Chat cleared" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/conversations', async (req, res) => {
    try {
        const { email } = req.query;
        const userMessages = await Message.find({
            $or: [{ senderEmail: email }, { receiverEmail: email }],
            status: { $ne: 'scheduled' },
            deletedFor: { $ne: email }
        }).sort({ timestamp: -1 }).lean();

        const chatPartnersMap = new Map();
        userMessages.forEach(msg => {
            const partnerEmail = msg.senderEmail === email ? msg.receiverEmail : msg.senderEmail;
            if (!chatPartnersMap.has(partnerEmail)) {
                chatPartnersMap.set(partnerEmail, {
                    lastMessage: msg.isDeleted ? "This message was deleted" : (msg.message || (msg.fileType !== 'none' ? `[${msg.fileType}]` : '')),
                    timestamp: msg.timestamp
                });
            }
        });

        const activeChats = Array.from(chatPartnersMap.entries()).map(([partnerEmail, data]) => ({
            email: partnerEmail,
            lastMessage: data.lastMessage,
            timestamp: data.timestamp
        }));

        res.json({ success: true, activeChats });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Real-time Sockets & Scheduled Task Handler
const onlineUsers = new Map();

// Scheduled Messages Worker (Runs every 10 seconds)
setInterval(async () => {
    try {
        const now = new Date();
        const dueMessages = await Message.find({ status: 'scheduled', scheduledAt: { $lte: now } });
        for (const msg of dueMessages) {
            msg.status = onlineUsers.has(msg.receiverEmail) ? 'delivered' : 'sent';
            await msg.save();

            const receiverSocketId = onlineUsers.get(msg.receiverEmail);
            if (receiverSocketId) io.to(receiverSocketId).emit('receive_message', msg);

            const senderSocketId = onlineUsers.get(msg.senderEmail);
            if (senderSocketId) io.to(senderSocketId).emit('receive_message', msg);
        }
    } catch (e) {
        console.error("Schedule monitor error:", e);
    }
}, 10000);

io.on('connection', (socket) => {
    socket.on('register', (email) => {
        onlineUsers.set(email, socket.id);
        io.emit('user_status_change', { email, status: 'Online' });
    });

    socket.on('check_status', (targetEmail) => {
        const isOnline = onlineUsers.has(targetEmail);
        socket.emit('status_response', { email: targetEmail, status: isOnline ? 'Online' : 'Offline' });
    });

    socket.on('send_message', async (data) => {
        const { senderEmail, receiverEmail, message, fileData, fileType, fileName, isViewOnce, scheduledAt } = data;
        const isReceiverOnline = onlineUsers.has(receiverEmail);
        
        const isScheduled = !!scheduledAt;
        const newMsg = new Message({
            senderEmail,
            receiverEmail,
            message,
            fileData: fileData || null,
            fileType: fileType || 'none',
            fileName: fileName || '',
            isViewOnce: !!isViewOnce,
            status: isScheduled ? 'scheduled' : (isReceiverOnline ? 'delivered' : 'sent'),
            scheduledAt: isScheduled ? new Date(scheduledAt) : null,
            timestamp: isScheduled ? new Date(scheduledAt) : new Date()
        });
        await newMsg.save();

        if (!isScheduled) {
            const receiverSocketId = onlineUsers.get(receiverEmail);
            if (receiverSocketId) io.to(receiverSocketId).emit('receive_message', newMsg);
            socket.emit('receive_message', newMsg);
        } else {
            socket.emit('message_scheduled', { message: "Message scheduled successfully!" });
        }
    });

    socket.on('call_user', async (data) => {
        const { callerEmail, callerName, targetEmail, targetName, callType } = data;
        const callLog = new CallHistory({
            callerEmail, callerName, receiverEmail: targetEmail, receiverName: targetName, callType: callType || 'Audio', status: 'Missed'
        });
        await callLog.save();

        const callMsg = new Message({
            senderEmail: callerEmail,
            receiverEmail: targetEmail,
            message: `${callType} Call`,
            fileType: 'call_log',
            status: 'sent'
        });
        await callMsg.save();

        const receiverSocketId = onlineUsers.get(targetEmail);
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('incoming_call', { callId: callLog._id, callerEmail, callerName, callType });
        }
        io.emit('new_call_log', callMsg);
    });

    socket.on('accept_call', async (data) => {
        if (data.callId) await CallHistory.findByIdAndUpdate(data.callId, { status: 'Answered' });
        const callerSocketId = onlineUsers.get(data.callerEmail);
        if (callerSocketId) io.to(callerSocketId).emit('call_accepted', data);
    });

    socket.on('reject_call', async (data) => {
        if (data.callId) await CallHistory.findByIdAndUpdate(data.callId, { status: 'Rejected' });
        const callerSocketId = onlineUsers.get(data.callerEmail);
        if (callerSocketId) io.to(callerSocketId).emit('call_rejected');
    });

    socket.on('webrtc_signal', (data) => {
        const targetSocketId = onlineUsers.get(data.targetEmail);
        if (targetSocketId) {
            io.to(targetSocketId).emit('webrtc_signal', { senderEmail: data.senderEmail, signal: data.signal });
        }
    });

    socket.on('end_call', (data) => {
        const targetSocketId = onlineUsers.get(data.targetEmail);
        if (targetSocketId) io.to(targetSocketId).emit('call_ended');
    });

    socket.on('disconnect', () => {
        for (let [email, id] of onlineUsers.entries()) {
            if (id === socket.id) {
                onlineUsers.delete(email);
                io.emit('user_status_change', { email, status: 'Offline' });
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`TellHub Server running on port ${PORT}`));