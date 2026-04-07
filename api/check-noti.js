const { Bot } = require("grammy");
const { connectDB, Match, User } = require("../db");

const bot = new Bot(process.env.BOT_TOKEN);
const API_KEY = process.env.FOOTBALL_DATA_API_KEY;

// --- ဟာသနှောသော Random စာသားများ ---
const startTexts = [
    "🎬 ပွဲစပြီဟေ့! အခုမှစပြီး ရင်ခုန်လို့ရပြီ။ 💓",
    "🔥 ကွင်းထဲမှာ မီးပွင့်တော့မယ်! ပွဲစပါပြီခင်ဗျာ။",
    "📢 ကဲ... ထိုင်ခုံခါးပတ်ပတ်ထားကြတော့၊ ပွဲကတော့ စပြီ။ ✈️",
    "🏟️ Kick-off! ဘယ်သူ့အိတ်ကပ်ထဲ ပိုက်ဆံရောက်မလဲ ကြည့်ကြတာပေါ့။ 💸"
];

const goalTexts = [
    "⚽ GOAL!!! ဂိုးဝင်သွားပြီဗျို့! ရင်ဘတ်ကြီး တစ်လှပ်လှပ်နဲ့။ 💓",
    "🥅 ဂိုး!!! ပိုက်ဆံအိတ်တွေ သတိထား! တစ်ဖက်ကတော့ အော်နေပြီ။ 🗣️",
    "⚡ ဝုန်းခနဲ ဂိုးဝင်သွားပြီ! Bet ထားတဲ့သူတွေ အသက်ရှူရပ်ကုန်ပြီလား? 😂",
    "⚽ အားပါးပါး... ဂိုးတဲ့ဗျာ! အသင်းဆွဲထားတဲ့သူတွေ ကဲလို့ရပြီ။ 🍻",
    "🚀 ဒုံးကျည်လိုပဲ ဂိုးထဲတန်းဝင်သွားတာ! ရမှတ် အပြောင်းအလဲ ရှိသွားပြီနော်။"
];

const getRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

module.exports = async (req, res) => {
    try {
        await connectDB();
        const response = await fetch("https://api.football-data.org/v4/matches", {
            headers: { "X-Auth-Token": API_KEY }
        });
        const data = await response.json();

        if (!data.matches) return res.status(200).send("No matches.");

        for (const m of data.matches) {
            const fixtureId = m.id.toString();
            const newScore = `${m.score.fullTime.home ?? 0}-${m.score.fullTime.away ?? 0}`;
            const newStatus = m.status;

            const oldMatch = await Match.findOne({ fixtureId: m.id });
            const users = await User.find({ subscriptions: fixtureId });

            if (users.length > 0) {
                // --- (A) ပွဲစကြောင်း Noti ---
                if (oldMatch && oldMatch.status === "TIMED" && (newStatus === "IN_PLAY" || newStatus === "LIVE")) {
                    const txt = getRandom(startTexts);
                    for (const u of users) {
                        await bot.api.sendMessage(u.userId, 
                            `${txt}\n\n🏆 ${m.competition.name}\n🆚 ${m.homeTeam.name} vs ${m.awayTeam.name}`, 
                            { parse_mode: "Markdown" }
                        );
                    }
                }

                // --- (B) Goal သွင်းကြောင်း Noti ---
                if (oldMatch && oldMatch.score !== newScore && (newStatus === "IN_PLAY" || newStatus === "LIVE")) {
                    const txt = getRandom(goalTexts);
                    for (const u of users) {
                        await bot.api.sendMessage(u.userId, 
                            `${txt}\n\n🏟️ ${m.homeTeam.name}  ${newScore}  ${m.awayTeam.name}\n\n📢 မင်းအသင်းလား? ငါ့အသင်းလား? ရင်ခုန်လိုက်တော့!`, 
                            { parse_mode: "Markdown" }
                        );
                    }
                }
            }

            // Cleanup & Update DB
            if (newStatus === "FINISHED") {
                await User.updateMany({ subscriptions: fixtureId }, { $pull: { subscriptions: fixtureId } });
            }

            await Match.findOneAndUpdate(
                { fixtureId: m.id },
                { score: newScore, status: newStatus, lastUpdated: new Date() },
                { upsert: true }
            );
        }
        res.status(200).send("Scan Done");
    } catch (error) {
        res.status(500).send(error.message);
    }
};
