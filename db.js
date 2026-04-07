const mongoose = require("mongoose");

// ၁။ Connection String (Vercel Environment Variables ထဲမှာ MONGO_URI ဆိုတဲ့နာမည်နဲ့ ထည့်ရမှာပါ)
// Atlas ထဲကရတဲ့ "mongodb+srv://..." link ကို သုံးရပါမယ်
const MONGO_URI = process.env.MONGO_URI;

const connectDB = async () => {
    // Vercel serverless ဖြစ်လို့ connection ရှိပြီးသားဆိုရင် ထပ်မချိတ်အောင် စစ်တာပါ
    if (mongoose.connection.readyState >= 1) return;

    try {
        await mongoose.connect(MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log("✅ MongoDB Atlas Connected!");
    } catch (err) {
        console.error("❌ MongoDB Connection Error:", err.message);
        // Connection မရရင် process ကို သတ်လိုက်မယ်
        process.exit(1);
    }
};

// ၂။ Match Schema (ဘောလုံးပွဲစဉ်များ သိမ်းရန်)
const matchSchema = new mongoose.Schema({
    fixtureId: { type: Number, unique: true, required: true },
    home: String,
    away: String,
    league: String,
    score: { type: String, default: "0-0" },
    status: String,
    lastUpdated: { type: Date, default: Date.now }
});

// ၃။ User Schema (Noti ယူထားသူများ သိမ်းရန်)
const userSchema = new mongoose.Schema({
    userId: { type: Number, unique: true, required: true },
    username: String,
    subscriptions: [Number] // Fixture IDs List
});

// Model များ Export လုပ်ခြင်း
const Match = mongoose.models.Match || mongoose.model("Match", matchSchema);
const User = mongoose.models.User || mongoose.model("User", userSchema);

module.exports = { connectDB, Match, User };
