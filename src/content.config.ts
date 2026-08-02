import { defineCollection, z } from 'astro:content';
import { cmsNewsLoader, cmsJournalLoader, cmsEventsLoader } from './loaders/cms';

const newsCollection = defineCollection({
  loader: cmsNewsLoader(),
  schema: z.object({
    title: z.string(),
    titleTH: z.string().optional(),
    date: z.coerce.date(),
    category: z.enum(['conference', 'journal', 'training', 'announcement', 'activity']),
    excerpt: z.string(),
    excerptTH: z.string().optional(),
    image: z.string().optional(),
    featured: z.boolean().default(false),
    author: z.string().optional(),
  }),
});

const eventsCollection = defineCollection({
  loader: cmsEventsLoader(),
  schema: z.object({
    title: z.string(),
    titleTH: z.string().optional(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date().optional(),
    location: z.string(),
    locationTH: z.string().optional(),
    type: z.enum(['national', 'international', 'training', 'webinar']),
    status: z.enum(['upcoming', 'past', 'ongoing']),
    registrationUrl: z.string().optional(),
    image: z.string().optional(),
    excerpt: z.string(),
    excerptTH: z.string().optional(),
    featured: z.boolean().default(false),
  }),
});

const journalCollection = defineCollection({
  loader: cmsJournalLoader(),
  schema: z.object({
    title: z.string(),
    titleTH: z.string().optional(),
    volume: z.number(),
    issue: z.number(),
    year: z.number(),
    publishDate: z.coerce.date(),
    coverImage: z.string().optional(),
    pdfUrl: z.string().optional(),
    articles: z
      .array(
        z.object({
          title: z.string(),
          authors: z.string(),
          pages: z.string().optional(),
        }),
      )
      .optional(),
  }),
});

export const collections = {
  news: newsCollection,
  events: eventsCollection,
  journal: journalCollection,
};
