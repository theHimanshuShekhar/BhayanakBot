import { callOllama } from "../../ollama.js";

type FallbackPool = { success: string[]; failure: string[] };

const FALLBACK_BY_ACTION: Record<string, FallbackPool> = {
	Fishing: {
		success: [
			"You hauled in a beauty that made even the gulls jealous.",
			"The fish practically leapt onto your hook — suspicious, but effective.",
			"Patience rewarded: a full bucket and sun on your back.",
			"You've mastered the ancient art of staring at water until profit happens.",
			"The fish didn't stand a chance. They never do against you.",
			"A perfect cast, a perfect catch, a perfectly mediocre day made great.",
			"The lake gave generously today. You gave nothing in return.",
			"Reeled in a prize catch while your mind was completely elsewhere.",
			"The fish bit, you yanked, coins happened.",
			"Even the worm is proud of what you two accomplished together.",
			"First cast of the day and already a winner. Don't push it.",
			"You spoke to the fish. The fish listened. Results followed.",
		],
		failure: [
			"The fish looked at your bait and swam away, personally offended.",
			"Three hours, zero bites, one very sunburned nose.",
			"You lost the hook, the line, and what was left of your dignity.",
			"The fish are talking about you down there. It isn't kind.",
			"Your bait dissolved and so did your will to continue.",
			"A nibble! Then nothing. Just like your enthusiasm.",
			"The rod snapped, the fish fled, and the bucket remains empty.",
			"You fell asleep mid-cast. The fish took the rod as a trophy.",
			"Turns out fish don't like whatever you're using as bait. At all.",
			"The lake wins this round.",
			"You caught something. It was a boot. The boot was not worth coins.",
			"The current took your line, the wind took your hat, the day took your pride.",
		],
	},

	Construction: {
		success: [
			"You built something today that will outlast your aching back.",
			"Sweat, calluses, and cold hard coin — the blue-collar trifecta.",
			"The scaffolding held. So did you. Well done.",
			"Another wall goes up, another paycheck comes in. Simple math.",
			"You mix concrete like you were born for it. Maybe you were.",
			"The foreman gave you a nod. High praise from someone who never nods.",
			"Hard labour, honest pay, and a very sore lower back.",
			"You laid every brick with purpose. The wall agrees.",
			"Manual work is a virtue, and today virtue was profitable.",
			"Your hands ache but your wallet doesn't.",
			"Beams in place, bolts tightened, another building that exists because of you.",
			"The crew left on time. You were the reason the crew left on time.",
		],
		failure: [
			"The wall fell before the workday ended. So did your contract.",
			"You misread the blueprints. Tragically, so did the building.",
			"Dropped the load, dropped the tools, dropped the ball.",
			"The foreman's face said it all. You were let go before noon.",
			"Concrete dried in the wrong places. Mostly on your boots.",
			"Heavy lifting without the right strength just means dropping things.",
			"You drove a nail through the wrong plank. It was a load-bearing plank.",
			"Safety equipment worn incorrectly is not really safety equipment.",
			"The site supervisor sighed for forty-five seconds without stopping.",
			"Your enthusiasm was there. Your technique absolutely was not.",
			"The scaffolding wobbled, then so did your job security.",
			"Measured once, cut twice, explained it poorly to the foreman once.",
		],
	},

	"Delivery Driver": {
		success: [
			"Every package delivered, every light green, every customer briefly happy.",
			"You navigated traffic like a salmon runs a river — instinctively, furiously.",
			"Fast, precise, and vaguely terrifying to pedestrians.",
			"Zero missed deliveries and only two minor traffic incidents. Good day.",
			"Your route was optimised, your attitude was not — and it worked.",
			"Everything arrived intact, even the fragile items. Somehow.",
			"The customers gave five stars. They didn't see the near-misses.",
			"You covered half the city in record time and collected the coin to prove it.",
			"Speed is a virtue when you're on the clock and the clock doesn't forgive.",
			"Delivered, signed, gone. A ghost of the roads.",
			"Every doorstep found, every signature captured, every package survived you.",
			"You found parking in the city centre. This alone deserves recognition.",
		],
		failure: [
			"The package is somewhere in this city. You're not sure where.",
			"Wrong address, wrong side of town, wrong career choice.",
			"Traffic swallowed you whole and spat you out two hours late.",
			"The GPS lied and you believed it. Again.",
			"You delivered to the right building, wrong floor, wrong dimension.",
			"A left turn gone wrong cascaded into a shift gone very wrong.",
			"The customer refused delivery. You can't argue with a locked door.",
			"Your van made a noise it shouldn't have. Then it made no noise at all.",
			"Rush hour claimed another victim. Today, that victim was you.",
			"Dropped the package. It was the fragile one. It's not fragile anymore.",
			"Three red lights and one roundabout turned a ten-minute run into an hour.",
			"The address existed. The building did not. The day was not recovered.",
		],
	},

	Mining: {
		success: [
			"The earth gave up its secrets and you pocketed them.",
			"Struck a rich seam, filled the cart, maintained all ten fingers.",
			"Every swing of the pickaxe was a prayer answered in ore.",
			"Deep in the dark, you found exactly what you were looking for.",
			"The mountain gave today. You'll be back tomorrow for more.",
			"Your lamp held, your resolve held, the tunnel held. Good day.",
			"Dust in your lungs but ore in your cart — miners call that a win.",
			"Hours underground, moments of doubt, a very satisfying haul.",
			"You read the rock like a book and the book had a treasure at the end.",
			"The shaft was treacherous. You were more treacherous.",
			"The vein ran deeper than expected. Your patience ran deeper than the vein.",
			"You came up blinking into daylight with a cart full of coin-weight. Worth it.",
		],
		failure: [
			"The tunnel collapsed. Figuratively. Your spirit collapsed literally.",
			"Hit nothing but rock for eight hours. The rock won.",
			"Your pickaxe snapped. So did your patience shortly after.",
			"Wrong vein, empty pocket, aching everything.",
			"The deeper you dug, the less you found. The universe is sending a message.",
			"Cave-in, near miss, zero coins, maximum therapy required.",
			"You mined with great enthusiasm and no geological intuition whatsoever.",
			"The ore was right there. Then it wasn't. Mining is humbling.",
			"The cart rolled away empty. The irony echoes in the silence.",
			"Even the mole rats looked sorry for you down there.",
			"Your lamp flickered out at the worst moment. So did your morale.",
			"Three hours of digging confirmed what the rock already knew: nothing here.",
		],
	},

	Programmer: {
		success: [
			"Code reviewed, tests passing, feature shipped, existential crisis postponed.",
			"You solved a problem so elegantly that you immediately made it someone else's.",
			"The compiler accepted everything. For once, so did you.",
			"Stack Overflow had your answer. You pretended you knew it all along.",
			"Three hours of work. Forty minutes of actual coding. Perfect efficiency.",
			"The bug was a missing semicolon. The fix took six hours. The pay is fine.",
			"Shipped it. It's in production. Don't think about it too hard.",
			"You wrote clean, documented code and felt mildly guilty about how good it felt.",
			"Merged, deployed, and nobody paged you after. A flawless victory.",
			"Your code worked first try and you immediately assumed something was wrong.",
			"The sprint ended on a green build. A rare and beautiful thing.",
			"One refactor, zero regressions, one very satisfied senior engineer.",
		],
		failure: [
			"It compiled. It ran. It produced the exact wrong answer, perfectly.",
			"Three pull request rejections before noon. A personal best.",
			"Your algorithm was O(n!) and the server let you know personally.",
			"Infinite loop. The process is still running somewhere. Let it go.",
			"The database migration failed in production. Breathe. It'll be fine. Probably.",
			"You deleted the wrong branch. The right branch did not survive.",
			"A copy-paste error introduced a bug from six months ago you thought you'd fixed.",
			"Four hours of debugging. It was a typo. It's always a typo.",
			"The tests passed locally. They always pass locally.",
			"You deployed on a Friday. This was the consequence.",
			"The PR was approved, merged, and immediately reverted. Classic.",
			"Your fix fixed the wrong thing and broke the thing that wasn't broken.",
		],
	},

	Lawyer: {
		success: [
			"Your argument was airtight, your suit was pressed, and your invoice was enormous.",
			"You found the loophole, threaded it, and billed three hundred hours in the process.",
			"The opposition lawyer looked defeated before you even spoke. Perfect.",
			"Justice, delivered — and handsomely invoiced.",
			"You cited a precedent from 1987 that nobody else remembered. Game over.",
			"Objection sustained. Ego elevated. Payment received.",
			"A masterclass in persuasion delivered at six hundred an hour.",
			"The jury was convinced before closing arguments. You billed for them anyway.",
			"Words as weapons, deployed precisely and very expensively.",
			"Won the case, maintained the mystique, sent the bill before leaving the building.",
			"The other side settled. Your hourly rate made the decision for them.",
			"You spoke for twenty minutes, changed the outcome entirely, and appeared bored doing it.",
		],
		failure: [
			"Your client looked at you after the ruling with that specific kind of disappointment.",
			"Objection overruled. Then overruled again. Then the judge sighed at you.",
			"The other lawyer prepared. You improvised. The difference was apparent.",
			"You cited the wrong case — in front of the judge who wrote the right one.",
			"A stunning thirty-seven minutes of courtroom silence broken only by your defeat.",
			"Evidence suppressed, argument dismissed, dignity left in the parking lot.",
			"You've had better days. Your client is currently very aware of that.",
			"The brief was brief in all the wrong ways.",
			"A procedural technicality ended the case. It was your own procedural technicality.",
			"The jury decided in four minutes. That never means good things.",
			"You led with the weakest argument and never recovered the room.",
			"The motion was denied. The next motion was denied. The day was a series of denials.",
		],
	},

	Doctor: {
		success: [
			"Diagnosed, treated, discharged, invoiced. The cycle of care continues.",
			"You remembered the symptoms from a textbook you half-read in 2012. Close enough.",
			"Steady hands, sharp mind, patient alive, everyone wins.",
			"The difficult case yielded to your expertise after three very focused hours.",
			"Rounds done, charts signed, patients mildly improved and heavily billed.",
			"You made the right call at the right moment. Medicine is mostly luck and confidence.",
			"The surgery went well, which is the only outcome you allow yourself to consider.",
			"Another successful shift. The waiting room still has forty people in it.",
			"Diagnosis: correct. Treatment: effective. Ego: barely contained.",
			"You healed someone today. They thanked you. You billed them. Circle of life.",
			"The attending's eyebrow raised — in approval this time. First time this week.",
			"You caught what the previous doctor missed. You said nothing about it. Very professional.",
		],
		failure: [
			"Misdiagnosis happens to everyone. Today it happened to you and the chart knows.",
			"You wrote the prescription wrong. The pharmacist noticed. You did not.",
			"The differential diagnosis was differential in all the wrong directions.",
			"Six years of medical school and you're still googling symptoms sometimes.",
			"The patient got better despite your treatment plan. Some victories are complicated.",
			"You forgot to check the chart. The chart had everything. You skipped the chart.",
			"Four hours on shift, three wrong calls, one very long walk home.",
			"The attending reviewed your notes with an expression you've memorised.",
			"The procedure was technically completed. Technically.",
			"You ordered the wrong test. The right test would have told you everything.",
			"Rounds were long, focus was short, and the consultant had opinions.",
			"The patient asked a question you couldn't answer. You answered confidently anyway.",
		],
	},

	Pickpocket: {
		success: [
			"In and out. They'll notice the missing wallet in three blocks. You'll be in six.",
			"Light fingers, quick feet, clean getaway.",
			"A masterpiece of casual larceny performed at walking speed.",
			"They were distracted by their phone. You were distracted by their wallet.",
			"The crowd swallowed you whole and you emerged richer for it.",
			"Technically a crime. Practically a performance. Spiritually satisfying.",
			"Slipped in, took what wasn't yours, slipped out. Perfectly ordinary Tuesday.",
			"Their pockets were heavy. Now they're not. Yours are.",
			"You made eye contact, smiled, and relieved them of the burden of excess coin.",
			"Nobody saw. Nobody ever sees. You're that good.",
			"A brush of the shoulder, a flash of the wrist, a moment of art.",
			"They'll spend all evening wondering where their money went. You already know.",
		],
		failure: [
			"They felt the hand. You felt the consequences shortly after.",
			"Grabbed the wrong pocket and found only a very unfortunate receipt.",
			"They yelled. People looked. You ran. Results: mixed.",
			"The officer was standing right there. You hadn't noticed the officer standing right there.",
			"Fingers caught mid-lift. The expression on their face was not forgiveness.",
			"The crowd parted and suddenly you were very visible and very caught.",
			"Nerves betrayed you at the critical moment. The wallet escaped. So did you, barely.",
			"They grabbed your wrist. The cuffs came two minutes later.",
			"Your technique was fine. Their reflexes were better.",
			"Everyone has a bad day at work. Yours comes with a jail sentence.",
			"The mark turned around at exactly the wrong moment. There is no right version of this story.",
			"You fumbled, they flinched, the crowd formed a circle, and it was over.",
		],
	},

	"Rob Player": {
		success: [
			"Brazenly. Publicly. Profitably.",
			"They didn't see you coming. Nobody with that much to lose ever does.",
			"One bold move, one clean score, one person significantly poorer than yesterday.",
			"You looked them dead in the eye and took everything. Respect, arguably.",
			"This is the part where they file a complaint and you don't care.",
			"Struck fast, struck hard, walked away like nothing happened.",
			"They thought you were bluffing. The coins in your pocket confirm you weren't.",
			"Direct, efficient, deeply antisocial. Crime at its most honest.",
			"There's a lesson here. It's their lesson to learn. You just took the tuition.",
			"You robbed them cleanly and they'll spend all week wondering how.",
			"The whole thing was over in seconds. That's either skill or luck. Probably both.",
			"They backed down. You didn't. The coins moved accordingly.",
		],
		failure: [
			"They fought back harder than expected and the guards arrived faster.",
			"Turns out your target had a very short temper and a very loud voice.",
			"They had nothing worth taking and a great deal of resilience.",
			"You picked someone twice your level. The jail cell has had time to reflect on that.",
			"One punch, two witnesses, three officers. Bad odds from the start.",
			"They screamed, the crowd gathered, your escape route vanished.",
			"A bold attempt. A bolder restraint. A surprisingly fast sentencing.",
			"Your target wasn't a target — they were a setup.",
			"You chose wrong. They were a former guard. The irony was immediate.",
			"The robbery was going fine until it absolutely wasn't.",
			"They didn't run, which was not in the plan. The plan did not survive contact.",
			"You underestimated them. They did not return the courtesy.",
		],
	},

	"Rob Bank": {
		success: [
			"The vault opened, the alarms didn't, and the legend was written today.",
			"Everything went according to plan. Nothing ever goes according to plan. Today it did.",
			"You walked in with a plan, walked out with a fortune, and the cameras caught nothing useful.",
			"Fifteen minutes. Three guards. One vault. Zero witnesses.",
			"They say banks are impenetrable. They say a lot of things.",
			"The perfect heist: elegant, profitable, and briefly legal in the sense that it was over.",
			"You made it look effortless because you made it effortless.",
			"The dye packs didn't trigger, the doors opened, and history was made.",
			"They'll upgrade their security tomorrow. You'll retire today.",
			"The teller looked you in the eye and chose self-preservation. Smart of them.",
			"In, out, clean. Every second practised. Every step perfect. Every coin yours.",
			"The kind of job that gets its own documentary — if they ever catch you.",
		],
		failure: [
			"The silent alarm was quieter than your plan. Both were louder than expected.",
			"Three steps into the vault and sixteen officers outside. The math was not in your favour.",
			"The getaway driver left early. A detail you should have confirmed beforehand.",
			"They updated the security codes last week. You had last month's codes.",
			"Everything was perfect until the off-duty detective showed up for a withdrawal.",
			"The dye pack detonated. You are now visually distinct and under arrest.",
			"Ambition: legendary. Execution: less so. Sentence: considerable.",
			"The vault was rigged. The guards were waiting. You were the entertainment.",
			"You had the plan, the gear, and the nerve. What you didn't have was luck.",
			"One miscalculation buried a flawless heist. The cell has excellent acoustics.",
			"The inside contact got cold feet. The outside contact got colder cuffs.",
			"You almost made it. Almost is a word that appears often in your file.",
		],
	},
};

const FALLBACK_GENERIC: FallbackPool = {
	success: [
		"Another day, another coin.",
		"The work was hard, but the pay was harder to argue with.",
		"Fortune favors the bold — and you were adequately bold.",
		"You pocket the coins and try to look nonchalant.",
		"Success never looked so effortless. (It wasn't.)",
		"You pulled it off. Quietly. Without witnesses. Good.",
		"The stars aligned, the moment arrived, and you were ready for once.",
		"A clean result from a messy effort. Nobody needs to know the details.",
		"Coins in pocket, dignity intact, ego appropriately inflated.",
		"Whatever you did worked. Don't overanalyse it.",
	],
	failure: [
		"The universe had other plans.",
		"Your confidence exceeded your competence. Next time.",
		"You gave it your all. Your all was not enough today.",
		"The dice hate you specifically.",
		"A valiant effort. Embarrassingly unsuccessful.",
		"Failure is a teacher. Today's lesson was expensive.",
		"Not your finest moment, but at least it was brief.",
		"The result was not what you planned. It rarely is.",
		"You walked away with nothing. Walking away was still an accomplishment.",
		"Some days the world wins. Today the world won.",
	],
};

function fallback(success: boolean, action?: string): string {
	const pool = (action ? FALLBACK_BY_ACTION[action] : undefined) ?? FALLBACK_GENERIC;
	const lines = success ? pool.success : pool.failure;
	return lines[Math.floor(Math.random() * lines.length)];
}

export async function generateFlavorText(context: {
	action: string;
	success: boolean;
	pay?: number;
	playerName: string;
	details?: string;
	playerLevel?: number;
	petName?: string;
	petType?: string;
	activeItem?: string;
	jobStreak?: number;
	personalityContext?: string;
}): Promise<string> {
	const outcomeWord = context.success ? "succeeded" : "failed";
	const payClause = context.pay !== undefined ? ` earning ${context.pay} coins` : "";
	const detailsClause = context.details ? ` (${context.details})` : "";
	const levelClause = context.playerLevel ? ` (level ${context.playerLevel})` : "";
	const petClause = context.petName ? ` Their companion is ${context.petName} the ${context.petType}.` : "";
	const itemClause = context.activeItem ? ` They used a ${context.activeItem}.` : "";
	const streakClause =
		context.jobStreak !== undefined && context.jobStreak >= 3
			? ` This is their ${context.jobStreak}th time doing this today.`
			: "";
	const prompt = `${context.playerName}${levelClause} just ${outcomeWord} at ${context.action}${payClause}${detailsClause}.${petClause}${itemClause}${streakClause} Narrate in 1 to 4 witty sentences.`;

	const narratorSystem = (context.personalityContext ?? "") + "You are a witty RPG narrator. Write 1 to 4 sentences. No quotation marks.";
	const text = await callOllama(narratorSystem, prompt, 2000);
	return text ?? fallback(context.success, context.action);
}
