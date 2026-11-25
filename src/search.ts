import type { Store } from "./store.js";
import type { Quote } from "./types.js";
import { cosine, features, normalizeVector, Tfidf, tokenize } from "./synthesize/text.js";

export interface SearchHit {
  quote: Quote;
  score: number;
}

/** TF-IDF search over quotes, with a substring boost for exact phrases. */
export function searchQuotes(store: Store, query: string, limit = 10): SearchHit[] {
  const docs = store.quotes.map((q) => features(tokenize(q.text).stems));
  const tfidf = new Tfidf(docs);
  const qStems = features(tokenize(query).stems);
  const qv = new Map<string, number>();
  for (const t of qStems) qv.set(t, (qv.get(t) ?? 0) + tfidf.idf(t));
  normalizeVector(qv);
  const needle = query.trim().toLowerCase();
  const hits: SearchHit[] = [];
  store.quotes.forEach((q, i) => {
    const v = new Map<string, number>();
    const tf = new Map<string, number>();
    for (const t of docs[i]!) tf.set(t, (tf.get(t) ?? 0) + 1);
    for (const [t, n] of tf) v.set(t, (1 + Math.log(n)) * tfidf.idf(t));
    normalizeVector(v);
    let score = cosine(qv, v);
    if (needle.length > 2 && q.text.toLowerCase().includes(needle)) score += 0.5;
    if (score > 0.05) hits.push({ quote: q, score });
  });
  return hits.sort((a, b) => b.score - a.score || a.quote.id.localeCompare(b.quote.id)).slice(0, limit);
}
