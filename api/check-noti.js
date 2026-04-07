const { Bot } = require("grammy");
const { connectDB, Match, User } = require("../db");

const bot = new Bot(process.env.BOT_TOKEN);
const API_KEY = process.env.FOOTBALL_DATA_API_KEY;

module.exports = async (req, res) => {
    try {
        await connectDB();
        
        // ၁။ API ကနေ Live ပွဲတွေယူမယ်
        const response = await fetch(`https://api.football-data.org/v4/matches?status=LIVE`, {
            headers: { "X-Auth-Token": API_KEY }
        });
        const data = await response.json();

        if (!data.matches || data.matches.length === 0) {
            return res.status(200).json({ status: "success", message: "No live matches." });
        }

        // ၂။ Noti ပို့မယ့် Logic
        for (const match of data.matches) {
            const fixtureId = match.id.toString();
            const users = await User.find({ subscriptions: fixtureId });

            if (users.length > 0) {
                const message = `⚽ *ပွဲစပါပြီ! (Match Started)*\n\n` +
                                `🏆 ${match.competition.name}\n` +
                                `🆚 ${match.homeTeam.name} vs ${match.awayTeam.name}\n` +
                                `🔢 ရလဒ်: ${match.score.fullTime.home}-${match.score.fullTime.away}`;

                for (const user of users) {
                    try {
                        await bot.api.sendMessage(user.userId, message, { parse_mode: "Markdown" });
                        // ပို့ပြီးရင် Sub ထဲက ပြန်ထုတ်မယ်
                        await User.updateOne({ userId: user.userId }, { $pull: { subscriptions: fixtureId } });
                    } catch (e) { console.error("Send Error:", e.message); }
                }
            }
        }
        res.status(200).json({ status: "done" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
