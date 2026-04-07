const mongoose = require("mongoose");

const connectDB = async () => {
    if (mongoose.connection.readyState >= 1) return;
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("✅ MongoDB Connected");
    } catch (err) {
        console.error("❌ DB Error:", err.message);
    }
};

const matchSchema = new mongoose.Schema({
    fixtureId: { type: Number, unique: true },
    home: String, 
    away: String, 
    league: String,
    score: { type: String, default: "0-0" },
    status: String,
    utcDate: String, // 👈 ဒီကောင်လေး ထပ်ထည့်ပေးပါ (ပွဲစမယ့်အချိန် သိမ်းဖို့)
    lastUpdated: { type: Date, default: Date.now }
});

const userSchema = new mongoose.Schema({
    userId: { type: Number, unique: true }, // 👈 User တစ်ယောက်ကို တစ်ခါပဲ သိမ်းအောင် unique ထည့်ထားပါ
    username: String, 
    subscriptions: [String] // 👈 Fixture ID တွေကို String array နဲ့ သိမ်းတာ ပိုအဆင်ပြေပါတယ်
});

const Match = mongoose.models.Match || mongoose.model("Match", matchSchema);
const User = mongoose.models.User || mongoose.model("User", userSchema);

module.exports = { connectDB, Match, User };
