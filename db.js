const mongoose = require("mongoose");

// ၁။ MongoDB Atlas Connection String
// Vercel Environment Variables ထဲမှာ MONGO_URI ဆိုတဲ့ နာမည်နဲ့ ထည့်ထားပေးပါ
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://theonephk_db_user:<db_password>@cluster0.r0yiorp.mongodb.net/football_bot?retryWrites=true&w=majority";

const connectDB = async () => {
    if (mongoose.connection.readyState >= 1) return;
    try {
        await mongoose.connect(MONGO_URI);
        console.log("✅ MongoDB Connected!");
    } catch (err) {
        console.error("❌ MongoDB Connection Error:", err);
    }
};

// ၂။ Match Schema (ပွဲစဉ်များ သိမ်းရန်)
const matchSchema = new mongoose.Schema({
    fixtureId: { type: Number, unique: true },
    home: String,
    away: String,
    league: String,
    score: { type: String, default: "0-0" },
    status: String,
    lastUpdated: { type: Date, default: Date.now }
});

// ၃။ User Schema (Noti ယူထားသူများ သိမ်းရန်)
const userSchema = new mongoose.Schema({
    userId: Number,
    username: String,
    subscriptions: [Number] // fixtureIds list
});

// Model များ ထုတ်ပေးခြင်း
const Match = mongoose.models.Match || mongoose.model("Match", matchSchema);
const User = mongoose.models.User || mongoose.model("User", userSchema);

module.exports = { connectDB, Match, User };
