ALTER TABLE public.exhibition_companies
  ADD CONSTRAINT exhibition_companies_latitude_valid
    CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90)),
  ADD CONSTRAINT exhibition_companies_longitude_valid
    CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180));