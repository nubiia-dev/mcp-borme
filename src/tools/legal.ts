import { OpenMercantilClient, encodePathSegment as seg } from '../openmercantil-client.js';
import { cleanResponse } from '../domain/shape.js';
import {
  emptySchema,
  getActMapSchema,
  getLegalArticleSchema,
  getLegalNormSchema,
} from '../validation.js';
import { defineTool } from './define.js';

/**
 * Spanish mercantile-law reference (consolidated BOE texts, re-used under Ley
 * 37/2007). Informational only, not legal advice; the official version is
 * always boe.es.
 */
export function getLegalTools(client: OpenMercantilClient) {
  return {
    borme_list_legal_norms: defineTool({
      description:
        'Catalogue of the core Spanish mercantile-law norms (Código de Comercio, Ley de ' +
        'Sociedades de Capital, Reglamento del Registro Mercantil, concursal law...) with slug, ' +
        'short name, type and whether in force. Start here to find the `slug` used by ' +
        'borme_get_legal_norm and borme_get_legal_article. Informational, not legal advice.',
      schema: emptySchema,
      handler: async () => cleanResponse(await client.get('/api/v1/legal/norms')),
    }),

    borme_get_legal_norm: defineTool({
      description:
        'One norm: BOE/ELI identification, its key articles (with a flag for seeded ' +
        'consolidated text) and the BORME act types it governs. Informational, not legal advice; ' +
        'the official text is on boe.es.',
      schema: getLegalNormSchema,
      handler: async (args) =>
        cleanResponse(await client.get(`/api/v1/legal/norm/${seg(args.slug)}`)),
    }),

    borme_get_legal_article: defineTool({
      description:
        'Consolidated text (`body_html`) of one article of a norm, with its ELI anchor and ' +
        'version date. Article numbers join bis/ter with a hyphen ("160-bis"). Informational, ' +
        'not legal advice; the official text is on boe.es.',
      schema: getLegalArticleSchema,
      handler: async (args) =>
        cleanResponse(await client.get(`/api/v1/legal/article/${seg(args.norm)}/${seg(args.n)}`)),
    }),

    borme_get_act_map: defineTool({
      description:
        'Which law governs which BORME act type: maps registry act types (constitución, ' +
        'nombramiento, ampliación de capital, disolución, concurso...) to the norm and articles ' +
        'that regulate them. Without `acto` returns the full map (about 11 KB); with `acto` one ' +
        'mapping. Use it to answer "what law governs this registry act". Not legal advice.',
      schema: getActMapSchema,
      handler: async (args) =>
        cleanResponse(
          await client.get(
            args.acto ? `/api/v1/legal/act-map/${seg(args.acto)}` : '/api/v1/legal/act-map'
          )
        ),
    }),
  };
}
