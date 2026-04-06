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

    // ၁။ Noti ယူထားတဲ့ User ရှိမရှိ အရင်စစ် (မရှိရင် ဘာမှမလုပ်ဘူး)
    const usersWithSubs = await User.find({ "subscriptions.0": { $exists: true } });
    if (usersWithSubs.length === 0) return res.status(200).send("No active subscribers. Skipping...");

    const today = new Date().toLocaleDateString('en-CA').replace(/-/g, '');
    const data = await fotmob.getMatchesByDate(today);

    for (const league of data.leagues) {
        for (const m of league.matches) {
            const currentScore = `${m.home.score}-${m.away.score}`;
            const oldMatch = await Match.findOne({ fixtureId: m.id });

            // ၂။ Goal Notification (DB ထဲကရမှတ်နဲ့ API ကရမှတ် မတူရင် ဂိုးဝင်တာ)
            if (oldMatch && oldMatch.score !== currentScore && m.status.live) {
                const subs = await User.find({ subscriptions: m.id });
                for (const u of subs) {
                    await bot.api.sendMessage(u.userId, 
                        `⚽ *GOAL ALERT!*\n\nဟိုင်း ${u.name} ရေ...\n${m.home.name} ${currentScore} ${m.away.name}\n🕒 ပွဲကစားချိန်: ${m.status.liveTime}`,
                        { parse_mode: "Markdown" }
                    );
                }
            }

            // ၃။ ပွဲပြီးရင် Noti ပိတ်ပြီး User List ထဲက ပွဲ ID ကို ဖြုတ်ခြင်း
            if (m.status.reasonShort === "FT") {
                const subs = await User.find({ subscriptions: m.id });
                for (const u of subs) {
                    await bot.api.sendMessage(u.userId, `🏁 *MATCH FINISHED*\n${m.home.name} ${currentScore} ${m.away.name}\n\nဒီပွဲပြီးသွားလို့ Noti ပိတ်လိုက်ပါပြီဗျ။`);
                    await User.updateOne({ userId: u.userId }, { $pull: { subscriptions: m.id } });
                }
            }

            // ၄။ နောက်ဆုံးအခြေအနေကို DB မှာ Update လုပ်ထားမယ်
            await Match.findOneAndUpdate(
                { fixtureId: m.id },
                { 
                    score: currentScore, 
                    status: m.status.live ? "Live" : m.status.reasonShort,
                    lastUpdated: new Date()
                },
                { upsert: true }
            );
        }
    }
    res.status(200).send("Notifications Processed & Sync Done");
}
