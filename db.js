const mongoose = require("mongoose");

// Vercel Environment Variables ထဲမှာ MONGO_URI ထည့်ထားပေးပါ
const MONGO_URI = process.env.MONGO_URI;

const connectDB = async () => {
    if (mongoose.connection.readyState >= 1) return;
    try {
        await mongoose.connect(MONGO_URI);
        console.log("✅ MongoDB Atlas Connected!");
    } catch (err) {
        console.error("❌ MongoDB Connection Error:", err.message);
    }
};

const matchSchema = new mongoose.Schema({
    fixtureId: { type: Number, unique: true },
    home: String,
    away: String,
    league: String,
    score: { type: String, default: "0-0" },
    status: String,
    lastUpdated: { type: Date, default: Date.now }
});

const userSchema = new mongoose.Schema({
    userId: Number,
    username: String,
    subscriptions: [Number] // Noti ယူထားတဲ့ Fixture IDs
});

const Match = mongoose.models.Match || mongoose.model("Match", matchSchema);
const User = mongoose.models.User || mongoose.model("User", userSchema);

module.exports = { connectDB, Match, User };
