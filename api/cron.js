import { Bot } from "grammy";
const { connectDB, Match, User } = require("../db");
const bot = new Bot(process.env.BOT_TOKEN);

export default async function handler(req, res) {
    await connectDB();
    const subsCount = await User.countDocuments({ "subscriptions.0": { $exists: true } });
    if (subsCount === 0) return res.send("No Subs");

    try {
        const resData = await fetch("https://api.football-data.org/v4/matches", {
            headers: { "X-Auth-Token": process.env.FOOTBALL_DATA_API_KEY }
        }).then(r => r.json());

        if (!resData.matches) return res.send("No Matches");

        for (const m of resData.matches) {
            if (m.status !== "IN_PLAY") continue;

            const newScore = `${m.score.fullTime.home}-${m.score.fullTime.away}`;
            const oldMatch = await Match.findOne({ fixtureId: m.id });

            if (oldMatch && oldMatch.score !== newScore) {
                const users = await User.find({ subscriptions: m.id });
                for (const u of users) {
                    await bot.api.sendMessage(u.userId, `⚽ *GOAL!* \n\n${m.homeTeam.name} ${newScore} ${m.awayTeam.name}`);
                }
            }
            await Match.findOneAndUpdate({ fixtureId: m.id }, { score: newScore, lastUpdated: new Date() }, { upsert: true });
        }
        res.send("Done");
    } catch (e) { res.status(500).send(e.message); }
}
