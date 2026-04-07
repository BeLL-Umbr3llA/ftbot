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
    home: String, away: String, league: String,
    score: { type: String, default: "0-0" },
    status: String, lastUpdated: { type: Date, default: Date.now }
});

const userSchema = new mongoose.Schema({
    userId: Number, username: String, subscriptions: [Number]
});

const Match = mongoose.models.Match || mongoose.model("Match", matchSchema);
const User = mongoose.models.User || mongoose.model("User", userSchema);

module.exports = { connectDB, Match, User };
