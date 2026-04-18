# Games Engine & Commands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a shared game engine and 17 channel-based game commands that award RPG coins/XP to winners.

**Architecture:** A `src/lib/games/` module manages channel sessions (one game per channel) and rewards. All 17 commands live in `src/commands/games/` and use `channel.createMessageCollector()` for player responses. The sessions Map prevents duplicate games per channel.

**Tech Stack:** Sapphire Framework, Discord.js v14 MessageCollector, native fetch, Drizzle ORM (via existing RPG helpers)

---

## File Map

**Create:**
- `src/lib/games/session.ts` — GameSession type + sessions Map + helpers
- `src/lib/games/reward.ts` — `rewardWinner(userId, coins, xp)`
- `src/lib/games/index.ts` — re-exports
- `src/data/riddles.ts` — local riddle pool
- `src/data/emojiPuzzles.ts` — local emoji puzzle pool
- `src/data/wordList.ts` — common English words for hangman/wordguess/wordchain
- `src/commands/games/trivia.ts`
- `src/commands/games/riddle.ts`
- `src/commands/games/anagram.ts`
- `src/commands/games/emojidecode.ts`
- `src/commands/games/rickandmorty.ts`
- `src/commands/games/harrypotter.ts`
- `src/commands/games/hangman.ts`
- `src/commands/games/wordguess.ts`
- `src/commands/games/typerace.ts`
- `src/commands/games/fastdraw.ts`
- `src/commands/games/mathrace.ts`
- `src/commands/games/guessthenumber.ts`
- `src/commands/games/guessthepokemon.ts`
- `src/commands/games/wordchain.ts`
- `src/commands/games/quiz.ts`
- `src/commands/games/trueorfalse.ts`
- `src/commands/games/wouldyourather.ts`

---

## Task 1: Game Engine Foundation

**Files:**
- Create: `src/lib/games/session.ts`
- Create: `src/lib/games/reward.ts`
- Create: `src/lib/games/index.ts`

- [ ] **Step 1: Create `src/lib/games/session.ts`**

```ts
export type GameSession = {
	gameId: string
	hostId: string
	channelId: string
	guildId: string
	state: unknown
	startedAt: number
	timeout: NodeJS.Timeout
}

const sessions = new Map<string, GameSession>()

export function getSession(channelId: string): GameSession | undefined {
	return sessions.get(channelId)
}

export function setSession(channelId: string, session: GameSession): void {
	sessions.set(channelId, session)
}

export function deleteSession(channelId: string): void {
	sessions.delete(channelId)
}

export function hasSession(channelId: string): boolean {
	return sessions.has(channelId)
}
```

- [ ] **Step 2: Create `src/lib/games/reward.ts`**

```ts
import { getOrCreateProfile, updateCoins, addXpToProfile } from "../../db/queries/rpg.js"

export async function rewardWinner(userId: string, coins: number, xp: number): Promise<void> {
	await getOrCreateProfile(userId)
	await updateCoins(userId, coins)
	await addXpToProfile(userId, xp)
}
```

- [ ] **Step 3: Create `src/lib/games/index.ts`**

```ts
export * from "./session.js"
export * from "./reward.js"
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/games/
git commit -m "feat: add game engine foundation (session + reward)"
```

---

## Task 2: Local Data Files

**Files:**
- Create: `src/data/riddles.ts`
- Create: `src/data/emojiPuzzles.ts`
- Create: `src/data/wordList.ts`
- Create: `src/data/harryPotterTrivia.ts`

- [ ] **Step 1: Create `src/data/riddles.ts`**

```ts
export type Riddle = { question: string; answer: string }

export const RIDDLES: Riddle[] = [
	{ question: "I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?", answer: "echo" },
	{ question: "The more you take, the more you leave behind. What am I?", answer: "footsteps" },
	{ question: "I have cities, but no houses live there. I have mountains, but no trees grow there. I have water, but no fish swim there. What am I?", answer: "map" },
	{ question: "What has hands but can't clap?", answer: "clock" },
	{ question: "What gets wetter as it dries?", answer: "towel" },
	{ question: "I have a head and a tail but no body. What am I?", answer: "coin" },
	{ question: "What can you catch but not throw?", answer: "cold" },
	{ question: "The more you have of it, the less you see. What is it?", answer: "darkness" },
	{ question: "What has one eye but can't see?", answer: "needle" },
	{ question: "I'm light as a feather, but even the strongest person can't hold me for more than a few minutes. What am I?", answer: "breath" },
	{ question: "What runs but never walks, has a mouth but never talks, has a head but never weeps, has a bed but never sleeps?", answer: "river" },
	{ question: "What can fill a room but takes up no space?", answer: "light" },
	{ question: "I go up but never come down. What am I?", answer: "age" },
	{ question: "What has keys but no locks, space but no room, and you can enter but can't go inside?", answer: "keyboard" },
	{ question: "What is full of holes but still holds water?", answer: "sponge" },
	{ question: "What has a neck but no head?", answer: "bottle" },
	{ question: "The more you remove from me, the bigger I become. What am I?", answer: "hole" },
	{ question: "What can travel around the world while staying in one corner?", answer: "stamp" },
	{ question: "I have branches but no fruit, trunk or leaves. What am I?", answer: "bank" },
	{ question: "What begins with T, ends with T, and has T in it?", answer: "teapot" },
	{ question: "What has teeth but cannot bite?", answer: "comb" },
	{ question: "What word becomes shorter when you add two letters to it?", answer: "short" },
	{ question: "What has four legs in the morning, two at noon, and three in the evening?", answer: "human" },
	{ question: "I'm always in front of you but can't be seen. What am I?", answer: "future" },
	{ question: "What breaks but never falls, and falls but never breaks?", answer: "day and night" },
]

export function randomRiddle(): Riddle {
	return RIDDLES[Math.floor(Math.random() * RIDDLES.length)]!
}
```

- [ ] **Step 2: Create `src/data/emojiPuzzles.ts`**

```ts
export type EmojiPuzzle = { emojis: string; answer: string; hint: string }

export const EMOJI_PUZZLES: EmojiPuzzle[] = [
	{ emojis: "🦁 👑", answer: "lion king", hint: "Disney movie" },
	{ emojis: "🕷️ 🕸️ 👨", answer: "spider man", hint: "Marvel superhero" },
	{ emojis: "🧊 ❄️ 👸", answer: "frozen", hint: "Disney movie" },
	{ emojis: "🧙 💍", answer: "lord of the rings", hint: "Fantasy trilogy" },
	{ emojis: "🦈 🎵", answer: "baby shark", hint: "Viral kids song" },
	{ emojis: "⚡ 🧙 📚", answer: "harry potter", hint: "Wizarding world" },
	{ emojis: "🐠 🔍", answer: "finding nemo", hint: "Pixar movie" },
	{ emojis: "🌹 🧟", answer: "beauty and the beast", hint: "Disney fairytale" },
	{ emojis: "🚀 ♾️ 🤝", answer: "toy story", hint: "Pixar movie" },
	{ emojis: "🦸 🔨 ⚡", answer: "thor", hint: "Marvel superhero" },
	{ emojis: "🧠 🌀 🤯", answer: "inception", hint: "Christopher Nolan film" },
	{ emojis: "🦖 🌴 🎡", answer: "jurassic park", hint: "Steven Spielberg film" },
	{ emojis: "👻 🏠 🌲", answer: "haunted house", hint: "Spooky place" },
	{ emojis: "🐻 🍯 🌳", answer: "winnie the pooh", hint: "Classic cartoon" },
	{ emojis: "🌊 🏄 🦈", answer: "jaws", hint: "Classic horror film" },
	{ emojis: "🤖 🚗 🔄", answer: "transformers", hint: "Robots in disguise" },
	{ emojis: "🦇 👨 🌃", answer: "batman", hint: "DC superhero" },
	{ emojis: "🧱 🐢 🍕", answer: "teenage mutant ninja turtles", hint: "Heroes in a half shell" },
	{ emojis: "🌌 ⚔️ 👴", answer: "star wars", hint: "Space opera" },
	{ emojis: "🕵️ 🔍 🧪", answer: "sherlock holmes", hint: "Famous detective" },
	{ emojis: "🎪 🤡 🎈", answer: "it", hint: "Stephen King horror" },
	{ emojis: "🦸 🌟 🔴 🔵", answer: "captain america", hint: "Marvel patriotic hero" },
	{ emojis: "👩 🌿 🌏", answer: "avatar", hint: "James Cameron sci-fi" },
	{ emojis: "🐉 🔥 👸", answer: "game of thrones", hint: "HBO fantasy series" },
	{ emojis: "🍕 👩‍🍳 🇮🇹", answer: "chef", hint: "Cooking theme" },
	{ emojis: "⏰ 🚂 🎩", answer: "back to the future", hint: "Time travel classic" },
	{ emojis: "🏋️ 🥊 🇮🇹", answer: "rocky", hint: "Boxing movie" },
	{ emojis: "🕵️ 🔫 🎰", answer: "james bond", hint: "British spy" },
	{ emojis: "👩 🌀 🌪️ 🏡", answer: "wizard of oz", hint: "Follow the yellow brick road" },
	{ emojis: "🦁 🐯 🐻", answer: "the jungle book", hint: "Kipling classic" },
]

export function randomEmojiPuzzle(): EmojiPuzzle {
	return EMOJI_PUZZLES[Math.floor(Math.random() * EMOJI_PUZZLES.length)]!
}
```

- [ ] **Step 3: Create `src/data/wordList.ts`**

```ts
export const WORD_LIST: string[] = [
	"apple", "brain", "chair", "dance", "earth", "flame", "grace", "heart", "ivory", "juice",
	"knife", "lemon", "magic", "night", "ocean", "piano", "queen", "river", "smile", "tiger",
	"umbra", "voice", "water", "xenon", "yacht", "zebra", "angel", "brave", "cloud", "dream",
	"eagle", "faith", "giant", "honey", "index", "jewel", "karma", "light", "maple", "noble",
	"olive", "pearl", "quilt", "realm", "solar", "toast", "ultra", "vapor", "witch", "yield",
	"amber", "blaze", "candy", "derby", "ember", "frost", "globe", "haven", "inner", "joker",
	"knack", "lunar", "mercy", "nerve", "orbit", "plumb", "quest", "ridge", "scope", "thorn",
	"union", "verse", "waltz", "extra", "yodel", "zonal", "alert", "bloom", "chess", "drift",
	"elbow", "fable", "gloom", "haste", "image", "jolly", "kneel", "lance", "mirth", "naval",
	"ozone", "plaza", "quirk", "radar", "spark", "truce", "utter", "vinyl", "weave", "xerox",
]

export function randomWord(minLength = 4, maxLength = 8): string {
	const filtered = WORD_LIST.filter((w) => w.length >= minLength && w.length <= maxLength)
	return filtered[Math.floor(Math.random() * filtered.length)]!
}

export function randomFiveLetterWord(): string {
	const fiveLetterWords = WORD_LIST.filter((w) => w.length === 5)
	return fiveLetterWords[Math.floor(Math.random() * fiveLetterWords.length)]!
}

export function scrambleWord(word: string): string {
	const arr = word.split("")
	for (let i = arr.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1))
		;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
	}
	// Ensure scrambled word is different from original
	if (arr.join("") === word && word.length > 1) return scrambleWord(word)
	return arr.join("")
}
```

- [ ] **Step 4: Create `src/data/harryPotterTrivia.ts`**

```ts
export type TriviaQuestion = { question: string; answer: string }

export const HP_TRIVIA: TriviaQuestion[] = [
	{ question: "What is Harry Potter's owl's name?", answer: "hedwig" },
	{ question: "What house is Harry Potter sorted into?", answer: "gryffindor" },
	{ question: "What is the name of Harry's pet owl?", answer: "hedwig" },
	{ question: "What spell is used to disarm an opponent?", answer: "expelliarmus" },
	{ question: "What is the killing curse in Harry Potter?", answer: "avada kedavra" },
	{ question: "What position does Harry play in Quidditch?", answer: "seeker" },
	{ question: "What is the name of the wizarding bank?", answer: "gringotts" },
	{ question: "Who is the Half-Blood Prince?", answer: "severus snape" },
	{ question: "What is the name of Hagrid's three-headed dog?", answer: "fluffy" },
	{ question: "What form does Harry's Patronus take?", answer: "stag" },
	{ question: "What is the core of Harry's wand?", answer: "phoenix feather" },
	{ question: "Who created the Philosopher's Stone?", answer: "nicolas flamel" },
	{ question: "What is the spell for Lumos?", answer: "lumos" },
	{ question: "What platform does the Hogwarts Express depart from?", answer: "nine and three quarters" },
	{ question: "What animal can Sirius Black transform into?", answer: "dog" },
	{ question: "What is the name of the Weasley family home?", answer: "the burrow" },
	{ question: "Who taught Defence Against the Dark Arts in Harry's first year?", answer: "quirrell" },
	{ question: "What is the name of Draco Malfoy's mother?", answer: "narcissa" },
	{ question: "What creature guards the entrance to Dumbledore's office?", answer: "gargoyle" },
	{ question: "What is the incantation to produce a Patronus?", answer: "expecto patronum" },
	{ question: "What is the name of Voldemort's snake?", answer: "nagini" },
	{ question: "What subject does Professor Sprout teach?", answer: "herbology" },
	{ question: "What is the full name of S.P.E.W.?", answer: "society for the promotion of elfish welfare" },
	{ question: "Who is the ghost of Gryffindor tower?", answer: "nearly headless nick" },
	{ question: "What is the name of the pub in Hogsmeade known for its butterbeer?", answer: "three broomsticks" },
]

export function randomHPTrivia(): TriviaQuestion {
	return HP_TRIVIA[Math.floor(Math.random() * HP_TRIVIA.length)]!
}
```

- [ ] **Step 5: Commit**

```bash
git add src/data/
git commit -m "feat: add local data files for riddles, emoji puzzles, word list, and HP trivia"
```

---

## Task 3: First-to-Answer Games — trivia, riddle, anagram, emojidecode

All four follow identical structure: post question → first correct message response wins.

**Files:**
- Create: `src/commands/games/trivia.ts`
- Create: `src/commands/games/riddle.ts`
- Create: `src/commands/games/anagram.ts`
- Create: `src/commands/games/emojidecode.ts`

- [ ] **Step 1: Create `src/commands/games/trivia.ts`**

```ts
import { Command } from "@sapphire/framework"
import { EmbedBuilder, TextChannel } from "discord.js"
import { hasSession, setSession, deleteSession } from "../../lib/games/index.js"
import { rewardWinner } from "../../lib/games/reward.js"

type TriviaApiResponse = {
	results: {
		question: string
		correct_answer: string
		incorrect_answers: string[]
		category: string
		difficulty: string
	}[]
}

function decodeHtml(text: string): string {
	return text
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, "\"")
		.replace(/&#039;/g, "'")
}

export class TriviaCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options, preconditions: ["GuildOnly"] })
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder.setName("trivia").setDescription("Start a trivia question — first to answer correctly wins 80 coins!"),
		)
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		if (hasSession(interaction.channelId)) {
			return interaction.reply({ content: "A game is already running in this channel.", ephemeral: true })
		}

		await interaction.deferReply()

		let data: TriviaApiResponse
		try {
			const res = await fetch("https://opentdb.com/api.php?amount=1&type=multiple")
			data = (await res.json()) as TriviaApiResponse
		} catch {
			return interaction.editReply({ content: "Could not fetch a trivia question. Try again later." })
		}

		const q = data.results[0]
		if (!q) return interaction.editReply({ content: "Could not fetch a trivia question. Try again later." })

		const question = decodeHtml(q.question)
		const answer = decodeHtml(q.correct_answer).toLowerCase()
		const channel = interaction.channel as TextChannel

		const embed = new EmbedBuilder()
			.setColor(0x5865f2)
			.setTitle("🎯 Trivia Time!")
			.setDescription(`**${question}**\n\n*Category: ${q.category} | Difficulty: ${q.difficulty}*\n\nType your answer in chat! You have **30 seconds**.`)

		await interaction.editReply({ embeds: [embed] })

		const timeout = setTimeout(async () => {
			deleteSession(interaction.channelId)
			collector.stop("timeout")
			await channel.send({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription(`⏰ Time's up! The answer was **${decodeHtml(q.correct_answer)}**.`)] })
		}, 30_000)

		setSession(interaction.channelId, {
			gameId: "trivia",
			hostId: interaction.user.id,
			channelId: interaction.channelId,
			guildId: interaction.guildId!,
			state: { answer },
			startedAt: Date.now(),
			timeout,
		})

		const collector = channel.createMessageCollector({ time: 30_000 })

		collector.on("collect", async (msg) => {
			if (msg.author.bot) return
			if (msg.content.toLowerCase().trim() === answer) {
				collector.stop("winner")
				clearTimeout(timeout)
				deleteSession(interaction.channelId)
				await rewardWinner(msg.author.id, 80, 20)
				await channel.send({
					embeds: [
						new EmbedBuilder()
							.setColor(0x57f287)
							.setTitle("🎉 Correct!")
							.setDescription(`${msg.author} got it! The answer was **${decodeHtml(q.correct_answer)}**.\n\n+**80 coins** and **20 XP** added to your RPG profile!`),
					],
				})
			}
		})
	}
}
```

- [ ] **Step 2: Create `src/commands/games/riddle.ts`**

```ts
import { Command } from "@sapphire/framework"
import { EmbedBuilder, TextChannel } from "discord.js"
import { hasSession, setSession, deleteSession } from "../../lib/games/index.js"
import { rewardWinner } from "../../lib/games/reward.js"
import { randomRiddle } from "../../data/riddles.js"

export class RiddleCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options, preconditions: ["GuildOnly"] })
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder.setName("riddle").setDescription("Post a riddle — first to solve it wins 80 coins!"),
		)
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		if (hasSession(interaction.channelId)) {
			return interaction.reply({ content: "A game is already running in this channel.", ephemeral: true })
		}

		const riddle = randomRiddle()
		const channel = interaction.channel as TextChannel

		const embed = new EmbedBuilder()
			.setColor(0xe67e22)
			.setTitle("🧩 Riddle Me This!")
			.setDescription(`**${riddle.question}**\n\nType your answer in chat! You have **45 seconds**.`)

		await interaction.reply({ embeds: [embed] })

		const timeout = setTimeout(async () => {
			deleteSession(interaction.channelId)
			collector.stop("timeout")
			await channel.send({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription(`⏰ Time's up! The answer was **${riddle.answer}**.`)] })
		}, 45_000)

		setSession(interaction.channelId, {
			gameId: "riddle",
			hostId: interaction.user.id,
			channelId: interaction.channelId,
			guildId: interaction.guildId!,
			state: { answer: riddle.answer },
			startedAt: Date.now(),
			timeout,
		})

		const collector = channel.createMessageCollector({ time: 45_000 })

		collector.on("collect", async (msg) => {
			if (msg.author.bot) return
			if (msg.content.toLowerCase().trim() === riddle.answer) {
				collector.stop("winner")
				clearTimeout(timeout)
				deleteSession(interaction.channelId)
				await rewardWinner(msg.author.id, 80, 20)
				await channel.send({
					embeds: [
						new EmbedBuilder()
							.setColor(0x57f287)
							.setTitle("🎉 Solved!")
							.setDescription(`${msg.author} solved it! The answer was **${riddle.answer}**.\n\n+**80 coins** and **20 XP**!`),
					],
				})
			}
		})
	}
}
```

- [ ] **Step 3: Create `src/commands/games/anagram.ts`**

```ts
import { Command } from "@sapphire/framework"
import { EmbedBuilder, TextChannel } from "discord.js"
import { hasSession, setSession, deleteSession } from "../../lib/games/index.js"
import { rewardWinner } from "../../lib/games/reward.js"
import { randomWord, scrambleWord } from "../../data/wordList.js"

export class AnagramCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options, preconditions: ["GuildOnly"] })
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder.setName("anagram").setDescription("Unscramble the word — first correct answer wins 100 coins!"),
		)
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		if (hasSession(interaction.channelId)) {
			return interaction.reply({ content: "A game is already running in this channel.", ephemeral: true })
		}

		const word = randomWord()
		const scrambled = scrambleWord(word)
		const channel = interaction.channel as TextChannel

		await interaction.reply({
			embeds: [
				new EmbedBuilder()
					.setColor(0x9b59b6)
					.setTitle("🔀 Anagram!")
					.setDescription(`Unscramble this word: **\`${scrambled.toUpperCase()}\`**\n\nType your answer in chat! You have **30 seconds**.`),
			],
		})

		const timeout = setTimeout(async () => {
			deleteSession(interaction.channelId)
			collector.stop("timeout")
			await channel.send({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription(`⏰ Time's up! The word was **${word}**.`)] })
		}, 30_000)

		setSession(interaction.channelId, {
			gameId: "anagram",
			hostId: interaction.user.id,
			channelId: interaction.channelId,
			guildId: interaction.guildId!,
			state: { answer: word },
			startedAt: Date.now(),
			timeout,
		})

		const collector = channel.createMessageCollector({ time: 30_000 })

		collector.on("collect", async (msg) => {
			if (msg.author.bot) return
			if (msg.content.toLowerCase().trim() === word) {
				collector.stop("winner")
				clearTimeout(timeout)
				deleteSession(interaction.channelId)
				await rewardWinner(msg.author.id, 100, 25)
				await channel.send({
					embeds: [
						new EmbedBuilder()
							.setColor(0x57f287)
							.setTitle("🎉 Correct!")
							.setDescription(`${msg.author} unscrambled it! The word was **${word}**.\n\n+**100 coins** and **25 XP**!`),
					],
				})
			}
		})
	}
}
```

- [ ] **Step 4: Create `src/commands/games/emojidecode.ts`**

```ts
import { Command } from "@sapphire/framework"
import { EmbedBuilder, TextChannel } from "discord.js"
import { hasSession, setSession, deleteSession } from "../../lib/games/index.js"
import { rewardWinner } from "../../lib/games/reward.js"
import { randomEmojiPuzzle } from "../../data/emojiPuzzles.js"

export class EmojiDecodeCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options, preconditions: ["GuildOnly"] })
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder.setName("emojidecode").setDescription("Decode the emoji sequence — first correct answer wins 80 coins!"),
		)
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		if (hasSession(interaction.channelId)) {
			return interaction.reply({ content: "A game is already running in this channel.", ephemeral: true })
		}

		const puzzle = randomEmojiPuzzle()
		const channel = interaction.channel as TextChannel

		await interaction.reply({
			embeds: [
				new EmbedBuilder()
					.setColor(0xf1c40f)
					.setTitle("🤔 Emoji Decode!")
					.setDescription(`What does this represent?\n\n**${puzzle.emojis}**\n\n*Hint: ${puzzle.hint}*\n\nType your answer in chat! You have **45 seconds**.`),
			],
		})

		const timeout = setTimeout(async () => {
			deleteSession(interaction.channelId)
			collector.stop("timeout")
			await channel.send({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription(`⏰ Time's up! The answer was **${puzzle.answer}**.`)] })
		}, 45_000)

		setSession(interaction.channelId, {
			gameId: "emojidecode",
			hostId: interaction.user.id,
			channelId: interaction.channelId,
			guildId: interaction.guildId!,
			state: { answer: puzzle.answer },
			startedAt: Date.now(),
			timeout,
		})

		const collector = channel.createMessageCollector({ time: 45_000 })

		collector.on("collect", async (msg) => {
			if (msg.author.bot) return
			if (msg.content.toLowerCase().trim() === puzzle.answer) {
				collector.stop("winner")
				clearTimeout(timeout)
				deleteSession(interaction.channelId)
				await rewardWinner(msg.author.id, 80, 20)
				await channel.send({
					embeds: [
						new EmbedBuilder()
							.setColor(0x57f287)
							.setTitle("🎉 Correct!")
							.setDescription(`${msg.author} decoded it! The answer was **${puzzle.answer}**.\n\n+**80 coins** and **20 XP**!`),
					],
				})
			}
		})
	}
}
```

- [ ] **Step 5: Commit**

```bash
git add src/commands/games/trivia.ts src/commands/games/riddle.ts src/commands/games/anagram.ts src/commands/games/emojidecode.ts
git commit -m "feat: add trivia, riddle, anagram, emojidecode game commands"
```

---

## Task 4: API-Based Games — rickandmorty, harrypotter

**Files:**
- Create: `src/commands/games/rickandmorty.ts`
- Create: `src/commands/games/harrypotter.ts`

- [ ] **Step 1: Create `src/commands/games/rickandmorty.ts`**

```ts
import { Command } from "@sapphire/framework"
import { EmbedBuilder, TextChannel } from "discord.js"
import { hasSession, setSession, deleteSession } from "../../lib/games/index.js"
import { rewardWinner } from "../../lib/games/reward.js"

type RMCharacter = { name: string; status: string; species: string; origin: { name: string }; location: { name: string } }
type RMApiResponse = { results: RMCharacter[] }

const TOTAL_CHARACTERS = 826

export class RickAndMortyCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options, preconditions: ["GuildOnly"] })
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder.setName("rickandmorty").setDescription("Guess the Rick & Morty character — first correct answer wins 80 coins!"),
		)
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		if (hasSession(interaction.channelId)) {
			return interaction.reply({ content: "A game is already running in this channel.", ephemeral: true })
		}

		await interaction.deferReply()

		const id = Math.floor(Math.random() * TOTAL_CHARACTERS) + 1
		let character: RMCharacter
		try {
			const res = await fetch(`https://rickandmortyapi.com/api/character/${id}`)
			character = (await res.json()) as RMCharacter
		} catch {
			return interaction.editReply({ content: "Could not fetch a character. Try again later." })
		}

		const answer = character.name.toLowerCase()
		const channel = interaction.channel as TextChannel

		await interaction.editReply({
			embeds: [
				new EmbedBuilder()
					.setColor(0x1db954)
					.setTitle("🛸 Guess the Character!")
					.setDescription(
						`**Who is this Rick & Morty character?**\n\n` +
						`Status: **${character.status}**\n` +
						`Species: **${character.species}**\n` +
						`Origin: **${character.origin.name}**\n` +
						`Last seen: **${character.location.name}**\n\n` +
						`Type the character's name in chat! You have **45 seconds**.`,
					),
			],
		})

		const timeout = setTimeout(async () => {
			deleteSession(interaction.channelId)
			collector.stop("timeout")
			await channel.send({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription(`⏰ Time's up! The character was **${character.name}**.`)] })
		}, 45_000)

		setSession(interaction.channelId, {
			gameId: "rickandmorty",
			hostId: interaction.user.id,
			channelId: interaction.channelId,
			guildId: interaction.guildId!,
			state: { answer },
			startedAt: Date.now(),
			timeout,
		})

		const collector = channel.createMessageCollector({ time: 45_000 })

		collector.on("collect", async (msg) => {
			if (msg.author.bot) return
			if (msg.content.toLowerCase().trim() === answer) {
				collector.stop("winner")
				clearTimeout(timeout)
				deleteSession(interaction.channelId)
				await rewardWinner(msg.author.id, 80, 20)
				await channel.send({
					embeds: [
						new EmbedBuilder()
							.setColor(0x57f287)
							.setTitle("🎉 Correct!")
							.setDescription(`${msg.author} got it! The character was **${character.name}**.\n\n+**80 coins** and **20 XP**!`),
					],
				})
			}
		})
	}
}
```

- [ ] **Step 2: Create `src/commands/games/harrypotter.ts`**

```ts
import { Command } from "@sapphire/framework"
import { EmbedBuilder, TextChannel } from "discord.js"
import { hasSession, setSession, deleteSession } from "../../lib/games/index.js"
import { rewardWinner } from "../../lib/games/reward.js"
import { randomHPTrivia } from "../../data/harryPotterTrivia.js"

export class HarryPotterCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options, preconditions: ["GuildOnly"] })
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder.setName("harrypotter").setDescription("Harry Potter trivia — first correct answer wins 80 coins!"),
		)
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		if (hasSession(interaction.channelId)) {
			return interaction.reply({ content: "A game is already running in this channel.", ephemeral: true })
		}

		const trivia = randomHPTrivia()
		const channel = interaction.channel as TextChannel

		await interaction.reply({
			embeds: [
				new EmbedBuilder()
					.setColor(0x740001)
					.setTitle("⚡ Harry Potter Trivia!")
					.setDescription(`**${trivia.question}**\n\nType your answer in chat! You have **45 seconds**.`),
			],
		})

		const timeout = setTimeout(async () => {
			deleteSession(interaction.channelId)
			collector.stop("timeout")
			await channel.send({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription(`⏰ Time's up! The answer was **${trivia.answer}**.`)] })
		}, 45_000)

		setSession(interaction.channelId, {
			gameId: "harrypotter",
			hostId: interaction.user.id,
			channelId: interaction.channelId,
			guildId: interaction.guildId!,
			state: { answer: trivia.answer },
			startedAt: Date.now(),
			timeout,
		})

		const collector = channel.createMessageCollector({ time: 45_000 })

		collector.on("collect", async (msg) => {
			if (msg.author.bot) return
			if (msg.content.toLowerCase().trim() === trivia.answer) {
				collector.stop("winner")
				clearTimeout(timeout)
				deleteSession(interaction.channelId)
				await rewardWinner(msg.author.id, 80, 20)
				await channel.send({
					embeds: [
						new EmbedBuilder()
							.setColor(0x57f287)
							.setTitle("🎉 Correct!")
							.setDescription(`${msg.author} knew it! The answer was **${trivia.answer}**.\n\n+**80 coins** and **20 XP**!`),
					],
				})
			}
		})
	}
}
```

- [ ] **Step 3: Commit**

```bash
git add src/commands/games/rickandmorty.ts src/commands/games/harrypotter.ts
git commit -m "feat: add rickandmorty and harrypotter trivia game commands"
```

---

## Task 5: Hangman

**Files:**
- Create: `src/commands/games/hangman.ts`

- [ ] **Step 1: Create `src/commands/games/hangman.ts`**

```ts
import { Command } from "@sapphire/framework"
import { EmbedBuilder, TextChannel } from "discord.js"
import { hasSession, setSession, deleteSession } from "../../lib/games/index.js"
import { rewardWinner } from "../../lib/games/reward.js"
import { randomWord } from "../../data/wordList.js"

const HANGMAN_STAGES = [
	"```\n  +---+\n  |   |\n      |\n      |\n      |\n      |\n=========```",
	"```\n  +---+\n  |   |\n  O   |\n      |\n      |\n      |\n=========```",
	"```\n  +---+\n  |   |\n  O   |\n  |   |\n      |\n      |\n=========```",
	"```\n  +---+\n  |   |\n  O   |\n /|   |\n      |\n      |\n=========```",
	"```\n  +---+\n  |   |\n  O   |\n /|\\  |\n      |\n      |\n=========```",
	"```\n  +---+\n  |   |\n  O   |\n /|\\  |\n /    |\n      |\n=========```",
	"```\n  +---+\n  |   |\n  O   |\n /|\\  |\n / \\  |\n      |\n=========```",
]

type HangmanState = {
	word: string
	guessed: Set<string>
	wrongGuesses: number
	display: string[]
}

function buildDisplay(word: string, guessed: Set<string>): string[] {
	return word.split("").map((c) => (guessed.has(c) ? c : "_"))
}

export class HangmanCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options, preconditions: ["GuildOnly"] })
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder.setName("hangman").setDescription("Play hangman — guess the word before the man is hanged! Winner gets 100 coins."),
		)
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		if (hasSession(interaction.channelId)) {
			return interaction.reply({ content: "A game is already running in this channel.", ephemeral: true })
		}

		const word = randomWord(5, 8)
		const state: HangmanState = { word, guessed: new Set(), wrongGuesses: 0, display: buildDisplay(word, new Set()) }
		const channel = interaction.channel as TextChannel

		const buildEmbed = (s: HangmanState) =>
			new EmbedBuilder()
				.setColor(0xe74c3c)
				.setTitle("🪢 Hangman")
				.setDescription(
					`${HANGMAN_STAGES[s.wrongGuesses]}\n` +
					`Word: **${s.display.join(" ")}**\n\n` +
					`Wrong guesses (${s.wrongGuesses}/6): ${s.wrongGuesses > 0 ? [...s.guessed].filter((c) => !s.word.includes(c)).join(", ") : "none"}\n\n` +
					`Type a single letter to guess!`,
				)

		await interaction.reply({ embeds: [buildEmbed(state)] })

		const timeout = setTimeout(async () => {
			deleteSession(interaction.channelId)
			collector.stop("timeout")
			await channel.send({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription(`⏰ Time's up! The word was **${word}**.`)] })
		}, 120_000)

		setSession(interaction.channelId, {
			gameId: "hangman",
			hostId: interaction.user.id,
			channelId: interaction.channelId,
			guildId: interaction.guildId!,
			state,
			startedAt: Date.now(),
			timeout,
		})

		const collector = channel.createMessageCollector({ time: 120_000 })

		collector.on("collect", async (msg) => {
			if (msg.author.bot) return
			const guess = msg.content.toLowerCase().trim()
			if (guess.length !== 1 || !/[a-z]/.test(guess)) return
			if (state.guessed.has(guess)) return

			state.guessed.add(guess)

			if (state.word.includes(guess)) {
				state.display = buildDisplay(state.word, state.guessed)
				if (!state.display.includes("_")) {
					collector.stop("winner")
					clearTimeout(timeout)
					deleteSession(interaction.channelId)
					await rewardWinner(msg.author.id, 100, 25)
					await channel.send({
						embeds: [
							new EmbedBuilder()
								.setColor(0x57f287)
								.setTitle("🎉 You saved him!")
								.setDescription(`${msg.author} guessed the word **${word}**!\n\n+**100 coins** and **25 XP**!`),
						],
					})
					return
				}
			} else {
				state.wrongGuesses++
				if (state.wrongGuesses >= 6) {
					collector.stop("lost")
					clearTimeout(timeout)
					deleteSession(interaction.channelId)
					await channel.send({
						embeds: [
							new EmbedBuilder()
								.setColor(0xed4245)
								.setTitle("💀 The man is hanged!")
								.setDescription(`${HANGMAN_STAGES[6]}\nNobody saved him. The word was **${word}**.`),
						],
					})
					return
				}
			}

			await channel.send({ embeds: [buildEmbed(state)] })
		})
	}
}
```

- [ ] **Step 2: Commit**

```bash
git add src/commands/games/hangman.ts
git commit -m "feat: add hangman game command"
```

---

## Task 6: Wordguess (Wordle-style)

**Files:**
- Create: `src/commands/games/wordguess.ts`

- [ ] **Step 1: Create `src/commands/games/wordguess.ts`**

```ts
import { Command } from "@sapphire/framework"
import { EmbedBuilder, TextChannel } from "discord.js"
import { hasSession, setSession, deleteSession } from "../../lib/games/index.js"
import { rewardWinner } from "../../lib/games/reward.js"
import { randomFiveLetterWord } from "../../data/wordList.js"

type WordguessState = { word: string; attempts: number; maxAttempts: number; history: string[] }

function getFeedback(guess: string, word: string): string {
	const result: string[] = []
	const wordArr = word.split("")
	const used = new Array(5).fill(false)

	for (let i = 0; i < 5; i++) {
		if (guess[i] === wordArr[i]) {
			result[i] = "🟩"
			used[i] = true
		} else {
			result[i] = "⬛"
		}
	}

	for (let i = 0; i < 5; i++) {
		if (result[i] === "🟩") continue
		for (let j = 0; j < 5; j++) {
			if (!used[j] && guess[i] === wordArr[j]) {
				result[i] = "🟨"
				used[j] = true
				break
			}
		}
	}

	return result.join("") + "  " + guess.toUpperCase()
}

export class WordguessCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options, preconditions: ["GuildOnly"] })
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder.setName("wordguess").setDescription("Wordle-style word guessing game — solve it in 6 tries, win up to 200 coins!"),
		)
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		if (hasSession(interaction.channelId)) {
			return interaction.reply({ content: "A game is already running in this channel.", ephemeral: true })
		}

		const word = randomFiveLetterWord()
		const state: WordguessState = { word, attempts: 0, maxAttempts: 6, history: [] }
		const channel = interaction.channel as TextChannel

		await interaction.reply({
			embeds: [
				new EmbedBuilder()
					.setColor(0x2ecc71)
					.setTitle("🟩 Wordguess!")
					.setDescription(`Guess the **5-letter word** in 6 tries!\n\n🟩 = correct position  🟨 = wrong position  ⬛ = not in word\n\nType a 5-letter word to start!`),
			],
		})

		const timeout = setTimeout(async () => {
			deleteSession(interaction.channelId)
			collector.stop("timeout")
			await channel.send({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription(`⏰ Time's up! The word was **${word.toUpperCase()}**.`)] })
		}, 180_000)

		setSession(interaction.channelId, {
			gameId: "wordguess",
			hostId: interaction.user.id,
			channelId: interaction.channelId,
			guildId: interaction.guildId!,
			state,
			startedAt: Date.now(),
			timeout,
		})

		const collector = channel.createMessageCollector({ time: 180_000 })

		collector.on("collect", async (msg) => {
			if (msg.author.bot) return
			const guess = msg.content.toLowerCase().trim()
			if (guess.length !== 5 || !/^[a-z]+$/.test(guess)) return

			state.attempts++
			const feedback = getFeedback(guess, word)
			state.history.push(feedback)

			if (guess === word) {
				collector.stop("winner")
				clearTimeout(timeout)
				deleteSession(interaction.channelId)
				const remaining = state.maxAttempts - state.attempts
				const coins = 100 + remaining * 20
				await rewardWinner(msg.author.id, coins, 25)
				await channel.send({
					embeds: [
						new EmbedBuilder()
							.setColor(0x57f287)
							.setTitle("🎉 Solved!")
							.setDescription(
								`${state.history.join("\n")}\n\n${msg.author} solved it in **${state.attempts}** attempt${state.attempts === 1 ? "" : "s"}!\n\n+**${coins} coins** and **25 XP**!`,
							),
					],
				})
				return
			}

			if (state.attempts >= state.maxAttempts) {
				collector.stop("lost")
				clearTimeout(timeout)
				deleteSession(interaction.channelId)
				await channel.send({
					embeds: [
						new EmbedBuilder()
							.setColor(0xed4245)
							.setTitle("❌ Out of attempts!")
							.setDescription(`${state.history.join("\n")}\n\nThe word was **${word.toUpperCase()}**.`),
					],
				})
				return
			}

			await channel.send({
				embeds: [
					new EmbedBuilder()
						.setColor(0x3498db)
						.setDescription(`${state.history.join("\n")}\n\n**${state.maxAttempts - state.attempts}** attempt${state.maxAttempts - state.attempts === 1 ? "" : "s"} remaining.`),
				],
			})
		})
	}
}
```

- [ ] **Step 2: Commit**

```bash
git add src/commands/games/wordguess.ts
git commit -m "feat: add wordguess (wordle-style) game command"
```

---

## Task 7: Speed Games — typerace, fastdraw, mathrace

**Files:**
- Create: `src/commands/games/typerace.ts`
- Create: `src/commands/games/fastdraw.ts`
- Create: `src/commands/games/mathrace.ts`

- [ ] **Step 1: Create `src/commands/games/typerace.ts`**

```ts
import { Command } from "@sapphire/framework"
import { EmbedBuilder, TextChannel } from "discord.js"
import { hasSession, setSession, deleteSession } from "../../lib/games/index.js"
import { rewardWinner } from "../../lib/games/reward.js"

const SENTENCES = [
	"The quick brown fox jumps over the lazy dog",
	"Pack my box with five dozen liquor jugs",
	"How vexingly quick daft zebras jump",
	"The five boxing wizards jump quickly",
	"Sphinx of black quartz judge my vow",
	"Two driven jocks help fax my big quiz",
	"The early bird catches the worm but the second mouse gets the cheese",
	"All that glitters is not gold but it sure does shine brightly",
	"A rolling stone gathers no moss but gains a lot of momentum",
	"To be or not to be that is the question we must answer today",
]

export class TypeRaceCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options, preconditions: ["GuildOnly"] })
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder.setName("typerace").setDescription("Type the sentence as fast as possible — fastest typist wins 60 coins!"),
		)
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		if (hasSession(interaction.channelId)) {
			return interaction.reply({ content: "A game is already running in this channel.", ephemeral: true })
		}

		const sentence = SENTENCES[Math.floor(Math.random() * SENTENCES.length)]!
		const channel = interaction.channel as TextChannel

		await interaction.reply({
			embeds: [
				new EmbedBuilder()
					.setColor(0x3498db)
					.setTitle("⌨️ Type Race!")
					.setDescription(`Type this sentence exactly (case-insensitive):\n\n**"${sentence}"**\n\nGo!`),
			],
		})

		const startTime = Date.now()

		const timeout = setTimeout(async () => {
			deleteSession(interaction.channelId)
			collector.stop("timeout")
			await channel.send({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription("⏰ Time's up! Nobody typed it fast enough.")] })
		}, 60_000)

		setSession(interaction.channelId, {
			gameId: "typerace",
			hostId: interaction.user.id,
			channelId: interaction.channelId,
			guildId: interaction.guildId!,
			state: { sentence },
			startedAt: Date.now(),
			timeout,
		})

		const collector = channel.createMessageCollector({ time: 60_000 })

		collector.on("collect", async (msg) => {
			if (msg.author.bot) return
			if (msg.content.toLowerCase().trim() === sentence.toLowerCase()) {
				const elapsed = ((Date.now() - startTime) / 1000).toFixed(2)
				collector.stop("winner")
				clearTimeout(timeout)
				deleteSession(interaction.channelId)
				await rewardWinner(msg.author.id, 60, 15)
				await channel.send({
					embeds: [
						new EmbedBuilder()
							.setColor(0x57f287)
							.setTitle("🏁 First!")
							.setDescription(`${msg.author} finished in **${elapsed}s**!\n\n+**60 coins** and **15 XP**!`),
					],
				})
			}
		})
	}
}
```

- [ ] **Step 2: Create `src/commands/games/fastdraw.ts`**

```ts
import { Command } from "@sapphire/framework"
import { EmbedBuilder, TextChannel } from "discord.js"
import { hasSession, setSession, deleteSession } from "../../lib/games/index.js"
import { rewardWinner } from "../../lib/games/reward.js"

const TRIGGER_WORDS = ["bang", "fire", "shoot", "draw", "blaze", "pop", "zap", "boom", "pow", "hit"]

export class FastDrawCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options, preconditions: ["GuildOnly"] })
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder.setName("fastdraw").setDescription("React fastest when DRAW is called — type the trigger word first to win 60 coins!"),
		)
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		if (hasSession(interaction.channelId)) {
			return interaction.reply({ content: "A game is already running in this channel.", ephemeral: true })
		}

		const trigger = TRIGGER_WORDS[Math.floor(Math.random() * TRIGGER_WORDS.length)]!
		const channel = interaction.channel as TextChannel
		const delay = 3000 + Math.floor(Math.random() * 4000)

		await interaction.reply({
			embeds: [
				new EmbedBuilder()
					.setColor(0xe67e22)
					.setTitle("🔫 Fast Draw!")
					.setDescription(`Get ready... When you see **DRAW!**, type **\`${trigger}\`** as fast as you can!`),
			],
		})

		const preTimeout = setTimeout(async () => {
			if (!hasSession(interaction.channelId)) return

			const startTime = Date.now()
			await channel.send({
				embeds: [new EmbedBuilder().setColor(0xed4245).setTitle("🔫 DRAW!").setDescription(`Type **\`${trigger}\`** NOW!`)],
			})

			const collector = channel.createMessageCollector({ time: 10_000 })

			const winTimeout = setTimeout(async () => {
				deleteSession(interaction.channelId)
				collector.stop("timeout")
				await channel.send({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription("⏰ Nobody was fast enough!")] })
			}, 10_000)

			collector.on("collect", async (msg) => {
				if (msg.author.bot) return
				if (msg.content.toLowerCase().trim() === trigger) {
					const elapsed = Date.now() - startTime
					collector.stop("winner")
					clearTimeout(winTimeout)
					deleteSession(interaction.channelId)
					await rewardWinner(msg.author.id, 60, 15)
					await channel.send({
						embeds: [
							new EmbedBuilder()
								.setColor(0x57f287)
								.setTitle("🏆 Quickest Draw!")
								.setDescription(`${msg.author} drew in **${elapsed}ms**!\n\n+**60 coins** and **15 XP**!`),
						],
					})
				}
			})
		}, delay)

		setSession(interaction.channelId, {
			gameId: "fastdraw",
			hostId: interaction.user.id,
			channelId: interaction.channelId,
			guildId: interaction.guildId!,
			state: { trigger },
			startedAt: Date.now(),
			timeout: preTimeout,
		})
	}
}
```

- [ ] **Step 3: Create `src/commands/games/mathrace.ts`**

```ts
import { Command } from "@sapphire/framework"
import { EmbedBuilder, TextChannel } from "discord.js"
import { hasSession, setSession, deleteSession } from "../../lib/games/index.js"
import { rewardWinner } from "../../lib/games/reward.js"

type Difficulty = "easy" | "medium" | "hard"

function generateEquation(difficulty: Difficulty): { question: string; answer: number } {
	const r = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min
	if (difficulty === "easy") {
		const a = r(1, 20); const b = r(1, 20)
		const op = Math.random() < 0.5 ? "+" : "-"
		return { question: `${a} ${op} ${b}`, answer: op === "+" ? a + b : a - b }
	}
	if (difficulty === "medium") {
		const a = r(2, 12); const b = r(2, 12)
		return { question: `${a} × ${b}`, answer: a * b }
	}
	const a = r(10, 50); const b = r(2, 9)
	const c = r(1, 20)
	return { question: `${a} × ${b} + ${c}`, answer: a * b + c }
}

export class MathRaceCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options, preconditions: ["GuildOnly"] })
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("mathrace")
				.setDescription("Solve the equation first — win 70 coins!")
				.addStringOption((opt) =>
					opt
						.setName("difficulty")
						.setDescription("Equation difficulty")
						.setRequired(false)
						.addChoices({ name: "Easy", value: "easy" }, { name: "Medium", value: "medium" }, { name: "Hard", value: "hard" }),
				),
		)
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		if (hasSession(interaction.channelId)) {
			return interaction.reply({ content: "A game is already running in this channel.", ephemeral: true })
		}

		const difficulty = (interaction.options.getString("difficulty") ?? "easy") as Difficulty
		const { question, answer } = generateEquation(difficulty)
		const channel = interaction.channel as TextChannel

		await interaction.reply({
			embeds: [
				new EmbedBuilder()
					.setColor(0x1abc9c)
					.setTitle("🧮 Math Race!")
					.setDescription(`Solve this **${difficulty}** equation first:\n\n**\`${question} = ?\`**\n\nType the number in chat! You have **20 seconds**.`),
			],
		})

		const timeout = setTimeout(async () => {
			deleteSession(interaction.channelId)
			collector.stop("timeout")
			await channel.send({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription(`⏰ Time's up! The answer was **${answer}**.`)] })
		}, 20_000)

		setSession(interaction.channelId, {
			gameId: "mathrace",
			hostId: interaction.user.id,
			channelId: interaction.channelId,
			guildId: interaction.guildId!,
			state: { answer },
			startedAt: Date.now(),
			timeout,
		})

		const collector = channel.createMessageCollector({ time: 20_000 })

		collector.on("collect", async (msg) => {
			if (msg.author.bot) return
			if (parseInt(msg.content.trim(), 10) === answer) {
				collector.stop("winner")
				clearTimeout(timeout)
				deleteSession(interaction.channelId)
				await rewardWinner(msg.author.id, 70, 20)
				await channel.send({
					embeds: [
						new EmbedBuilder()
							.setColor(0x57f287)
							.setTitle("🎉 Correct!")
							.setDescription(`${msg.author} solved it! **${question} = ${answer}**.\n\n+**70 coins** and **20 XP**!`),
					],
				})
			}
		})
	}
}
```

- [ ] **Step 4: Commit**

```bash
git add src/commands/games/typerace.ts src/commands/games/fastdraw.ts src/commands/games/mathrace.ts
git commit -m "feat: add typerace, fastdraw, mathrace speed game commands"
```

---

## Task 8: Guessing Games — guessthenumber, guessthepokemon

**Files:**
- Create: `src/commands/games/guessthenumber.ts`
- Create: `src/commands/games/guessthepokemon.ts`

- [ ] **Step 1: Create `src/commands/games/guessthenumber.ts`**

```ts
import { Command } from "@sapphire/framework"
import { EmbedBuilder, TextChannel } from "discord.js"
import { hasSession, setSession, deleteSession } from "../../lib/games/index.js"
import { rewardWinner } from "../../lib/games/reward.js"

export class GuessTheNumberCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options, preconditions: ["GuildOnly"] })
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder.setName("guessthenumber").setDescription("Guess the number between 1–100 — first to nail it wins 90 coins!"),
		)
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		if (hasSession(interaction.channelId)) {
			return interaction.reply({ content: "A game is already running in this channel.", ephemeral: true })
		}

		const number = Math.floor(Math.random() * 100) + 1
		const channel = interaction.channel as TextChannel

		await interaction.reply({
			embeds: [
				new EmbedBuilder()
					.setColor(0xe91e63)
					.setTitle("🔢 Guess the Number!")
					.setDescription(`I'm thinking of a number between **1 and 100**.\n\nType your guesses in chat! First to get it wins. You have **60 seconds**.`),
			],
		})

		const timeout = setTimeout(async () => {
			deleteSession(interaction.channelId)
			collector.stop("timeout")
			await channel.send({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription(`⏰ Time's up! The number was **${number}**.`)] })
		}, 60_000)

		setSession(interaction.channelId, {
			gameId: "guessthenumber",
			hostId: interaction.user.id,
			channelId: interaction.channelId,
			guildId: interaction.guildId!,
			state: { number },
			startedAt: Date.now(),
			timeout,
		})

		const collector = channel.createMessageCollector({ time: 60_000 })

		collector.on("collect", async (msg) => {
			if (msg.author.bot) return
			const guess = parseInt(msg.content.trim(), 10)
			if (isNaN(guess) || guess < 1 || guess > 100) return

			if (guess === number) {
				collector.stop("winner")
				clearTimeout(timeout)
				deleteSession(interaction.channelId)
				await rewardWinner(msg.author.id, 90, 25)
				await channel.send({
					embeds: [
						new EmbedBuilder()
							.setColor(0x57f287)
							.setTitle("🎉 Correct!")
							.setDescription(`${msg.author} guessed it! The number was **${number}**.\n\n+**90 coins** and **25 XP**!`),
					],
				})
			} else {
				await msg.reply(guess < number ? "📈 Higher!" : "📉 Lower!")
			}
		})
	}
}
```

- [ ] **Step 2: Create `src/commands/games/guessthepokemon.ts`**

```ts
import { Command } from "@sapphire/framework"
import { EmbedBuilder, TextChannel } from "discord.js"
import { hasSession, setSession, deleteSession } from "../../lib/games/index.js"
import { rewardWinner } from "../../lib/games/reward.js"

type PokemonApiResponse = { name: string; types: { type: { name: string } }[] }

const TOTAL_POKEMON = 898

export class GuessThePokemonCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options, preconditions: ["GuildOnly"] })
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder.setName("guessthepokemon").setDescription("Guess the Pokemon from clues — first correct answer wins 90 coins!"),
		)
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		if (hasSession(interaction.channelId)) {
			return interaction.reply({ content: "A game is already running in this channel.", ephemeral: true })
		}

		await interaction.deferReply()

		const id = Math.floor(Math.random() * TOTAL_POKEMON) + 1
		let pokemon: PokemonApiResponse
		try {
			const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`)
			pokemon = (await res.json()) as PokemonApiResponse
		} catch {
			return interaction.editReply({ content: "Could not fetch a Pokemon. Try again later." })
		}

		const answer = pokemon.name.toLowerCase()
		const types = pokemon.types.map((t) => t.type.name).join(", ")
		const letters = answer.length
		const channel = interaction.channel as TextChannel

		await interaction.editReply({
			embeds: [
				new EmbedBuilder()
					.setColor(0xffcb05)
					.setTitle("❓ Who's That Pokemon?")
					.setDescription(
						`**Who is this Pokemon?**\n\n` +
						`Type: **${types}**\n` +
						`Letters: **${letters}**\n` +
						`Starts with: **${answer[0]!.toUpperCase()}**\n\n` +
						`Type the Pokemon's name in chat! You have **45 seconds**.`,
					),
			],
		})

		const timeout = setTimeout(async () => {
			deleteSession(interaction.channelId)
			collector.stop("timeout")
			await channel.send({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription(`⏰ Time's up! It was **${pokemon.name}**!`)] })
		}, 45_000)

		setSession(interaction.channelId, {
			gameId: "guessthepokemon",
			hostId: interaction.user.id,
			channelId: interaction.channelId,
			guildId: interaction.guildId!,
			state: { answer },
			startedAt: Date.now(),
			timeout,
		})

		const collector = channel.createMessageCollector({ time: 45_000 })

		collector.on("collect", async (msg) => {
			if (msg.author.bot) return
			if (msg.content.toLowerCase().trim() === answer) {
				collector.stop("winner")
				clearTimeout(timeout)
				deleteSession(interaction.channelId)
				await rewardWinner(msg.author.id, 90, 25)
				await channel.send({
					embeds: [
						new EmbedBuilder()
							.setColor(0x57f287)
							.setTitle("🎉 Correct!")
							.setDescription(`${msg.author} got it! It was **${pokemon.name}**!\n\n+**90 coins** and **25 XP**!`),
					],
				})
			}
		})
	}
}
```

- [ ] **Step 3: Commit**

```bash
git add src/commands/games/guessthenumber.ts src/commands/games/guessthepokemon.ts
git commit -m "feat: add guessthenumber and guessthepokemon game commands"
```

---

## Task 9: Multi-Round Games — quiz, trueorfalse

**Files:**
- Create: `src/commands/games/quiz.ts`
- Create: `src/commands/games/trueorfalse.ts`

- [ ] **Step 1: Create `src/commands/games/quiz.ts`**

```ts
import { Command } from "@sapphire/framework"
import { EmbedBuilder, TextChannel } from "discord.js"
import { hasSession, setSession, deleteSession } from "../../lib/games/index.js"
import { rewardWinner } from "../../lib/games/reward.js"

type TriviaApiResponse = {
	results: { question: string; correct_answer: string; incorrect_answers: string[]; category: string }[]
}

function decodeHtml(text: string): string {
	return text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#039;/g, "'")
}

type QuizState = { questions: { question: string; answer: string }[]; round: number; scores: Map<string, number> }

export class QuizCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options, preconditions: ["GuildOnly"] })
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder.setName("quiz").setDescription("5-round trivia quiz — highest score wins 150 coins!"),
		)
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		if (hasSession(interaction.channelId)) {
			return interaction.reply({ content: "A game is already running in this channel.", ephemeral: true })
		}

		await interaction.deferReply()

		let data: TriviaApiResponse
		try {
			const res = await fetch("https://opentdb.com/api.php?amount=5&type=multiple")
			data = (await res.json()) as TriviaApiResponse
		} catch {
			return interaction.editReply({ content: "Could not fetch quiz questions. Try again later." })
		}

		const questions = data.results.map((q) => ({ question: decodeHtml(q.question), answer: decodeHtml(q.correct_answer).toLowerCase() }))
		const state: QuizState = { questions, round: 0, scores: new Map() }
		const channel = interaction.channel as TextChannel

		await interaction.editReply({
			embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle("📝 Quiz Starting!").setDescription("5-round trivia quiz! Each correct answer scores a point. Highest score wins. Get ready!")],
		})

		const gameTimeout = setTimeout(async () => {
			deleteSession(interaction.channelId)
		}, 300_000)

		setSession(interaction.channelId, {
			gameId: "quiz",
			hostId: interaction.user.id,
			channelId: interaction.channelId,
			guildId: interaction.guildId!,
			state,
			startedAt: Date.now(),
			timeout: gameTimeout,
		})

		const runRound = async () => {
			if (state.round >= questions.length) {
				clearTimeout(gameTimeout)
				deleteSession(interaction.channelId)
				const sorted = [...state.scores.entries()].sort((a, b) => b[1] - a[1])
				if (sorted.length === 0) {
					await channel.send({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription("Nobody scored any points. Better luck next time!")] })
					return
				}
				const [winnerId, topScore] = sorted[0]!
				await rewardWinner(winnerId, 150, 40)
				const leaderboard = sorted.map(([id, score], i) => `**${i + 1}.** <@${id}> — ${score} point${score === 1 ? "" : "s"}`).join("\n")
				await channel.send({
					embeds: [
						new EmbedBuilder()
							.setColor(0x57f287)
							.setTitle("🏆 Quiz Complete!")
							.setDescription(`${leaderboard}\n\n<@${winnerId}> wins with **${topScore}** point${topScore === 1 ? "" : "s"}!\n\n+**150 coins** and **40 XP**!`),
					],
				})
				return
			}

			const q = questions[state.round]!
			state.round++

			await channel.send({
				embeds: [
					new EmbedBuilder()
						.setColor(0x5865f2)
						.setTitle(`Question ${state.round} of ${questions.length}`)
						.setDescription(`**${q.question}**\n\nType your answer! You have **20 seconds**.`),
				],
			})

			const answered = new Set<string>()
			const collector = channel.createMessageCollector({ time: 20_000 })

			const roundTimeout = setTimeout(() => {
				collector.stop("timeout")
			}, 20_000)

			collector.on("collect", async (msg) => {
				if (msg.author.bot || answered.has(msg.author.id)) return
				if (msg.content.toLowerCase().trim() === q.answer) {
					answered.add(msg.author.id)
					state.scores.set(msg.author.id, (state.scores.get(msg.author.id) ?? 0) + 1)
					await msg.react("✅")
				}
			})

			collector.on("end", async () => {
				clearTimeout(roundTimeout)
				await channel.send({
					embeds: [new EmbedBuilder().setColor(0x95a5a6).setDescription(`The answer was **${q.answer}**. Next question in 3 seconds...`)],
				})
				setTimeout(runRound, 3000)
			})
		}

		setTimeout(runRound, 2000)
	}
}
```

- [ ] **Step 2: Create `src/commands/games/trueorfalse.ts`**

```ts
import { Command } from "@sapphire/framework"
import { EmbedBuilder, TextChannel } from "discord.js"
import { hasSession, setSession, deleteSession } from "../../lib/games/index.js"
import { rewardWinner } from "../../lib/games/reward.js"

type TriviaApiResponse = { results: { question: string; correct_answer: string }[] }

function decodeHtml(text: string): string {
	return text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#039;/g, "'")
}

type TofState = { questions: { question: string; answer: string }[]; round: number; scores: Map<string, number> }

export class TrueOrFalseCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options, preconditions: ["GuildOnly"] })
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder.setName("trueorfalse").setDescription("5-round true/false quiz — highest score wins 150 coins!"),
		)
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		if (hasSession(interaction.channelId)) {
			return interaction.reply({ content: "A game is already running in this channel.", ephemeral: true })
		}

		await interaction.deferReply()

		let data: TriviaApiResponse
		try {
			const res = await fetch("https://opentdb.com/api.php?amount=5&type=boolean")
			data = (await res.json()) as TriviaApiResponse
		} catch {
			return interaction.editReply({ content: "Could not fetch questions. Try again later." })
		}

		const questions = data.results.map((q) => ({ question: decodeHtml(q.question), answer: q.correct_answer.toLowerCase() }))
		const state: TofState = { questions, round: 0, scores: new Map() }
		const channel = interaction.channel as TextChannel

		await interaction.editReply({
			embeds: [new EmbedBuilder().setColor(0xe67e22).setTitle("✅❌ True or False!").setDescription("5 rounds! Answer **true** or **false** for each statement. Highest score wins!")],
		})

		const gameTimeout = setTimeout(async () => {
			deleteSession(interaction.channelId)
		}, 300_000)

		setSession(interaction.channelId, {
			gameId: "trueorfalse",
			hostId: interaction.user.id,
			channelId: interaction.channelId,
			guildId: interaction.guildId!,
			state,
			startedAt: Date.now(),
			timeout: gameTimeout,
		})

		const runRound = async () => {
			if (state.round >= questions.length) {
				clearTimeout(gameTimeout)
				deleteSession(interaction.channelId)
				const sorted = [...state.scores.entries()].sort((a, b) => b[1] - a[1])
				if (sorted.length === 0) {
					await channel.send({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription("Nobody scored any points!")] })
					return
				}
				const [winnerId, topScore] = sorted[0]!
				await rewardWinner(winnerId, 150, 40)
				const leaderboard = sorted.map(([id, score], i) => `**${i + 1}.** <@${id}> — ${score} point${score === 1 ? "" : "s"}`).join("\n")
				await channel.send({
					embeds: [
						new EmbedBuilder()
							.setColor(0x57f287)
							.setTitle("🏆 Game Over!")
							.setDescription(`${leaderboard}\n\n<@${winnerId}> wins!\n\n+**150 coins** and **40 XP**!`),
					],
				})
				return
			}

			const q = questions[state.round]!
			state.round++

			await channel.send({
				embeds: [
					new EmbedBuilder()
						.setColor(0xe67e22)
						.setTitle(`Round ${state.round} of ${questions.length}`)
						.setDescription(`**${q.question}**\n\nType **true** or **false**! You have **15 seconds**.`),
				],
			})

			const answered = new Set<string>()
			const collector = channel.createMessageCollector({ time: 15_000 })
			const roundTimeout = setTimeout(() => collector.stop("timeout"), 15_000)

			collector.on("collect", async (msg) => {
				if (msg.author.bot || answered.has(msg.author.id)) return
				const r = msg.content.toLowerCase().trim()
				if (r !== "true" && r !== "false") return
				answered.add(msg.author.id)
				if (r === q.answer) {
					state.scores.set(msg.author.id, (state.scores.get(msg.author.id) ?? 0) + 1)
					await msg.react("✅")
				} else {
					await msg.react("❌")
				}
			})

			collector.on("end", async () => {
				clearTimeout(roundTimeout)
				await channel.send({
					embeds: [new EmbedBuilder().setColor(0x95a5a6).setDescription(`The answer was **${q.answer}**. Next question in 3 seconds...`)],
				})
				setTimeout(runRound, 3000)
			})
		}

		setTimeout(runRound, 2000)
	}
}
```

- [ ] **Step 3: Commit**

```bash
git add src/commands/games/quiz.ts src/commands/games/trueorfalse.ts
git commit -m "feat: add quiz and trueorfalse multi-round game commands"
```

---

## Task 10: Wordchain

**Files:**
- Create: `src/commands/games/wordchain.ts`

- [ ] **Step 1: Create `src/commands/games/wordchain.ts`**

```ts
import { Command } from "@sapphire/framework"
import { EmbedBuilder, TextChannel } from "discord.js"
import { hasSession, setSession, deleteSession } from "../../lib/games/index.js"
import { rewardWinner } from "../../lib/games/reward.js"

type WordchainState = {
	lastWord: string
	usedWords: Set<string>
	eliminated: Set<string>
	participants: Set<string>
}

export class WordchainCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options, preconditions: ["GuildOnly"] })
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("wordchain")
				.setDescription("Word chain — each word must start with the last letter of the previous. Last standing wins 120 coins!")
				.addStringOption((opt) => opt.setName("startword").setDescription("Starting word (optional)").setRequired(false)),
		)
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		if (hasSession(interaction.channelId)) {
			return interaction.reply({ content: "A game is already running in this channel.", ephemeral: true })
		}

		const startWord = (interaction.options.getString("startword") ?? "start").toLowerCase()
		const state: WordchainState = {
			lastWord: startWord,
			usedWords: new Set([startWord]),
			eliminated: new Set(),
			participants: new Set(),
		}
		const channel = interaction.channel as TextChannel

		await interaction.reply({
			embeds: [
				new EmbedBuilder()
					.setColor(0x8e44ad)
					.setTitle("🔗 Word Chain!")
					.setDescription(
						`Each word must start with the last letter of the previous word.\n\n` +
						`Starting word: **${startWord}**\n` +
						`Next letter: **${startWord[startWord.length - 1]!.toUpperCase()}**\n\n` +
						`Wrong word or repeat = eliminated. Last player standing wins!\n` +
						`Game ends after **60 seconds** of inactivity.`,
					),
			],
		})

		let activityTimeout: NodeJS.Timeout

		const resetActivityTimeout = () => {
			clearTimeout(activityTimeout)
			activityTimeout = setTimeout(async () => {
				collector.stop("inactivity")
				deleteSession(interaction.channelId)
				const remaining = [...state.participants].filter((id) => !state.eliminated.has(id))
				if (remaining.length === 1) {
					const [winnerId] = remaining
					await rewardWinner(winnerId!, 120, 30)
					await channel.send({
						embeds: [
							new EmbedBuilder()
								.setColor(0x57f287)
								.setTitle("🏆 Winner by default!")
								.setDescription(`<@${winnerId}> is the last one standing!\n\n+**120 coins** and **30 XP**!`),
						],
					})
				} else {
					await channel.send({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription("⏰ Game ended due to inactivity!")] })
				}
			}, 60_000)
		}

		resetActivityTimeout()

		setSession(interaction.channelId, {
			gameId: "wordchain",
			hostId: interaction.user.id,
			channelId: interaction.channelId,
			guildId: interaction.guildId!,
			state,
			startedAt: Date.now(),
			timeout: activityTimeout!,
		})

		const collector = channel.createMessageCollector({ time: 600_000 })

		collector.on("collect", async (msg) => {
			if (msg.author.bot) return
			const word = msg.content.toLowerCase().trim()
			if (!/^[a-z]+$/.test(word)) return

			state.participants.add(msg.author.id)

			if (state.eliminated.has(msg.author.id)) return

			const expectedStart = state.lastWord[state.lastWord.length - 1]!

			if (word[0] !== expectedStart) {
				state.eliminated.add(msg.author.id)
				await msg.reply(`❌ Eliminated! **${word}** doesn't start with **${expectedStart.toUpperCase()}**.`)
			} else if (state.usedWords.has(word)) {
				state.eliminated.add(msg.author.id)
				await msg.reply(`❌ Eliminated! **${word}** was already used.`)
			} else {
				state.usedWords.add(word)
				state.lastWord = word
				resetActivityTimeout()
				await msg.react("✅")

				const remaining = [...state.participants].filter((id) => !state.eliminated.has(id))
				if (remaining.length === 1 && state.participants.size > 1) {
					collector.stop("winner")
					clearTimeout(activityTimeout)
					deleteSession(interaction.channelId)
					const [winnerId] = remaining
					await rewardWinner(winnerId!, 120, 30)
					await channel.send({
						embeds: [
							new EmbedBuilder()
								.setColor(0x57f287)
								.setTitle("🏆 Last Standing!")
								.setDescription(`<@${winnerId}> wins the word chain!\n\n+**120 coins** and **30 XP**!`),
						],
					})
				}
			}
		})
	}
}
```

- [ ] **Step 2: Commit**

```bash
git add src/commands/games/wordchain.ts
git commit -m "feat: add wordchain game command"
```

---

## Task 11: Would You Rather

**Files:**
- Create: `src/commands/games/wouldyourather.ts`

- [ ] **Step 1: Create `src/commands/games/wouldyourather.ts`**

```ts
import { Command } from "@sapphire/framework"
import { EmbedBuilder } from "discord.js"

const QUESTIONS: { a: string; b: string }[] = [
	{ a: "Be able to fly", b: "Be invisible" },
	{ a: "Never sleep again", b: "Never eat again" },
	{ a: "Know how you die", b: "Know when you die" },
	{ a: "Be the funniest person in the room", b: "Be the smartest person in the room" },
	{ a: "Live in the past", b: "Live in the future" },
	{ a: "Be always cold", b: "Be always hot" },
	{ a: "Have no internet for a month", b: "Have no music for a year" },
	{ a: "Fight 100 duck-sized horses", b: "Fight 1 horse-sized duck" },
	{ a: "Only be able to whisper", b: "Only be able to shout" },
	{ a: "Lose all your memories", b: "Never make new memories" },
	{ a: "Have unlimited money but no friends", b: "Have unlimited friends but no money" },
	{ a: "Always be 10 minutes late", b: "Always be 20 minutes early" },
	{ a: "Live without music", b: "Live without movies/TV" },
	{ a: "Be famous but hated", b: "Be unknown but loved" },
	{ a: "Have the ability to read minds", b: "Have the ability to see the future" },
]

export class WouldYouRatherCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options, preconditions: ["GuildOnly"] })
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder.setName("wouldyourather").setDescription("Post a would-you-rather question for the channel to vote on!"),
		)
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const q = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)]!

		const embed = new EmbedBuilder()
			.setColor(0xf39c12)
			.setTitle("🤔 Would You Rather...")
			.addFields(
				{ name: "🅰️ Option A", value: q.a, inline: true },
				{ name: "🅱️ Option B", value: q.b, inline: true },
			)
			.setFooter({ text: "React with 🅰️ or 🅱️ to vote!" })

		const msg = await interaction.reply({ embeds: [embed], fetchReply: true })
		await msg.react("🅰️")
		await msg.react("🅱️")
	}
}
```

- [ ] **Step 2: Commit**

```bash
git add src/commands/games/wouldyourather.ts
git commit -m "feat: add wouldyourather command"
```

---

## Task 12: Run lint and verify build

- [ ] **Step 1: Run Biome check**

```bash
pnpm check
```

Fix any lint/format errors reported.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm build
```

Expected: No TypeScript errors. Output in `dist/`.

- [ ] **Step 3: Commit any lint fixes**

```bash
git add -A
git commit -m "fix: lint and format all game commands"
```

---

## Manual Testing Checklist

Start the bot with `pnpm dev` and test each command in a Discord server:

- [ ] `/trivia` — question appears, correct answer awards coins, wrong answer ignored, timeout clears session
- [ ] `/riddle` — riddle appears, solved on correct answer, timeout shows answer
- [ ] `/anagram` — scrambled word appears, correct answer wins, different from original word
- [ ] `/emojidecode` — emoji sequence appears with hint, correct answer wins
- [ ] `/rickandmorty` — character clues appear, correct name wins
- [ ] `/harrypotter` — HP question appears, correct answer wins
- [ ] `/hangman` — word display with underscores, single letters accepted, 6 wrong = game over
- [ ] `/wordguess` — 5-letter word, feedback emojis correct, reward scales with attempts
- [ ] `/typerace` — sentence displayed, first exact match wins
- [ ] `/fastdraw` — countdown then trigger word, fastest wins
- [ ] `/mathrace` — equation displayed, correct number wins
- [ ] `/guessthenumber` — higher/lower feedback, first exact guess wins
- [ ] `/guessthepokemon` — type/letter count clues, correct Pokemon name wins
- [ ] `/wordchain` — word chain builds, bad word eliminates player, last standing wins
- [ ] `/quiz` — 5 rounds run sequentially, scores tracked, winner rewarded
- [ ] `/trueorfalse` — 5 rounds, true/false accepted, scores tracked
- [ ] `/wouldyourather` — embed posted with A/B reactions
- [ ] **Duplicate game prevention** — start a game, try starting another in same channel → ephemeral error
- [ ] **Coin rewards** — check `/profile` after winning a game to confirm coins/XP added
