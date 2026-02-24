require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('./')); // Serve frontend files

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

// --- Schemas ---

// User Credentials
const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    phone: { type: String, required: true, unique: true }, // Unified validation via phone
    firstLogin: { type: Date, default: Date.now },
    lastLogin: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// Leaderboard / Player Stats
const leaderboardSchema = new mongoose.Schema({
    name: { type: String, required: true },
    phone: { type: String, required: true, unique: true },
    status: { type: String, default: null }, // "WIN" or "DRAW"
    lastPlayed: { type: Date, default: Date.now },
    timeUsed: { type: Number, default: null } // Seconds used in their single game
}, { minimize: false });

const Leaderboard = mongoose.model('Leaderboard', leaderboardSchema);

// --- API Endpoints ---

// 1. Login / Save Credential
app.post('/api/login', async (req, res) => {
    const { name, phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone number is required' });

    const normalizedName = (name || '').trim();
    const normalizedPhone = (phone || '').trim();
    console.log(`[Server] Login request for phone: ${normalizedPhone}`);

    try {
        const now = new Date();
        // 1. Validate via phone number
        let user = await User.findOne({ phone: normalizedPhone });

        if (user) {
            console.log(`[Server] Existing user found: ${user.name}`);
            user.lastLogin = now;
            await user.save();
        } else {
            console.log(`[Server] New user creating: ${normalizedName}`);
            user = new User({ name: normalizedName, phone: normalizedPhone, lastLogin: now });
            await user.save();
        }

        // 2. Check if they have already played
        let entry = await Leaderboard.findOne({ phone: normalizedPhone });
        if (!entry) {
            // Initialize their entry if it doesn't exist
            entry = new Leaderboard({ name: user.name, phone: normalizedPhone });
            await entry.save();
        }

        res.json({
            message: 'Login successful',
            user,
            hasPlayed: !!entry.status,
            status: entry.status
        });
    } catch (err) {
        console.error(`[Server] Login error: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

// 2. Record Game Result (One-time only)
app.post('/api/leaderboard/record', async (req, res) => {
    const { name, timeUsed, phone, result } = req.body;
    const normalizedPhone = (phone || '').trim();

    // Map internal 'win'/'draw' to display strings
    let gameStatus = result === 'win' ? 'WIN' : (result === 'draw' ? 'DRAW' : null);

    console.log(`[Server] Record Attempt for ${normalizedPhone}: Result="${gameStatus}"`);

    if (!normalizedPhone) return res.status(400).json({ error: 'Phone is required for identification' });
    if (!gameStatus) return res.status(400).json({ error: 'Invalid result' });

    try {
        const now = new Date();
        let entry = await Leaderboard.findOne({ phone: normalizedPhone });

        if (!entry) {
            // This shouldn't normally happen if login works correctly
            return res.status(404).json({ error: 'User record not found. Please log in again.' });
        }

        if (entry.status) {
            return res.status(403).json({ error: 'You have already played your game.' });
        }

        console.log(`[Server] Saving game result for ${normalizedPhone}: ${gameStatus}`);
        entry.status = gameStatus;
        entry.timeUsed = timeUsed;
        entry.lastPlayed = now;

        const savedEntry = await entry.save();
        res.json({ message: 'Result recorded successfully', entry: savedEntry });
    } catch (err) {
        console.error(`[Server] CRITICAL RECORD ERROR:`, err);
        res.status(500).json({ error: 'Database save failed: ' + err.message });
    }
});

// 3. Get Leaderboard
app.get('/api/leaderboard', async (req, res) => {
    try {
        // Return only winners, sorted by least time used, top 10
        const data = await Leaderboard.find({ status: 'WIN' })
            .sort({ timeUsed: 1 })
            .limit(10);
        res.json(data);
    } catch (err) {
        console.error(`[Server] Fetch error: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

// --- Admin Endpoints ---

app.get('/api/admin/credentials', async (req, res) => {
    try {
        const users = await User.find().sort({ name: 1 });
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/leaderboard', async (req, res) => {
    try {
        const data = await Leaderboard.find().sort({ lastPlayed: -1 });
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
