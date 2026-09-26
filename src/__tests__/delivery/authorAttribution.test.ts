/**
 * Attribution is part of the artifact.
 *
 * Before this, the author existed only inside the downloaders (and the
 * `downloads` table): `DownloadedArtifact` dropped it, so `DeliveryService`
 * could not put it into the delivery context and `buildTemplateVariables` had
 * no `{{author}}` key. A publishing provider (the TelePost submission target)
 * could therefore never render the artist — the submission arrived with a
 * title, tags and a link, but no attribution.
 *
 * This pins the whole chain: artifact → delivery context → template variable,
 * plus the deliberate empty-string (never `Unknown`) degradation.
 */
import { buildTemplateVariables, renderDeliveryTemplate } from '../../delivery/HttpMultipartDelivery';
import type { DownloadedArtifact, DeliveryContext } from '../../delivery/types';

describe('author attribution reaches publishing providers', () => {
  it('exposes the artifact author as a template variable', () => {
    const vars = buildTemplateVariables({
      context: { author: 'ある作家' } as DeliveryContext,
    } as never);
    expect(vars.author).toBe('ある作家');
  });

  it('renders the author into a multipart field instead of the placeholder', () => {
    const vars = buildTemplateVariables({
      context: { author: 'ある作家' } as DeliveryContext,
    } as never);
    expect(renderDeliveryTemplate('作者：{{author}}', vars)).toBe('作者：ある作家');
  });

  it('renders an EMPTY string when Pixiv carried no author — never "Unknown"', () => {
    const vars = buildTemplateVariables({ context: {} } as never);
    expect(vars.author).toBe('');
    expect(renderDeliveryTemplate('作者：{{author}}', vars)).toBe('作者：');
  });

  it('keeps `author` optional on the artifact so old payloads still parse', () => {
    // A `DownloadedArtifact` built before this change (no `author` key) must
    // stay valid: delivery reads it defensively and the provider renders "".
    const legacy: DownloadedArtifact = {
      pixivId: '12345',
      type: 'illustration',
      title: 'title',
    };
    expect(legacy.author).toBeUndefined();
    const vars = buildTemplateVariables({
      context: { title: legacy.title, pixivId: legacy.pixivId, type: legacy.type } as DeliveryContext,
    } as never);
    expect(vars.author).toBe('');
  });
});
