-- Add operating_regions column to recruiter_sites
-- NULL means national/all regions, otherwise array of region names
ALTER TABLE recruiter_sites
ADD COLUMN IF NOT EXISTS operating_regions text[] DEFAULT NULL;
