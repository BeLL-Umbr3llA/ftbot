import { Bot } from "grammy";
const { connectDB, Match, User } = require("../db");
const bot = new Bot(process.env.BOT_TOKEN);

export default async function handler(req, res) {
    await connectDB();
    const subsCount = await User.countDocuments({ subscriptions: { $exists: true, $not: { $size: 0 } } });
    if (subsCount === 0) return res.send("No subscribers.");

    try {
        const apiData = await fetch("https://api.football-data.org/v4/matches?status=LIVE", {
            headers: { "X-Auth-Token": process.env.FOOTBALL_DATA_API_KEY }
        }).then(r => r.json());

        if (!apiData.matches) return res.send("No live matches.");

        for (const m of apiData.matches) {
            const currentScore = `${m.score.fullTime.home}-${m.score.fullTime.away}`;
            const oldMatch = await Match.findOne({ fixtureId: m.id });

            if (oldMatch && oldMatch.score !== currentScore) {
                const targetUsers = await User.find({ subscriptions: m.id });
                for (const user of targetUsers) {
                    await bot.api.sendMessage(user.userId, 
                        `⚽ *GOAL ALERT!* ⚽\n\n${m.homeTeam.name} ${currentScore} ${m.awayTeam.name}\n🏆 ${m.competition.name}`,
                        { parse_mode: "Markdown" }
                    );
                }
            }
            await Match.findOneAndUpdate({ fixtureId: m.id }, { score: currentScore, lastUpdated: new Date() }, { upsert: true });
        }
        res.send("Success");
    } catch (e) { res.status(500).send(e.message); }
}
