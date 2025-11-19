/**
 * Pixiv URL parser utilities
 * Extracts IDs from various Pixiv URL formats
 */

export interface ParsedPixivUrl {
  type: 'illustration' | 'novel' | 'series' | 'user' | 'unknown';
  id?: number;
  seriesId?: number;
  userId?: string;
}

/**
 * Parse Pixiv URL and extract work ID
 * 
 * Supported URL formats:
 * - https://www.pixiv.net/artworks/{illustId}
 * - https://www.pixiv.net/en/artworks/{illustId} (with language code)
 * - https://www.pixiv.net/member_illust.php?mode=medium&illust_id={illustId} (legacy)
 * - https://www.pixiv.net/i/{illustId} (short format)
 * - https://www.pixiv.net/novel/show.php?id={novelId}
 * - https://www.pixiv.net/novel/series/{seriesId}
 * - https://www.pixiv.net/users/{userId}
 * - https://www.pixiv.net/users/{userId}/artworks/{illustId}
 * - https://www.pixiv.net/users/{userId}/novels/{novelId}
 * - https://pixiv.net/artworks/{illustId} (without www)
 * - Direct ID: {id} (treated as illustration)
 * 
 * @param url Pixiv URL or direct ID
 * @returns Parsed URL information or null if URL is invalid
 */
export function parsePixivUrl(url: string): ParsedPixivUrl | null {
  if (!url || typeof url !== 'string') {
    return null;
  }

  try {
    // Normalize URL: remove trailing slashes and whitespace
    const normalizedUrl = url.trim().replace(/\/+$/, '');
    
    // Check if it's just a numeric ID (treat as illustration)
    if (/^\d+$/.test(normalizedUrl)) {
      const id = parseInt(normalizedUrl, 10);
      if (!isNaN(id)) {
        return {
          type: 'illustration',
          id: id,
        };
      }
    }
    
    // Try to parse as URL
    let urlObj: URL;
    try {
      urlObj = new URL(normalizedUrl);
    } catch {
      // Try adding https:// prefix
      try {
        urlObj = new URL(`https://${normalizedUrl}`);
      } catch {
        // If still fails, try to extract ID from string directly
        return parseIdFromString(normalizedUrl);
      }
    }

    const hostname = urlObj.hostname.toLowerCase();
    const pathname = urlObj.pathname;
    const searchParams = urlObj.searchParams;

    // Check if it's a Pixiv domain (support pixiv.net and pixiv.org)
    if (!hostname.includes('pixiv.net') && !hostname.includes('pixiv.org')) {
      return null;
    }

    // Parse illustration URL: /artworks/{id} or /en/artworks/{id} or /zh-cn/artworks/{id}
    const illustMatch = pathname.match(/\/artworks\/(\d+)/);
    if (illustMatch) {
      const illustId = parseInt(illustMatch[1], 10);
      if (!isNaN(illustId)) {
        return {
          type: 'illustration',
          id: illustId,
        };
      }
    }

    // Parse short illustration URL: /i/{id}
    const shortIllustMatch = pathname.match(/^\/i\/(\d+)$/);
    if (shortIllustMatch) {
      const illustId = parseInt(shortIllustMatch[1], 10);
      if (!isNaN(illustId)) {
        return {
          type: 'illustration',
          id: illustId,
        };
      }
    }

    // Parse legacy illustration URL: /member_illust.php?illust_id={id}
    const illustIdParam = searchParams.get('illust_id');
    if (illustIdParam) {
      const illustId = parseInt(illustIdParam, 10);
      if (!isNaN(illustId)) {
        return {
          type: 'illustration',
          id: illustId,
        };
      }
    }

    // Parse novel URL: /novel/show.php?id={id}
    const novelMatch = pathname.match(/^\/novel\/show\.php$/);
    if (novelMatch) {
      const novelIdParam = urlObj.searchParams.get('id');
      if (novelIdParam) {
        const novelId = parseInt(novelIdParam, 10);
        if (!isNaN(novelId)) {
          return {
            type: 'novel',
            id: novelId,
          };
        }
      }
    }

    // Parse series URL: /novel/series/{id}
    const seriesMatch = pathname.match(/^\/novel\/series\/(\d+)$/);
    if (seriesMatch) {
      const seriesId = parseInt(seriesMatch[1], 10);
      if (!isNaN(seriesId)) {
        return {
          type: 'series',
          seriesId: seriesId,
        };
      }
    }

    // Parse user's artwork URL: /users/{userId}/artworks/{illustId}
    const userArtworkMatch = pathname.match(/\/users\/(\d+)\/artworks\/(\d+)/);
    if (userArtworkMatch) {
      const illustId = parseInt(userArtworkMatch[2], 10);
      if (!isNaN(illustId)) {
        return {
          type: 'illustration',
          id: illustId,
        };
      }
    }

    // Parse user's novel URL: /users/{userId}/novels/{novelId}
    const userNovelMatch = pathname.match(/\/users\/(\d+)\/novels\/(\d+)/);
    if (userNovelMatch) {
      const novelId = parseInt(userNovelMatch[2], 10);
      if (!isNaN(novelId)) {
        return {
          type: 'novel',
          id: novelId,
        };
      }
    }

    // Parse user URL: /users/{userId} (only user profile, no specific work)
    const userMatch = pathname.match(/^\/users\/(\d+)$/);
    if (userMatch) {
      const userId = userMatch[1];
      if (userId) {
        return {
          type: 'user',
          userId: userId,
        };
      }
    }

    return null;
  } catch (error) {
    // If any error occurs, try to extract ID from string
    return parseIdFromString(url);
  }
}

/**
 * Try to extract ID from string (fallback method)
 * Looks for numeric IDs in common patterns
 */
function parseIdFromString(str: string): ParsedPixivUrl | null {
  // Try to find illust ID pattern: artworks/{id}
  const illustMatch = str.match(/artworks[\/\s]+(\d+)/i);
  if (illustMatch) {
    const illustId = parseInt(illustMatch[1], 10);
    if (!isNaN(illustId)) {
      return {
        type: 'illustration',
        id: illustId,
      };
    }
  }

  // Try to find novel ID pattern: novel/show.php?id={id} or novel/{id}
  const novelMatch = str.match(/novel[\/\s]+(?:show\.php\?id=)?(\d+)/i);
  if (novelMatch) {
    const novelId = parseInt(novelMatch[1], 10);
    if (!isNaN(novelId)) {
      return {
        type: 'novel',
        id: novelId,
      };
    }
  }

  // Try to find series ID pattern: series/{id}
  const seriesMatch = str.match(/series[\/\s]+(\d+)/i);
  if (seriesMatch) {
    const seriesId = parseInt(seriesMatch[1], 10);
    if (!isNaN(seriesId)) {
      return {
        type: 'series',
        seriesId: seriesId,
      };
    }
  }

  // Try to find user ID pattern: users/{id}
  const userMatch = str.match(/users[\/\s]+(\d+)/i);
  if (userMatch) {
    const userId = userMatch[1];
    if (userId) {
      return {
        type: 'user',
        userId: userId,
      };
    }
  }

  // Last resort: try to find any large number (likely an ID)
  const numberMatch = str.match(/\b(\d{6,})\b/);
  if (numberMatch) {
    const id = parseInt(numberMatch[1], 10);
    if (!isNaN(id)) {
      // Assume it's an illustration ID (most common)
      return {
        type: 'illustration',
        id: id,
      };
    }
  }

  return null;
}

/**
 * Convert parsed URL to TargetConfig
 * @param parsed Parsed URL information
 * @param typeOverride Optional type override (if not specified, uses parsed type)
 * @returns TargetConfig object
 */
export function parsedUrlToTargetConfig(
  parsed: ParsedPixivUrl,
  typeOverride?: 'illustration' | 'novel'
): { type: 'illustration' | 'novel'; illustId?: number; novelId?: number; seriesId?: number; userId?: string; tag?: string } {
  const type = typeOverride || (parsed.type === 'series' ? 'novel' : parsed.type === 'illustration' ? 'illustration' : 'novel');
  
  if (parsed.type === 'user' && parsed.userId) {
    // For user URLs, default to illustration type, but allow override
    const userType = typeOverride || 'illustration';
    return {
      type: userType,
      userId: parsed.userId,
      tag: `user-${parsed.userId}`,
    };
  } else if (parsed.type === 'series') {
    return {
      type: 'novel',
      seriesId: parsed.seriesId,
      tag: `series-${parsed.seriesId}`,
    };
  } else if (parsed.type === 'novel' && parsed.id) {
    return {
      type: 'novel',
      novelId: parsed.id,
      tag: `novel-${parsed.id}`,
    };
  } else if (parsed.type === 'illustration' && parsed.id) {
    return {
      type: 'illustration',
      illustId: parsed.id,
      tag: `illust-${parsed.id}`,
    };
  } else if (parsed.id) {
    // Fallback: use the ID with the specified type
    if (type === 'illustration') {
      return {
        type: 'illustration',
        illustId: parsed.id,
        tag: `illust-${parsed.id}`,
      };
    } else {
      return {
        type: 'novel',
        novelId: parsed.id,
        tag: `novel-${parsed.id}`,
      };
    }
  }

  throw new Error('Invalid parsed URL: missing ID or userId');
}

