/**
 * Deterministic, explainable clustering: TF-IDF vectors, a leader pass, a
 * centroid-merge pass, then reassignment. Same input, same output, no model.
 */
import type { Quote, Source } from "../types.js";
import { addInto, cosine, features, normalizeVector, Tfidf, tokenize, topTerms, type Vector } from "./text.js";

export interface Cluster {
  quoteIds: string[];
  centroid: Vector;
  keywords: string[];
}

export interface QuoteVectors {
  vectors: Map<string, Vector>;
  surface: Map<string, string>;
  tfidf: Tfidf;
}

/**
 * Vectorise quotes. A quote from a GitHub issue or ticket also gets a little of
 * its source title, since "it" in a body sentence usually means the title's topic.
 */
export function vectorize(quotes: Quote[], sources: Map<string, Source>): QuoteVectors {
  const surface = new Map<string, string>();
  const docs = new Map<string, { own: string[]; context: string[] }>();
  for (const q of quotes) {
    const t = tokenize(q.text);
    for (const [k, v] of t.surface) if (!surface.has(k)) surface.set(k, v);
    const src = sources.get(q.sourceId);
    let context: string[] = [];
    if (src && (src.kind === "issue" || src.kind === "ticket") && src.title && !q.text.startsWith(src.title)) {
      context = features(tokenize(src.title).stems);
    }
    docs.set(q.id, { own: features(t.stems), context });
  }
  const tfidf = new Tfidf([...docs.values()].map((d) => d.own));
  const vectors = new Map<string, Vector>();
  for (const [id, d] of docs) {
    const v = tfidf.vector(d.own);
    if (d.context.length) tfidf.vector(d.context, 0.6, v);
    vectors.set(id, normalizeVector(v));
  }
  return { vectors, surface, tfidf };
}

function centroidOf(ids: string[], vectors: Map<string, Vector>): Vector {
  const c: Vector = new Map();
  for (const id of ids) addInto(c, vectors.get(id) ?? new Map());
  return normalizeVector(c);
}

export interface ClusterOptions {
  /** Minimum cosine similarity to a cluster centroid to join it. */
  similarity: number;
  /** Centroid similarity above which two clusters merge. */
  merge?: number;
}

export function clusterQuotes(quotes: Quote[], qv: QuoteVectors, options: ClusterOptions): Cluster[] {
  const tau = options.similarity;
  const mergeAt = options.merge ?? Math.min(0.62, tau * 2.1);
  const ordered = [...quotes].sort((a, b) => b.intensity - a.intensity || a.id.localeCompare(b.id, "en", { numeric: true }));

  // 1. Leader pass.
  let clusters: { ids: string[]; centroid: Vector }[] = [];
  for (const q of ordered) {
    const v = qv.vectors.get(q.id)!;
    if (v.size === 0) {
      clusters.push({ ids: [q.id], centroid: v });
      continue;
    }
    let best = -1;
    let bestSim = 0;
    clusters.forEach((c, i) => {
      const s = cosine(v, c.centroid);
      if (s > bestSim) {
        bestSim = s;
        best = i;
      }
    });
    if (best >= 0 && bestSim >= tau) {
      const c = clusters[best]!;
      c.ids.push(q.id);
      c.centroid = centroidOf(c.ids, qv.vectors);
    } else {
      clusters.push({ ids: [q.id], centroid: new Map(v) });
    }
  }

  // 2. Merge clusters whose centroids are close.
  for (let changed = true, sweeps = 0; changed && sweeps < 6; sweeps++) {
    changed = false;
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; ) {
        if (cosine(clusters[i]!.centroid, clusters[j]!.centroid) >= mergeAt) {
          const ids = [...clusters[i]!.ids, ...clusters[j]!.ids];
          clusters[i] = { ids, centroid: centroidOf(ids, qv.vectors) };
          clusters.splice(j, 1);
          changed = true;
        } else {
          j++;
        }
      }
    }
  }

  // 3. Reassign every quote to its nearest centroid (two rounds, k-means style).
  for (let round = 0; round < 2; round++) {
    const multi = clusters.filter((c) => c.ids.length > 1);
    if (!multi.length) break;
    const assigned = new Map<number, string[]>();
    const loners: string[] = [];
    for (const q of ordered) {
      const v = qv.vectors.get(q.id)!;
      let best = -1;
      let bestSim = 0;
      multi.forEach((c, i) => {
        const s = cosine(v, c.centroid);
        if (s > bestSim) {
          bestSim = s;
          best = i;
        }
      });
      if (best >= 0 && bestSim >= tau * 0.85) assigned.set(best, [...(assigned.get(best) ?? []), q.id]);
      else loners.push(q.id);
    }
    clusters = [
      ...[...assigned.values()].map((ids) => ({ ids, centroid: centroidOf(ids, qv.vectors) })),
      ...loners.map((id) => ({ ids: [id], centroid: new Map(qv.vectors.get(id)!) })),
    ];
  }

  return clusters.map((c) => ({
    quoteIds: c.ids,
    centroid: c.centroid,
    keywords: topTerms(c.centroid, 6).map((t) => surfaceOf(t, qv.surface)),
  }));
}

export function surfaceOf(term: string, surface: Map<string, string>): string {
  return term
    .split("_")
    .map((p) => surface.get(p) ?? p)
    .join(" ");
}

/** Group opportunity centroids into broader themes. */
export function themesFor(centroids: Vector[], surface: Map<string, string>, similarity = 0.16): string[] {
  const groups: { members: number[]; centroid: Vector }[] = [];
  centroids.forEach((c, i) => {
    let best = -1;
    let bestSim = 0;
    groups.forEach((g, gi) => {
      const s = cosine(c, g.centroid);
      if (s > bestSim) {
        bestSim = s;
        best = gi;
      }
    });
    if (best >= 0 && bestSim >= similarity) {
      const g = groups[best]!;
      g.members.push(i);
      const sum: Vector = new Map();
      for (const m of g.members) addInto(sum, centroids[m]!);
      g.centroid = normalizeVector(sum);
    } else {
      groups.push({ members: [i], centroid: new Map(c) });
    }
  });
  const labels = new Array<string>(centroids.length);
  for (const g of groups) {
    // A theme label is its strongest single word, title-cased.
    const unigram = topTerms(g.centroid, 12).find((t) => !t.includes("_")) ?? topTerms(g.centroid, 1)[0] ?? "general";
    const word = surfaceOf(unigram, surface);
    const label = word.charAt(0).toUpperCase() + word.slice(1);
    for (const m of g.members) labels[m] = label;
  }
  return labels;
}
