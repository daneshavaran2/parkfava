/**
 * The shape of scripts/atlas-data.json — the canonical, committed record of
 * every exhibition company's booklet content, from which the SQL migrations
 * are generated.
 *
 * Persian fields are the primary content; every `*_en` field is the English
 * the company itself supplied on the English booklet form. Both are
 * authoritative: the migrations write both.
 */

export type AtlasProduct = {
  name: string;
  description: string;
  name_en?: string | null;
  description_en?: string | null;
  /**
   * The name this product had before a booklet form renamed it. Kept so the
   * generated migration can still find the existing row (and its image) in a
   * database that was populated from the older atlas data.
   */
  legacy_name?: string | null;
};

export type AtlasCompany = {
  name: string;
  /** Page range in the source atlas PDF; absent for companies added from booklet forms. */
  page_start?: number;
  page_end?: number;
  founded_year: number | null;
  activity_domain: string | null;
  intro: string;
  website: string | null;
  email: string | null;
  phone: string | null;
  name_en: string | null;
  founders: string | null;
  headcount_full_time: number | null;
  headcount_part_time: number | null;
  flagship_product: string | null;
  export_potential: string | null;
  products: AtlasProduct[];
  activity_domain_en?: string | null;
  intro_en?: string | null;
  founders_en?: string | null;
  flagship_product_en?: string | null;
  export_potential_en?: string | null;
};
