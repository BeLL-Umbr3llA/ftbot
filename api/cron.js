const Fotmob = require("fotmob").default;
const fotmob = new Fotmob();
const { Bot } = require("grammy");
const { connectDB, Match, User } = require("../db");

const bot = new Bot(process.env.BOT_TOKEN);

export default async function handler(req, res) {
   if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).send("Unauthorized");
}


    await connectDB();

    // ၁။ Noti ယူထားတဲ့ User ရှိမရှိ အရင်စစ် (မရှိရင် API မခေါ်ဘူး)
    const activeSubsCount = await User.countDocuments({ "subscriptions.0": { $exists: true } });
    if (activeSubsCount === 0) return res.status(200).send("No active subs. Idle mode.");

    const today = new Date().toLocaleDateString('en-CA').replace(/-/g, '');
    const data = await fotmob.getMatchesByDate(today);

    for (const league of data.leagues) {
        for (const m of league.matches) {
            const fId = m.id;
            const currentScore = `${m.home.score}-${m.away.score}`;
            const oldMatch = await Match.findOne({ fixtureId: fId });

            // ၂။ Goal Notification logic
            if (oldMatch && oldMatch.score !== currentScore && m.status.live) {
                const subs = await User.find({ subscriptions: fId });
                for (const u of subs) {
                    await bot.api.sendMessage(u.userId, `⚽ *GOAL ALERT!*\n\n${m.home.name} ${currentScore} ${m.away.name}\n🕒 Time: ${m.status.liveTime}`);
                }
            }

            // ၃။ ပွဲပြီးရင် Noti ပို့ပြီး User Sub ကို ဖျက်ခြင်း (Auto-Cleanup)
            if (m.status.reasonShort === "FT") {
                const subs = await User.find({ subscriptions: fId });
                for (const u of subs) {
                    await bot.api.sendMessage(u.userId, `🏁 *MATCH FINISHED*\n${m.home.name} ${currentScore} ${m.away.name}\n\nဒီပွဲအတွက် Noti ကို ပိတ်လိုက်ပါပြီဗျ။`);
                    await User.updateOne({ userId: u.userId }, { $pull: { subscriptions: fId } });
                }
            }

            // ၄။ DB Update
            await Match.findOneAndUpdate(
                { fixtureId: fId },
                { 
                    home: m.home.name, away: m.away.name, 
                    league: league.name, score: currentScore, 
                    status: m.status.live ? "Live" : m.status.reasonShort,
                    lastUpdated: new Date() 
                },
                { upsert: true }
            );
        }
    }
    res.status(200).send("Sync & Cleaned");
}
