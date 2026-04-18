# Fun & Social Commands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 4 social action commands (hug, slap, pat, ship) and 10 fun/utility commands powered by free APIs.

**Architecture:** All commands are stateless with no session management. Social commands use `nekos.best` for GIFs with static fallback URLs. Fun commands each call their respective free API. All live in `src/commands/fun/`.

**Tech Stack:** Sapphire Framework, Discord.js v14, native fetch

---

## File Map

**Create:**
- `src/commands/fun/hug.ts`
- `src/commands/fun/slap.ts`
- `src/commands/fun/pat.ts`
- `src/commands/fun/ship.ts`
- `src/commands/fun/joke.ts`
- `src/commands/fun/dadjoke.ts`
- `src/commands/fun/advice.ts`
- `src/commands/fun/numberfact.ts`
- `src/commands/fun/quote.ts`
- `src/commands/fun/dog.ts`
- `src/commands/fun/cat.ts`
- `src/commands/fun/apod.ts`
- `src/commands/fun/weather.ts`
- `src/commands/fun/define.ts`

---

## Task 1: Social GIF Commands — hug, slap, pat

All three follow identical structure: fetch GIF from `nekos.best`, send embed tagging both users.

**Files:**
- Create: `src/commands/fun/hug.ts`
- Create: `src/commands/fun/slap.ts`
- Create: `src/commands/fun/pat.ts`

- [ ] **Step 1: Create `src/commands/fun/hug.ts`**

```ts
import { Command } from "@sapphire/framework"
import { EmbedBuilder, User } from "discord.js"

const FALLBACK_GIFS = [
	"https://media.tenor.com/XrL_oEfJtOgAAAAC/hug-anime.gif",
	"https://media.tenor.com/tSmFOMPFJE8AAAAC/hug.gif",
]

async function fetchGif(action: string): Promise<string> {
	try {
		const res = await fetch(`https://nekos.best/api/v2/${action}`)
		const data = (await res.json()) as { results: { url: string }[] }
		return data.results[0]?.url ?? FALLBACK_GIFS[0]!
	} catch {
		return FALLBACK_GIFS[Math.floor(Math.random() * FALLBACK_GIFS.length)]!
	}
}

export class HugCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options, preconditions: ["GuildOnly"] })
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("hug")
				.setDescription("Give someone a warm hug!")
				.addUserOption((opt) => opt.setName("user").setDescription("Who to hug").setRequired(true)),
		)
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const target = interaction.options.getUser("user", true)

		if (target.id === interaction.user.id) {
			return interaction.reply({ content: "You can't hug yourself!", ephemeral: true })
		}
		if (target.bot) {
			return interaction.reply({ content: "You can't hug a bot!", ephemeral: true })
		}

		const gifUrl = await fetchGif("hug")

		return interaction.reply({
			embeds: [
				new EmbedBuilder()
					.setColor(0xff6b9d)
					.setDescription(`${interaction.user} hugged ${target}! 🤗`)
					.setImage(gifUrl),
			],
		})
	}
}
```

- [ ] **Step 2: Create `src/commands/fun/slap.ts`**

```ts
import { Command } from "@sapphire/framework"
import { EmbedBuilder } from "discord.js"

const FALLBACK_GIFS = [
	"https://media.tenor.com/oynF8XnmRB8AAAAC/slap-anime.gif",
	"https://media.tenor.com/0zqj_OKPV6YAAAAC/slap.gif",
]

async function fetchGif(action: string): Promise<string> {
	try {
		const res = await fetch(`https://nekos.best/api/v2/${action}`)
		const data = (await res.json()) as { results: { url: string }[] }
		return data.results[0]?.url ?? FALLBACK_GIFS[0]!
	} catch {
		return FALLBACK_GIFS[Math.floor(Math.random() * FALLBACK_GIFS.length)]!
	}
}

export class SlapCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options, preconditions: ["GuildOnly"] })
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("slap")
				.setDescription("Slap someone!")
				.addUserOption((opt) => opt.setName("user").setDescription("Who to slap").setRequired(true)),
		)
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const target = interaction.options.getUser("user", true)

		if (target.id === interaction.user.id) {
			return interaction.reply({ content: "You can't slap yourself!", ephemeral: true })
		}
		if (target.bot) {
			return interaction.reply({ content: "You can't slap a bot!", ephemeral: true })
		}

		const gifUrl = await fetchGif("slap")

		return interaction.reply({
			embeds: [
				new EmbedBuilder()
					.setColor(0xed4245)
					.setDescription(`${interaction.user} slapped ${target}! 👋`)
					.setImage(gifUrl),
			],
		})
	}
}
```

- [ ] **Step 3: Create `src/commands/fun/pat.ts`**

```ts
import { Command } from "@sapphire/framework"
import { EmbedBuilder } from "discord.js"

const FALLBACK_GIFS = [
	"https://media.tenor.com/GNcrpMRnJiYAAAAC/head-pat-anime.gif",
	"https://media.tenor.com/c7EKb8-uaXQAAAAC/pat-pat.gif",
]

async function fetchGif(action: string): Promise<string> {
	try {
		const res = await fetch(`https://nekos.best/api/v2/${action}`)
		const data = (await res.json()) as { results: { url: string }[] }
		return data.results[0]?.url ?? FALLBACK_GIFS[0]!
	} catch {
		return FALLBACK_GIFS[Math.floor(Math.random() * FALLBACK_GIFS.length)]!
	}
}

export class PatCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options, preconditions: ["GuildOnly"] })
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("pat")
				.setDescription("Give someone a headpat!")
				.addUserOption((opt) => opt.setName("user").setDescription("Who to pat").setRequired(true)),
		)
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const target = interaction.options.getUser("user", true)

		if (target.id === interaction.user.id) {
			return interaction.reply({ content: "You can't pat yourself!", ephemeral: true })
		}
		if (target.bot) {
			return interaction.reply({ content: "You can't pat a bot!", ephemeral: true })
		}

		const gifUrl = await fetchGif("pat")

		return interaction.reply({
			embeds: [
				new EmbedBuilder()
					.setColor(0x57f287)
					.setDescription(`${interaction.user} patted ${target}! 🤚`)
					.setImage(gifUrl),
			],
		})
	}
}
```

- [ ] **Step 4: Commit**

```bash
git add src/commands/fun/hug.ts src/commands/fun/slap.ts src/commands/fun/pat.ts
git commit -m "feat: add hug, slap, pat social action commands"
```

---

## Task 2: Ship Command

**Files:**
- Create: `src/commands/fun/ship.ts`

- [ ] **Step 1: Create `src/commands/fun/ship.ts`**

```ts
import { Command } from "@sapphire/framework"
import { EmbedBuilder } from "discord.js"

function shipScore(id1: string, id2: string): number {
	const combined = [id1, id2].sort().join("")
	let hash = 0
	for (let i = 0; i < combined.length; i++) {
		hash = (hash * 31 + combined.charCodeAt(i)) >>> 0
	}
	return hash % 101
}

function shipName(name1: string, name2: string): string {
	const half1 = name1.slice(0, Math.ceil(name1.length / 2))
	const half2 = name2.slice(Math.floor(name2.length / 2))
	return half1 + half2
}

function shipEmoji(score: number): string {
	if (score >= 90) return "💞"
	if (score >= 70) return "💕"
	if (score >= 50) return "💛"
	if (score >= 30) return "🤝"
	return "💔"
}

export class ShipCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options, preconditions: ["GuildOnly"] })
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("ship")
				.setDescription("Check the compatibility between two users!")
				.addUserOption((opt) => opt.setName("user1").setDescription("First user").setRequired(true))
				.addUserOption((opt) => opt.setName("user2").setDescription("Second user").setRequired(true)),
		)
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const user1 = interaction.options.getUser("user1", true)
		const user2 = interaction.options.getUser("user2", true)

		if (user1.id === user2.id) {
			return interaction.reply({ content: "You can't ship someone with themselves!", ephemeral: true })
		}

		const score = shipScore(user1.id, user2.id)
		const name = shipName(user1.displayName, user2.displayName)
		const emoji = shipEmoji(score)
		const bar = "█".repeat(Math.floor(score / 10)) + "░".repeat(10 - Math.floor(score / 10))

		return interaction.reply({
			embeds: [
				new EmbedBuilder()
					.setColor(0xff6b9d)
					.setTitle(`${emoji} Ship: ${name}`)
					.setDescription(
						`${user1} ❤️ ${user2}\n\n` +
						`Compatibility: **${score}%**\n` +
						`\`${bar}\``,
					),
			],
		})
	}
}
```

- [ ] **Step 2: Commit**

```bash
git add src/commands/fun/ship.ts
git commit -m "feat: add ship compatibility command"
```

---

## Task 3: Joke & Quote Commands — joke, dadjoke, advice, quote

**Files:**
- Create: `src/commands/fun/joke.ts`
- Create: `src/commands/fun/dadjoke.ts`
- Create: `src/commands/fun/advice.ts`
- Create: `src/commands/fun/quote.ts`

- [ ] **Step 1: Create `src/commands/fun/joke.ts`**

```ts
import { Command } from "@sapphire/framework"
import { EmbedBuilder } from "discord.js"

type JokeResponse =
	| { type: "single"; joke: string; error: false }
	| { type: "twopart"; setup: string; delivery: string; error: false }
	| { error: true; message: string }

export class JokeCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options })
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("joke")
				.setDescription("Get a random joke!")
				.addStringOption((opt) =>
					opt
						.setName("type")
						.setDescription("Joke category")
						.setRequired(false)
						.addChoices(
							{ name: "Any", value: "Any" },
							{ name: "Programming", value: "Programming" },
							{ name: "Misc", value: "Misc" },
							{ name: "Dark", value: "Dark" },
							{ name: "Pun", value: "Pun" },
						),
				),
		)
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const type = interaction.options.getString("type") ?? "Any"

		let data: JokeResponse
		try {
			const res = await fetch(`https://v2.jokeapi.dev/joke/${type}?blacklistFlags=racist,sexist`)
			data = (await res.json()) as JokeResponse
		} catch {
			return interaction.reply({ content: "Couldn't fetch a joke right now. Try again later.", ephemeral: true })
		}

		if (data.error) {
			return interaction.reply({ content: "Couldn't fetch a joke right now.", ephemeral: true })
		}

		const text = data.type === "twopart" ? `${data.setup}\n\n||${data.delivery}||` : data.joke

		return interaction.reply({
			embeds: [new EmbedBuilder().setColor(0xf39c12).setTitle("😄 Joke").setDescription(text)],
		})
	}
}
```

- [ ] **Step 2: Create `src/commands/fun/dadjoke.ts`**

```ts
import { Command } from "@sapphire/framework"
import { EmbedBuilder } from "discord.js"

export class DadJokeCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options })
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder.setName("dadjoke").setDescription("Get a random dad joke!"),
		)
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		let joke: string
		try {
			const res = await fetch("https://icanhazdadjoke.com/", { headers: { Accept: "application/json" } })
			const data = (await res.json()) as { joke: string }
			joke = data.joke
		} catch {
			return interaction.reply({ content: "Couldn't fetch a dad joke right now.", ephemeral: true })
		}

		return interaction.reply({
			embeds: [new EmbedBuilder().setColor(0xe67e22).setTitle("👨 Dad Joke").setDescription(joke)],
		})
	}
}
```

- [ ] **Step 3: Create `src/commands/fun/advice.ts`**

```ts
import { Command } from "@sapphire/framework"
import { EmbedBuilder } from "discord.js"

export class AdviceCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options })
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder.setName("advice").setDescription("Get a random piece of advice!"),
		)
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		let advice: string
		try {
			const res = await fetch("https://api.adviceslip.com/advice")
			const data = (await res.json()) as { slip: { advice: string } }
			advice = data.slip.advice
		} catch {
			return interaction.reply({ content: "Couldn't fetch advice right now.", ephemeral: true })
		}

		return interaction.reply({
			embeds: [new EmbedBuilder().setColor(0x2ecc71).setTitle("💡 Advice").setDescription(`*"${advice}"*`)],
		})
	}
}
```

- [ ] **Step 4: Create `src/commands/fun/quote.ts`**

```ts
import { Command } from "@sapphire/framework"
import { EmbedBuilder } from "discord.js"

export class QuoteCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options })
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder.setName("quote").setDescription("Get an inspirational quote!"),
		)
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		let content: string
		let author: string
		try {
			const res = await fetch("https://api.quotable.io/random")
			const data = (await res.json()) as { content: string; author: string }
			content = data.content
			author = data.author
		} catch {
			return interaction.reply({ content: "Couldn't fetch a quote right now.", ephemeral: true })
		}

		return interaction.reply({
			embeds: [
				new EmbedBuilder()
					.setColor(0x3498db)
					.setTitle("💬 Quote")
					.setDescription(`*"${content}"*`)
					.setFooter({ text: `— ${author}` }),
			],
		})
	}
}
```

- [ ] **Step 5: Commit**

```bash
git add src/commands/fun/joke.ts src/commands/fun/dadjoke.ts src/commands/fun/advice.ts src/commands/fun/quote.ts
git commit -m "feat: add joke, dadjoke, advice, quote fun commands"
```

---

## Task 4: Number & Animal Commands — numberfact, dog, cat

**Files:**
- Create: `src/commands/fun/numberfact.ts`
- Create: `src/commands/fun/dog.ts`
- Create: `src/commands/fun/cat.ts`

- [ ] **Step 1: Create `src/commands/fun/numberfact.ts`**

```ts
import { Command } from "@sapphire/framework"
import { EmbedBuilder } from "discord.js"

export class NumberFactCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options })
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("numberfact")
				.setDescription("Get an interesting fact about a number!")
				.addIntegerOption((opt) =>
					opt.setName("number").setDescription("The number to get a fact about (leave empty for random)").setRequired(false),
				),
		)
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const num = interaction.options.getInteger("number")
		const target = num !== null ? String(num) : "random"

		let fact: string
		try {
			const res = await fetch(`http://numbersapi.com/${target}`)
			fact = await res.text()
		} catch {
			return interaction.reply({ content: "Couldn't fetch a number fact right now.", ephemeral: true })
		}

		return interaction.reply({
			embeds: [
				new EmbedBuilder()
					.setColor(0x9b59b6)
					.setTitle(`🔢 Number Fact${num !== null ? `: ${num}` : ""}`)
					.setDescription(fact),
			],
		})
	}
}
```

- [ ] **Step 2: Create `src/commands/fun/dog.ts`**

```ts
import { Command } from "@sapphire/framework"
import { EmbedBuilder } from "discord.js"

export class DogCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options })
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder.setName("dog").setDescription("Get a random dog image!"),
		)
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		let imageUrl: string
		try {
			const res = await fetch("https://dog.ceo/api/breeds/image/random")
			const data = (await res.json()) as { message: string; status: string }
			imageUrl = data.message
		} catch {
			return interaction.reply({ content: "Couldn't fetch a dog right now.", ephemeral: true })
		}

		return interaction.reply({
			embeds: [new EmbedBuilder().setColor(0xe67e22).setTitle("🐶 Woof!").setImage(imageUrl)],
		})
	}
}
```

- [ ] **Step 3: Create `src/commands/fun/cat.ts`**

```ts
import { Command } from "@sapphire/framework"
import { EmbedBuilder } from "discord.js"

export class CatCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options })
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder.setName("cat").setDescription("Get a random cat image!"),
		)
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		let imageUrl: string
		try {
			const res = await fetch("https://api.thecatapi.com/v1/images/search")
			const data = (await res.json()) as { url: string }[]
			imageUrl = data[0]?.url ?? ""
			if (!imageUrl) throw new Error("No image")
		} catch {
			return interaction.reply({ content: "Couldn't fetch a cat right now.", ephemeral: true })
		}

		return interaction.reply({
			embeds: [new EmbedBuilder().setColor(0xf1c40f).setTitle("🐱 Meow!").setImage(imageUrl)],
		})
	}
}
```

- [ ] **Step 4: Commit**

```bash
git add src/commands/fun/numberfact.ts src/commands/fun/dog.ts src/commands/fun/cat.ts
git commit -m "feat: add numberfact, dog, cat fun commands"
```

---

## Task 5: Info Commands — apod, weather, define

**Files:**
- Create: `src/commands/fun/apod.ts`
- Create: `src/commands/fun/weather.ts`
- Create: `src/commands/fun/define.ts`

- [ ] **Step 1: Create `src/commands/fun/apod.ts`**

```ts
import { Command } from "@sapphire/framework"
import { EmbedBuilder } from "discord.js"

export class ApodCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options })
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder.setName("apod").setDescription("NASA Astronomy Picture of the Day!"),
		)
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		await interaction.deferReply()

		const apiKey = process.env.NASA_API_KEY ?? "DEMO_KEY"
		let data: { title: string; explanation: string; url: string; media_type: string; date: string }
		try {
			const res = await fetch(`https://api.nasa.gov/planetary/apod?api_key=${apiKey}`)
			data = (await res.json()) as typeof data
		} catch {
			return interaction.editReply({ content: "Couldn't fetch NASA's picture right now." })
		}

		if (data.media_type !== "image") {
			return interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setColor(0x2c3e50)
						.setTitle(`🌌 APOD: ${data.title}`)
						.setDescription(`${data.explanation.slice(0, 1000)}${data.explanation.length > 1000 ? "..." : ""}\n\n[View media](${data.url})`)
						.setFooter({ text: data.date }),
				],
			})
		}

		return interaction.editReply({
			embeds: [
				new EmbedBuilder()
					.setColor(0x2c3e50)
					.setTitle(`🌌 APOD: ${data.title}`)
					.setDescription(`${data.explanation.slice(0, 1000)}${data.explanation.length > 1000 ? "..." : ""}`)
					.setImage(data.url)
					.setFooter({ text: data.date }),
			],
		})
	}
}
```

- [ ] **Step 2: Create `src/commands/fun/weather.ts`**

```ts
import { Command } from "@sapphire/framework"
import { EmbedBuilder } from "discord.js"

type WttrResponse = {
	current_condition: {
		temp_C: string
		temp_F: string
		weatherDesc: { value: string }[]
		humidity: string
		windspeedKmph: string
		FeelsLikeC: string
	}[]
	nearest_area: { areaName: { value: string }[]; country: { value: string }[] }[]
}

export class WeatherCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options })
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("weather")
				.setDescription("Get current weather for a city!")
				.addStringOption((opt) => opt.setName("city").setDescription("City name").setRequired(true)),
		)
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const city = interaction.options.getString("city", true)
		await interaction.deferReply()

		let data: WttrResponse
		try {
			const res = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`)
			if (!res.ok) return interaction.editReply({ content: `City not found: **${city}**` })
			data = (await res.json()) as WttrResponse
		} catch {
			return interaction.editReply({ content: "Couldn't fetch weather right now." })
		}

		const cond = data.current_condition[0]
		const area = data.nearest_area[0]
		if (!cond || !area) return interaction.editReply({ content: `City not found: **${city}**` })

		const location = `${area.areaName[0]?.value}, ${area.country[0]?.value}`
		const desc = cond.weatherDesc[0]?.value ?? "Unknown"

		return interaction.editReply({
			embeds: [
				new EmbedBuilder()
					.setColor(0x3498db)
					.setTitle(`🌤️ Weather: ${location}`)
					.addFields(
						{ name: "Condition", value: desc, inline: true },
						{ name: "Temperature", value: `${cond.temp_C}°C / ${cond.temp_F}°F`, inline: true },
						{ name: "Feels Like", value: `${cond.FeelsLikeC}°C`, inline: true },
						{ name: "Humidity", value: `${cond.humidity}%`, inline: true },
						{ name: "Wind", value: `${cond.windspeedKmph} km/h`, inline: true },
					),
			],
		})
	}
}
```

- [ ] **Step 3: Create `src/commands/fun/define.ts`**

```ts
import { Command } from "@sapphire/framework"
import { EmbedBuilder } from "discord.js"

type DictionaryResponse = {
	word: string
	phonetic?: string
	meanings: {
		partOfSpeech: string
		definitions: { definition: string; example?: string }[]
	}[]
}[]

export class DefineCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options })
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("define")
				.setDescription("Look up the definition of a word!")
				.addStringOption((opt) => opt.setName("word").setDescription("Word to define").setRequired(true)),
		)
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const word = interaction.options.getString("word", true).toLowerCase().trim()
		await interaction.deferReply()

		let data: DictionaryResponse
		try {
			const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`)
			if (res.status === 404) return interaction.editReply({ content: `No definition found for **${word}**.` })
			data = (await res.json()) as DictionaryResponse
		} catch {
			return interaction.editReply({ content: "Couldn't fetch the definition right now." })
		}

		const entry = data[0]
		if (!entry) return interaction.editReply({ content: `No definition found for **${word}**.` })

		const embed = new EmbedBuilder()
			.setColor(0x1abc9c)
			.setTitle(`📖 ${entry.word}${entry.phonetic ? ` *(${entry.phonetic})*` : ""}`)

		for (const meaning of entry.meanings.slice(0, 2)) {
			const def = meaning.definitions[0]
			if (!def) continue
			const value = def.example ? `${def.definition}\n*Example: "${def.example}"*` : def.definition
			embed.addFields({ name: meaning.partOfSpeech, value: value.slice(0, 1024) })
		}

		return interaction.editReply({ embeds: [embed] })
	}
}
```

- [ ] **Step 4: Add `NASA_API_KEY` to `.env`**

Open `.env` and add:
```
NASA_API_KEY=DEMO_KEY
```

Replace `DEMO_KEY` with a free key from https://api.nasa.gov/ (takes 30 seconds to register).

- [ ] **Step 5: Commit**

```bash
git add src/commands/fun/apod.ts src/commands/fun/weather.ts src/commands/fun/define.ts .env
git commit -m "feat: add apod, weather, define info commands"
```

---

## Task 6: Lint and Build

- [ ] **Step 1: Run Biome check**

```bash
pnpm check
```

Fix any errors reported.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm build
```

Expected: No TypeScript errors.

- [ ] **Step 3: Commit lint fixes if any**

```bash
git add -A
git commit -m "fix: lint and format fun/social commands"
```

---

## Manual Testing Checklist

Start bot with `pnpm dev` and test in Discord:

- [ ] `/hug @user` — GIF embed appears tagging both users; `/hug @self` returns ephemeral error
- [ ] `/slap @user` — slap GIF embed appears
- [ ] `/pat @user` — pat GIF embed appears
- [ ] `/ship @user1 @user2` — compatibility % and ship name appear; same user twice returns error
- [ ] `/joke` — joke appears; `/joke type:Programming` returns programming joke with spoiler delivery
- [ ] `/dadjoke` — dad joke appears
- [ ] `/advice` — advice appears in italics
- [ ] `/quote` — quote with author footer appears
- [ ] `/numberfact 42` — fact about 42; `/numberfact` (no arg) returns random
- [ ] `/dog` — dog image embed appears
- [ ] `/cat` — cat image embed appears
- [ ] `/apod` — NASA picture + description appears
- [ ] `/weather London` — temperature, condition, humidity, wind appear
- [ ] `/weather InvalidCityXYZ123` — "City not found" response
- [ ] `/define eloquent` — definition with part of speech and example
- [ ] `/define xyznotaword` — "No definition found" response
