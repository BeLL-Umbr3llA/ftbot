const Fotmob = require("fotmob").default;
const mongoose = require("mongoose");
const { Bot } = require("grammy");
const fotmob = new Fotmob();
const bot = new Bot(process.env.BOT_TOKEN);

// Schema Model ကို ဒီမှာလည်း ပြန်ခေါ်ပေးပါ (သို့မဟုတ် Models ခွဲထားပါ)
const Match = mongoose.models.Match || mongoose.model("Match", matchSchema);
const User = mongoose.models.User || mongoose.model("User", userSchema);

export default async function handler(req, res) {
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).end();
    }

    try {
        await mongoose.connect(process.env.MONGO_URI);
        const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
        const matches = await fotmob.getMatchesByDate(today);

        for (const league of matches.leagues) {
            for (const m of league.matches) {
                const fId = m.id;
                const newScore = `${m.home.score}-${m.away.score}`;
                const status = m.status.reasonShort || (m.status.liveTime ? m.status.liveTime : "NS");

                // ၁။ Score ပြောင်းလဲမှုရှိမရှိ စစ်မယ်
                const oldMatch = await Match.findOne({ fixtureId: fId });
                if (oldMatch && oldMatch.score !== newScore && m.status.live) {
                    const subs = await User.find({ subscriptions: fId });
                    for (const u of subs) {
                        await bot.api.sendMessage(u.userId, `⚽ *GOAL!* \n${m.home.name} ${newScore} ${m.away.name}\n🕒 ${status}`, { parse_mode: "Markdown" });
                    }
                }

                // ၂။ Database ထဲမှာ Update လုပ်မယ်
                await Match.findOneAndUpdate(
                    { fixtureId: fId },
                    {
                        home: m.home.name,
                        away: m.away.name,
                        score: newScore,
                        status: status,
                        eventTime: m.status.utcTime,
                        league: league.name
                    },
                    { upsert: true }
                );
            }
        }
        res.status(200).send("Sync Complete");
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}
