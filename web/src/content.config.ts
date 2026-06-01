import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "zod";

const commands = defineCollection({
	loader: glob({ pattern: "**/*.mdx", base: "./src/content/commands" }),
	schema: z.object({
		name: z.string(),
		cat: z.string(),
		tags: z.array(z.string()),
		summary: z.string(),
		syntax: z.object({
			cmd: z.string(),
			args: z.array(z.object({ n: z.string(), d: z.string(), req: z.boolean(), t: z.string() })),
		}),
		variants: z
			.array(z.object({ n: z.string(), risk: z.number(), pay: z.string(), stat: z.string(), d: z.string() }))
			.optional(),
		examples: z.array(
			z.object({
				label: z.string(),
				tag: z.string(),
				tagBg: z.string(),
				user: z.string(),
				userColor: z.string(),
				input: z.string(),
				time: z.string(),
				botSays: z.string(),
				reactions: z.array(z.object({ e: z.string(), n: z.number() })).optional(),
				embedAccent: z.string(),
				embedTitle: z.string(),
				embedFooter: z.string().optional(),
				embedRows: z.array(z.tuple([z.string(), z.string(), z.string().optional()])),
			}),
		),
		related: z.array(z.object({ n: z.string(), d: z.string() })),
	}),
});

export const collections = { commands };
