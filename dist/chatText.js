export function normalizeText(value) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}
export function includesWholePhrase(messageNormalized, phraseNormalized) {
    if (!messageNormalized || !phraseNormalized) {
        return false;
    }
    return ` ${messageNormalized} `.includes(` ${phraseNormalized} `);
}
export function extractQuotedPhrases(message) {
    const matches = [...message.matchAll(/["']([^"']{2,})["']/g)];
    return matches
        .map((match) => normalizeText(match[1] ?? ""))
        .filter((value) => value.length >= 2);
}
export function extractJobId(message) {
    const match = message.match(/\bjob\s+(\d+)\b/i);
    return match ? Number(match[1]) : null;
}
export function extractTempId(message) {
    const match = message.match(/\btemp\s+(\d+)\b/i);
    return match ? Number(match[1]) : null;
}
export function isAssignIntent(normalized) {
    return (normalized.includes("assign") ||
        normalized.includes("put them on") ||
        normalized.includes("put temp") ||
        normalized.includes("book them"));
}
export function isUnassignIntent(normalized) {
    return (normalized.includes("unassign") ||
        normalized.includes("remove them") ||
        normalized.includes("remove temp") ||
        normalized.includes("clear assignment") ||
        normalized.includes("take them off"));
}
export function isJobDetailsIntent(normalized) {
    return (normalized.includes("show details for this job") ||
        normalized.includes("show job details") ||
        normalized.includes("job details") ||
        normalized.includes("show details for job"));
}
export function isTempDetailsIntent(normalized) {
    return normalized.includes("show temp") && normalized.includes("details");
}
export function isAvailableTempsIntent(normalized) {
    return (normalized.includes("show available temps") ||
        normalized.includes("available temps") ||
        normalized.includes("who is available"));
}
export function isBestTempIntent(normalized) {
    return (normalized.includes("suggest the best temp") ||
        normalized.includes("best temp") ||
        normalized.includes("who should take this"));
}
export function isAvailabilityExplanationIntent(normalized) {
    return (normalized.includes("why is temp") ||
        normalized.includes("why are they unavailable") ||
        normalized.includes("can they take this job") ||
        normalized.includes("why unavailable"));
}
export function uniqueById(items) {
    const seen = new Set();
    const results = [];
    for (const item of items) {
        if (seen.has(item.id)) {
            continue;
        }
        seen.add(item.id);
        results.push(item);
    }
    return results;
}
