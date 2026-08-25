-- about_sections never got the bilingual _en columns every other content
-- table has (exhibition_companies, parks, ...), so admin-entered About page
-- content (the director/deputy foreword statements) had no English variant
-- at all — the public page always showed the Persian text regardless of UI
-- language, since there was nothing to pick even if it wanted to.
ALTER TABLE about_sections ADD COLUMN IF NOT EXISTS title_en text;
ALTER TABLE about_sections ADD COLUMN IF NOT EXISTS body_en text;

-- Backfill English translations for the two existing sections (the ICT Park
-- director's foreword and the Market Development deputy's foreword).
UPDATE about_sections SET body_en =
'Information and communications technology today is not merely a vehicle for economic development, but a strategic foundation for the knowledge-based economy, productivity, and international engagement. The ICT Park, with its mission of supporting innovative and technology-driven companies, has created the conditions for their growth, synergy, and effective presence in domestic and global markets. This comprehensive atlas of the Park''s companies has been compiled to showcase the capabilities, products, and services of this ecosystem in fields such as software, communication infrastructure, artificial intelligence, cybersecurity, and digital services. Publishing this atlas in two languages is a step toward strengthening technological collaboration, facilitating international communication, and presenting the export capacity of these companies to regional and global audiences. These achievements are the result of the efforts of the managers and specialists of the Park''s member companies. I am also grateful for the cooperation of the ICT Park''s Market Development Deputy and everyone involved in compiling this atlas. I hope that this work will serve as a bridge for the development of technological, commercial, and international collaboration in the field of information and communications technology.
Dr. Mostafa Mafi
Director of the ICT Park'
WHERE id = 'cca9c27c-e02b-4527-b6d2-6f0036bf4326';

UPDATE about_sections SET body_en =
'In the Name of God, the Most Compassionate, the Most Merciful
Through divine grace and the dedicated efforts of those active in the country''s ICT ecosystem, we are honored today to present the "Atlas of ICT Park Companies" to the country''s technology and innovation community.

The ICT Park is today home to knowledge-based and creative companies working across various fields of information and communications technology (ICT), each of which — drawing on knowledge, innovation, and valuable human capital — holds remarkable potential for technological development, value creation, and meeting the needs of the country and international markets.

A significant portion of these capabilities had, until now, remained largely unseen by economic actors, investors, and end users, owing to limited platforms for introduction and networking. This atlas has been prepared to comprehensively, transparently, and purposefully introduce these capabilities, so as to familiarize the players of the innovation ecosystem, industry, investment, and market with the capabilities of the Park''s member companies, and to pave the way for effective and lasting collaboration.

The Market Development Deputy has always stood alongside member companies, regarding its core mission as market development, building intelligent collaboration networks, facilitating the commercialization of technology, and supporting the entry of innovative products and services into domestic and international markets. We believe that the innovation cycle cannot reach its desired point without successful commercialization and market presence; accordingly, standing by companies through every stage of business development — from showcasing their capabilities to securing a deserved place in the market — is among this Deputy''s most important missions.

It is hoped that the publication of this atlas, while better introducing the valuable capabilities of the Park''s member companies, will pave the way for the development of technological collaboration, investment attraction, expanded commercial engagement, and an increased share of Iranian technological products and services in domestic and international markets.

In closing, I consider it my duty to sincerely thank all the respected companies who, in trusting the ICT Park, provided their information and documentation to the Market Development Deputy for the preparation of this atlas. I am likewise sincerely grateful to all the dedicated colleagues and experts of the Market Development Deputy, who through their commitment, precision, and round-the-clock effort made the compilation and publication of this valuable collection possible.

I hope that this atlas marks the beginning of a new chapter of engagement, synergy, market development, and ever-greater flourishing for Iran''s ICT ecosystem.

Dr. Seyed Mojtaba Hosseinzadeh
Deputy for Market Development
ICT Park'
WHERE id = '625f24f7-54ef-4fa5-b371-d255452f7184';
