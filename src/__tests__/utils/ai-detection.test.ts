import {
  isAIGeneratedByTags,
  isAIIllustration,
  detectAiFileMetadata,
} from '../../utils/ai-detection';

describe('isAIGeneratedByTags', () => {
  it('detects Japanese AI tags on object tag arrays', () => {
    const work = { tags: [{ name: '生成AI' }, { name: '女の子' }] };
    expect(isAIGeneratedByTags(work)).toBe(true);
  });

  it('detects AI生成 tag', () => {
    expect(isAIGeneratedByTags({ tags: [{ name: 'AI生成' }] })).toBe(true);
  });

  it('detects English AI tags case-insensitively', () => {
    expect(isAIGeneratedByTags({ tags: [{ name: 'Generative AI' }] })).toBe(true);
    expect(isAIGeneratedByTags({ tags: [{ name: 'AI-generated' }] })).toBe(true);
    expect(isAIGeneratedByTags({ tags: [{ name: 'aiGenerated' }] })).toBe(true);
  });

  it('uses translated_name when name is not a match', () => {
    const work = { tags: [{ name: 'ラフ', translated_name: 'AI生成' }] };
    expect(isAIGeneratedByTags(work)).toBe(true);
  });

  it('accepts plain string arrays', () => {
    expect(isAIGeneratedByTags({ tags: ['ミク', 'AI生成'] })).toBe(true);
    expect(isAIGeneratedByTags({ tags: ['ミク', '生成AI', 'オリジナル'] })).toBe(true);
  });

  it('is false for human works and edge inputs', () => {
    expect(isAIGeneratedByTags({ tags: [{ name: 'オリジナル' }, { name: 'ミク' }] })).toBe(false);
    expect(isAIGeneratedByTags({ tags: [] })).toBe(false);
    expect(isAIGeneratedByTags({})).toBe(false);
    expect(isAIGeneratedByTags(undefined)).toBe(false);
  });

  it('does not false-positive on bare "ai" or unrelated tags', () => {
    expect(isAIGeneratedByTags({ tags: [{ name: 'ai' }, { name: 'イラスト' }] })).toBe(false);
    expect(isAIGeneratedByTags({ tags: [{ name: 'オリジナル' }] })).toBe(false);
  });
});

describe('isAIIllustration', () => {
  it('accepts the official Pixiv flag', () => {
    expect(isAIIllustration({ illust_ai_type: 2 })).toBe(true);
  });

  it('keeps 0/1 as non-AI unless tags say otherwise', () => {
    expect(isAIIllustration({ illust_ai_type: 0 })).toBe(false);
    expect(isAIIllustration({ illust_ai_type: 1 })).toBe(false);
  });

  it('falls back to tag detection when the flag is missing', () => {
    expect(isAIIllustration({ tags: [{ name: '生成AI' }] })).toBe(true);
    expect(isAIIllustration({ tags: [{ name: 'オリジナル' }] })).toBe(false);
  });
});

describe('detectAiFileMetadata', () => {
  it('detects Stable Diffusion PNG tEXt parameters', () => {
    const png = Buffer.from(
      '\x89PNG\r\n\x1a\n' + 'tEXtparameters=Steps: 20, Sampler: Euler, CFG scale: 7',
      'latin1'
    );
    expect(detectAiFileMetadata(png)).toBe(true);
  });

  it('detects NovelAI EXIF-style markers', () => {
    expect(detectAiFileMetadata(Buffer.from('...Software: NovelAI, Comment...', 'latin1'))).toBe(true);
    expect(detectAiFileMetadata(Buffer.from('...novelai...', 'latin1'))).toBe(true);
  });

  it('detects stable diffusion markers case-insensitively', () => {
    expect(detectAiFileMetadata(Buffer.from('Stable Diffusion v1.5', 'latin1'))).toBe(true);
    expect(detectAiFileMetadata(Buffer.from('STABLEDIFFUSION', 'latin1'))).toBe(true);
  });

  it('is false for clean image bytes', () => {
    const clean = Buffer.concat([
      Buffer.from('\x89PNG\r\n\x1a\n'),
      Buffer.alloc(4096, 0x42),
    ]);
    expect(detectAiFileMetadata(clean)).toBe(false);
  });

  it('is false for empty buffers and scans only the bounded head', () => {
    expect(detectAiFileMetadata(Buffer.alloc(0))).toBe(false);
    // marker beyond the 2 MiB head is not read
    const big = Buffer.alloc(3 * 1024 * 1024, 0x41);
    big.write('novelai', 2 * 1024 * 1024 + 100);
    expect(detectAiFileMetadata(big)).toBe(false);
  });
});
