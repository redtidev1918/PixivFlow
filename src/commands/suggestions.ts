/**
 * Command suggestion system using Levenshtein distance
 */

/**
 * Calculate Levenshtein distance between two strings
 * Used for finding similar command names
 */
export function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = [];

  // Initialize matrix
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[len1][len2];
}

/**
 * Find similar command names
 * @param input User input
 * @param commandNames Available command names
 * @param maxSuggestions Maximum number of suggestions to return
 * @param threshold Maximum distance threshold
 * @returns Array of suggested command names
 */
export function findSimilarCommands(
  input: string,
  commandNames: string[],
  maxSuggestions: number = 3,
  threshold: number = 3
): string[] {
  if (!input || commandNames.length === 0) {
    return [];
  }

  const inputLower = input.toLowerCase();
  const suggestions: Array<{ name: string; distance: number }> = [];

  for (const name of commandNames) {
    const nameLower = name.toLowerCase();
    
    // Exact match - no suggestions needed
    if (nameLower === inputLower) {
      return [];
    }

    // Check if it starts with the input
    if (nameLower.startsWith(inputLower)) {
      suggestions.push({ name, distance: 0 });
      continue;
    }

    // Calculate Levenshtein distance
    const distance = levenshteinDistance(inputLower, nameLower);
    if (distance <= threshold) {
      suggestions.push({ name, distance });
    }
  }

  // Sort by distance (ascending) and return top matches
  return suggestions
    .sort((a, b) => a.distance - b.distance)
    .slice(0, maxSuggestions)
    .map((s) => s.name);
}

/**
 * Format command suggestions for display
 */
export function formatSuggestions(suggestions: string[]): string {
  if (suggestions.length === 0) {
    return '';
  }

  if (suggestions.length === 1) {
    return `\n💡 Did you mean: ${suggestions[0]}?`;
  }

  return `\n💡 Did you mean one of these?\n${suggestions.map((s) => `   • ${s}`).join('\n')}`;
}
