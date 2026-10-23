// Rejected topics stay in memory for this job only, never in public diagnostics.
export async function fillDiscoverySlots(generate, existing = []) {
  const definitions = [], attempts = [], rejectedTopics = [];
  for (let attempt = 0; attempt < 3 && existing.length + definitions.length < 3; attempt++) {
    try {
      const additional = await generate([...existing, ...definitions], {
        feedback: attempts.at(-1) || null,
        rejectedTopics: [...rejectedTopics],
        onRejectedTopics: topics => {
          for (const topic of topics) if (!rejectedTopics.includes(topic)) rejectedTopics.push(topic);
        },
        onDiagnostics: result => attempts.push(result),
      });
      for (const item of additional) {
        if (existing.length + definitions.length >= 3) break;
        if (![...existing, ...definitions].some(old => old.id === item.id || old.truth === item.truth)) definitions.push(item);
      }
    } catch (error) {
      if (attempt === 0) throw error;
      break; // Optional retries must not discard already approved discoveries.
    }
  }
  return { definitions, attempts };
}
